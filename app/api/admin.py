from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.schemas.link import LinkPaginationOut
from app.core import security
from app.api.deps import admin_required, get_current_admin
from app.core import security
from app.core.config import ICONS_DIR
import shutil
import os
import re

router = APIRouter(prefix="/api/admin", tags=["Admin"])


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