import ctypes
import os
import platform
import re
import shutil
import subprocess
import time
from pathlib import Path
try:
    import winreg
except ImportError:
    winreg = None
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import admin_required, get_current_admin
from app.core import security
from app.core.config import ICONS_DIR
from app.database import get_db
from app import models, schemas
from app.schemas.link import LinkPaginationOut

router = APIRouter(prefix="/api/admin", tags=["Admin"])

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def format_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def get_memory_info() -> dict:
    system_name = platform.system().lower()

    if system_name == "windows":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        memory_status = MemoryStatus()
        memory_status.dwLength = ctypes.sizeof(MemoryStatus)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory_status))
        total = int(memory_status.ullTotalPhys)
        available = int(memory_status.ullAvailPhys)
    else:
        meminfo = Path("/proc/meminfo")
        if meminfo.exists():
            info_map = {}
            for line in meminfo.read_text(encoding="utf-8").splitlines():
                key, value = line.split(":", 1)
                info_map[key] = int(value.strip().split()[0]) * 1024
            total = info_map.get("MemTotal", 0)
            available = info_map.get("MemAvailable", info_map.get("MemFree", 0))
        else:
            total = 0
            available = 0

    used = max(total - available, 0)
    usage_percent = round((used / total) * 100, 1) if total else 0
    return {
        "total": format_bytes(total),
        "used": format_bytes(used),
        "available": format_bytes(available),
        "usage_percent": usage_percent,
    }


def get_disk_info() -> dict:
    usage = shutil.disk_usage(PROJECT_ROOT.drive or PROJECT_ROOT)
    used = usage.total - usage.free
    usage_percent = round((used / usage.total) * 100, 1) if usage.total else 0
    return {
        "total": format_bytes(usage.total),
        "used": format_bytes(used),
        "free": format_bytes(usage.free),
        "usage_percent": usage_percent,
    }


def get_version() -> str:
    version_file = PROJECT_ROOT / "VERSION"
    if version_file.exists():
        return version_file.read_text(encoding="utf-8").lstrip('\ufeff').strip()
    return "unknown"


def get_cpu_usage_percent(interval: float = 0.12) -> float:
    system_name = platform.system().lower()

    if system_name == 'windows':
        class FileTime(ctypes.Structure):
            _fields_ = [('dwLowDateTime', ctypes.c_ulong), ('dwHighDateTime', ctypes.c_ulong)]

        def filetime_to_int(file_time: FileTime) -> int:
            return (file_time.dwHighDateTime << 32) | file_time.dwLowDateTime

        def read_times() -> tuple[int, int, int]:
            idle_time = FileTime()
            kernel_time = FileTime()
            user_time = FileTime()
            ctypes.windll.kernel32.GetSystemTimes(
                ctypes.byref(idle_time),
                ctypes.byref(kernel_time),
                ctypes.byref(user_time),
            )
            return (
                filetime_to_int(idle_time),
                filetime_to_int(kernel_time),
                filetime_to_int(user_time),
            )

        idle_1, kernel_1, user_1 = read_times()
        time.sleep(interval)
        idle_2, kernel_2, user_2 = read_times()
        idle_delta = idle_2 - idle_1
        total_delta = (kernel_2 - kernel_1) + (user_2 - user_1)
        if total_delta <= 0:
            return 0.0
        return round((1 - idle_delta / total_delta) * 100, 1)

    stat_file = Path('/proc/stat')
    if stat_file.exists():
        def read_cpu_times() -> list[int]:
            first_line = stat_file.read_text(encoding='utf-8').splitlines()[0]
            return [int(value) for value in first_line.split()[1:]]

        times_1 = read_cpu_times()
        time.sleep(interval)
        times_2 = read_cpu_times()
        idle_delta = (times_2[3] + times_2[4]) - (times_1[3] + times_1[4]) if len(times_2) > 4 else times_2[3] - times_1[3]
        total_delta = sum(times_2) - sum(times_1)
        if total_delta <= 0:
            return 0.0
        return round((1 - idle_delta / total_delta) * 100, 1)

    return 0.0


def normalize_cpu_brand(brand: str) -> str:
    if not brand:
        return "Unknown"

    patterns = [
        r"(i[3579]-\d{4,5}[A-Z]{0,2})",
        r"(Ultra\s+[3579]\s+\d{3}[A-Z]{0,2})",
        r"(Ryzen\s+[3579]\s+\d{4,5}[A-Z]{0,2}(?:3D)?)",
        r"(Ryzen\s+Threadripper\s+\d{4,5}[A-Z]{0,2})",
        r"(EPYC\s+\d{3,4})",
        r"(Xeon\s+[A-Z]?-?\d{4,5}[A-Z0-9-]*)",
        r"(M[1234](?:\s+(?:Pro|Max|Ultra))?)",
        r"(A\d{2}(?:X|Z)?)",
    ]

    for pattern in patterns:
        match = re.search(pattern, brand, flags=re.IGNORECASE)
        if match:
            return match.group(1).replace('  ', ' ').strip()

    cleaned = re.sub(r"\s+CPU.*$", "", brand, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+@.*$", "", cleaned)
    cleaned = re.sub(r"\(R\)|\(TM\)|\(C\)", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def get_cpu_brand_string() -> str:
    system_name = platform.system().lower()

    if system_name == 'windows' and winreg is not None:
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
                value, _ = winreg.QueryValueEx(key, 'ProcessorNameString')
                return str(value).strip()
        except OSError:
            pass

    if system_name == 'linux':
        cpuinfo = Path('/proc/cpuinfo')
        if cpuinfo.exists():
            for line in cpuinfo.read_text(encoding='utf-8', errors='ignore').splitlines():
                if ':' in line:
                    key, value = line.split(':', 1)
                    if key.strip().lower() in {'model name', 'hardware'}:
                        return value.strip()

    if system_name == 'darwin':
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'machdep.cpu.brand_string'],
                capture_output=True,
                text=True,
                check=True,
                timeout=2,
            )
            brand = result.stdout.strip()
            if brand:
                return brand
        except Exception:
            pass
        try:
            result = subprocess.run(
                ['sysctl', '-n', 'machdep.cpu.brand_string'],
                capture_output=True,
                text=True,
                check=True,
                timeout=2,
            )
            return result.stdout.strip()
        except Exception:
            pass

    return platform.processor() or 'Unknown'


def get_cpu_model() -> str:
    return normalize_cpu_brand(get_cpu_brand_string())


@router.post("/login")
async def admin_login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = (
        db.query(models.User).filter(models.User.username == form_data.username).first()
    )
    if not user or not security.verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="管理员账号或密码错误"
        )

    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="拒绝访问：该账户非管理员"
        )

    access_token = security.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/config")
async def get_config(
    db: Session = Depends(get_db), admin: models.User = Depends(admin_required)
):
    configs = db.query(models.SystemConfig).all()

    cfg_dict = {c.key: c.value for c in configs}

    return {
        "registration_open": cfg_dict.get("registration_open") == "true",
        "site_title": cfg_dict.get("site_title", ""),
        "favicon_api": cfg_dict.get("favicon_api", ""),
    }


@router.get("/system-info")
async def get_system_info(
    db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)
):
    cfg_dict = {
        item.key: item.value
        for item in db.query(models.SystemConfig)
        .filter(models.SystemConfig.key.in_(["site_title"]))
        .all()
    }

    os_name = platform.system()
    os_version = platform.version() if os_name == "Windows" else platform.release()

    return {
        "version": get_version(),
        "site_title": cfg_dict.get("site_title", "OnePanel"),
        "system": {
            "name": os_name,
            "version": os_version,
            "platform": platform.platform(),
        },
        "cpu": {
            "architecture": platform.machine(),
            "logical_cores": os.cpu_count() or 0,
            "processor": get_cpu_brand_string(),
            "model": get_cpu_model(),
            "usage_percent": get_cpu_usage_percent(),
        },
        "memory": get_memory_info(),
        "disk": get_disk_info(),
    }


@router.post("/config/registration")
async def toggle_registration(
    open: bool,
    db: Session = Depends(get_db),
    admin: models.User = Depends(admin_required),
):
    reg_cfg = (
        db.query(models.SystemConfig)
        .filter(models.SystemConfig.key == "registration_open")
        .first()
    )
    val_str = "true" if open else "false"

    if reg_cfg:
        reg_cfg.value = val_str
    else:
        reg_cfg = models.SystemConfig(key="registration_open", value=val_str)
        db.add(reg_cfg)

    db.commit()
    return {"status": "success", "registration_open": open}


@router.post("/config/site-info")
async def update_site_info(
    site_title: Optional[str] = Form(None),
    favicon_api: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    admin: models.User = Depends(admin_required),
):
    try:
        if site_title:
            db.query(models.SystemConfig).filter(
                models.SystemConfig.key == "site_title"
            ).update({"value": site_title})

        if favicon_api:
            db.query(models.SystemConfig).filter(
                models.SystemConfig.key == "favicon_api"
            ).update({"value": favicon_api})

        db.commit()
        return {"msg": "更新成功"}
    except Exception as e:
        db.rollback()
        print(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail="数据库繁忙，请稍后再试")


@router.post("/config/assets")
async def update_static_assets(
    file: UploadFile = File(...),
    asset_type: str = Form(...),
    db: Session = Depends(get_db),
    admin: models.User = Depends(admin_required),
):
    file_map = {
        "background": "default_bg.jpg",
        "default_error": "default_error.jpg",
        "default_link": "default_link.jpg",
    }

    if asset_type not in file_map:
        raise HTTPException(400, "不支持的资源类型")

    target_path = os.path.join("static", file_map[asset_type])

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "msg": f"{asset_type} 已成功替换",
        "url": f"/static/{file_map[asset_type]}?v={os.urandom(4).hex()}",
    }


@router.get("/users", response_model=schemas.user.UserPaginationOut)
async def list_users(
    q: str = "", page: int = 1, size: int = 10, db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin)
):
    try:
        skip = (page - 1) * size
        query = db.query(models.User)

        if q:
            query = query.filter(models.User.username.ilike(f"%{q}%"))

        total = query.count()
        users = query.offset(skip).limit(size).all()

        return {
            "items": users,
            "total": total,
            "page": page,
            "size": size,
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.post("/users/{user_id}/action")
async def handle_user_action(
    user_id: int,
    action: str = Form(...),
    db: Session = Depends(get_db),
    admin: models.User = Depends(admin_required),
):
    
    if user_id == 1:
        raise HTTPException(403, "初始管理员受保护，无法修改其权限或状态")
    
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "用户不存在")

    if target_user.id == admin.id and action in ["disable", "delete", "unset_admin"]:
        raise HTTPException(400, "不能对自己进行此操作")

    if action == "disable":
        target_user.is_active = False
    elif action == "enable":
        target_user.is_active = True
    elif action == "set_admin":
        target_user.is_admin = True
    elif action == "unset_admin":
        target_user.is_admin = False
    else:
        raise HTTPException(400, "无效的操作类型")

    db.commit()
    return {"msg": "操作成功"}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    new_password: str = Form(...),
    db: Session = Depends(get_db),
    admin: models.User = Depends(admin_required),
):
    
    if user_id == 1 and admin.id != 1:
        raise HTTPException(status_code=403, detail="无权修改初始管理员密码")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码长度至少为8位")

    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    target_user.hashed_password = security.get_password_hash(new_password)
    db.commit()
    return {"msg": f"用户 {target_user.username} 的密码已重置"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    
    if user_id == 1:
        raise HTTPException(status_code=403, detail="初始管理员禁止删除")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账号")

    try:
        db.delete(user)
        db.commit()
        return {"msg": "用户已成功删除"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.get("/links", response_model=LinkPaginationOut)
async def get_all_links(
    q: str = "",
    page: int = 1,
    size: int = 7,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    try:
        config = db.query(models.SystemConfig).filter_by(key="risk_keywords").first()
        forbidden_str = config.value if (config and config.value) else ""
        keywords = [k.strip() for k in forbidden_str.split(",") if k.strip()]

        skip = (page - 1) * size

        query = (
            db.query(
                models.Link.id,
                models.Link.title,
                models.Link.url,
                models.Link.http_title,
                models.User.username.label("owner_name"),
            )
            .join(models.Group, models.Link.group_id == models.Group.id)
            .join(models.User, models.Group.user_id == models.User.id)
        )

        if q:
            query = query.filter(
                models.Link.title.ilike(f"%{q}%") | models.Link.url.ilike(f"%{q}%")
            )

        total = query.count()
        results = query.offset(skip).limit(size).all()

        items = []
        for r in results:
            h_title = r.http_title or ""
            u_title = r.title or ""
            u_url = r.url.lower()

            check_pool = f"{r.title}{r.url}{r.http_title or ''}".lower()

            is_risk = (
                any(word.lower() in check_pool for word in keywords)
                if keywords
                else False
            )

            items.append(
                {
                    "id": r.id,
                    "title": r.title,
                    "url": r.url,
                    "http_title": r.http_title,
                    "owner": r.owner_name,
                    "risk_score": "high" if is_risk else "normal",
                }
            )

        return {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.get("/config/risk-keywords")
async def get_risk_keywords(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    config = db.query(models.SystemConfig).filter_by(key="risk_keywords").first()
    return {"keywords": config.value if config else ""}


@router.post("/config/risk-keywords")
async def update_risk_keywords(
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    new_value = payload.get("keywords", "")
    config = db.query(models.SystemConfig).filter_by(key="risk_keywords").first()

    if config:
        config.value = new_value
    else:
        config = models.SystemConfig(key="risk_keywords", value=new_value)
        db.add(config)

    try:
        db.commit()
        return {"msg": "策略配置已成功覆写并生效"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/unused-icons")
async def get_unused_icons(
    db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)
):
    used_icons = db.query(models.Link.icon).filter(models.Link.icon != None).all()
    used_filenames = {os.path.basename(icon[0]) for icon in used_icons}

    unused_list = []
    if not os.path.exists(ICONS_DIR):
        return []

    for filename in os.listdir(ICONS_DIR):
        if filename != ".gitkeep" and filename not in used_filenames:
            file_path = os.path.join(ICONS_DIR, filename)
            if os.path.isfile(file_path):
                stats = os.stat(file_path)
                unused_list.append(
                    {
                        "filename": filename,
                        "url": f"/static/icons/{filename}",
                        "size": f"{round(stats.st_size / 1024, 1)} KB",
                        "mtime": stats.st_mtime,  
                    }
                )

    unused_list.sort(key=lambda x: x["mtime"], reverse=True)
    return unused_list


@router.delete("/unused-icons")
async def delete_unused_icons(
    payload: dict, 
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    filenames = payload.get("filenames", [])
    success_count = 0

    for name in filenames:
        safe_name = os.path.basename(name)
        file_path = os.path.join(ICONS_DIR, safe_name)

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                success_count += 1
            except Exception as e:
                print(f"删除失败 {safe_name}: {e}")

    return {"detail": f"成功清理 {success_count} 个冗余文件"}


@router.get("/config/custom-code")
async def get_custom_code(
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin)
):
    
    configs = db.query(models.SystemConfig).filter(
        models.SystemConfig.key.in_(["custom_styles", "custom_scripts"])
    ).all()
    
    return {c.key: c.value for c in configs}

@router.post("/config/custom-code")
async def save_custom_code(
    payload: dict, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin)
):
    if current_user.id != 1:
        raise HTTPException(
            status_code=403, 
            detail="⚠️ 风险操作：自定义代码注入功能仅限初始管理员使用。"
        )
    
    for key, value in payload.items():
        if key in ["custom_styles", "custom_scripts"]:
            config = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
            if config:
                config.value = value
            else:
                db.add(models.SystemConfig(key=key, value=value))
    
    db.commit()
    return {"msg": "保存成功"}
