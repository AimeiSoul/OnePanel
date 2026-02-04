import os
import sys
import shutil
import re
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from database import SessionLocal
from pydantic import BaseModel

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

import models
import database
import security

app = FastAPI(title="OnePanel API")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class UserRegister(BaseModel):
    username: str
    password: str

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v):
        # 1. 长度校验
        if len(v) < 8:
            raise ValueError('密码至少需要8位')
        
        # 2. 复杂度校验 (大小写、数字、特殊字符 4选3)
        checks = [
            bool(re.search(r"[A-Z]", v)),  # 大写
            bool(re.search(r"[a-z]", v)),  # 小写
            bool(re.search(r"[0-9]", v)),  # 数字
            bool(re.search(r"[!@#$%^&*(),.?\":{}|<>]", v)) # 符号
        ]
        
        if sum(checks) < 3:
            raise ValueError('密码需包含大小写、数字、符号中的至少三类')
        return v


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    try:
        payload = security.jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Token 无效")
    except security.JWTError:
        raise HTTPException(status_code=401, detail="Token 认证失败")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user

async def admin_required(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="权限不足，该操作仅限管理员"
        )
    return current_user

# 系统状态检查
@app.get("/api/system/status")
async def system_status(db: Session = Depends(database.get_db)):
    count = db.query(models.User).count()
    return {"is_initialized": count > 0}

# 系统初始化 (创建首个管理员)
@app.post("/api/system/init")
async def system_init(username: str, password: str, db: Session = Depends(database.get_db)):
    if db.query(models.User).count() > 0:
        raise HTTPException(status_code=400, detail="系统已初始化，请直接登录")
    
    new_user = models.User(
        username=username, 
        hashed_password=security.get_password_hash(password),
        is_admin=True,
        custom_bg="/static/default_bg.jpg"
    )
    db.add(new_user)
    db.commit()
    return {"msg": "初始化成功"}

# 注册接口
@app.post("/api/register")
async def register(user: UserRegister, db: Session = Depends(database.get_db)):
    # 1. 检查当前用户总数（用于判断是否为首位用户）
    user_count = db.query(models.User).count()
    
    # 2. 检查注册开关（如果不是第一个用户，则受开关控制）
    if user_count > 0:
        reg_config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "registration_open").first()
        # 如果配置存在且值为 "false"，则拒绝注册
        if reg_config and reg_config.value == "false":
            raise HTTPException(status_code=403, detail="管理员已关闭注册功能")

    # 3. 查重逻辑保持不变
    existing_user = db.query(models.User).filter(models.User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="该用户名已被占用")
    
    # 4. 创建新用户
    # ✨ 核心变化：is_admin 根据 user_count 是否为 0 动态决定
    is_first_user = (user_count == 0)
    
    new_user = models.User(
        username=user.username,
        hashed_password=security.get_password_hash(user.password),
        is_admin=is_first_user, 
        custom_bg="/static/default_bg.jpg"
    )
    
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        msg = "注册成功"
        if is_first_user:
            msg = "初始化成功，已获得管理员权限"
            
        return {"msg": msg, "username": new_user.username, "is_admin": new_user.is_admin}
    
    except Exception as e:
        db.rollback()
        print(f"写入错误: {str(e)}")
        raise HTTPException(status_code=500, detail="服务器写入错误")

# 登录接口
@app.post("/api/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="用户名或密码错误")
    
    token = security.create_access_token(data={"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}

# 获取个人信息
@app.get("/api/user/me")
async def get_me(user: models.User = Depends(get_current_user)):
    return {
        "username": user.username,
        "custom_bg": user.custom_bg,
        "is_admin": user.is_admin
    }

# 定义一个不报错的 OAuth2 实例，用于访客模式
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)

# 获取链接列表
@app.get("/api/links")
async def get_links(
    db: Session = Depends(database.get_db),
    token: str = Depends(optional_oauth2_scheme) # 修复这里，去掉 security. 前缀
):
    # 如果没有 token，只返回公共链接
    if not token:
        return db.query(models.Link).filter(models.Link.user_id == None).all()

    try:
        # 尝试解析 token
        payload = security.jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username = payload.get("sub")
        user = db.query(models.User).filter(models.User.username == username).first()
        
        if user:
            # 返回该用户的私有链接 + 公共链接
            return db.query(models.Link).filter(
                (models.Link.user_id == user.id) | (models.Link.user_id == None)
            ).all()
    except Exception:
        # 如果 Token 无效（过期等），回退到只显示公共链接，不报错
        pass
    
    return db.query(models.Link).filter(models.Link.user_id == None).all()

class LinkCreate(BaseModel):
    title: str
    url: str
    icon: str = None

@app.post("/api/links")
async def add_link(
    link: LinkCreate, 
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_current_user) # 强制要求登录
):
    new_link = models.Link(
        title=link.title,
        url=link.url,
        icon=link.icon,
        user_id=user.id  # ✨ 自动绑定当前登录用户的 ID
    )
    db.add(new_link)
    db.commit()
    return {"msg": "添加成功"}

@app.delete("/api/links/{link_id}")
async def delete_link(
    link_id: int, 
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_current_user)
):
    link = db.query(models.Link).filter(models.Link.id == link_id, models.Link.user_id == user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="链接不存在")
    db.delete(link)
    db.commit()
    return {"msg": "已成功删除"}

# 背景上传接口
@app.post("/api/upload-bg")
async def upload_bg(
    file: UploadFile = File(...), 
    user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db)
):
    upload_dir = os.path.join(STATIC_DIR, "user_uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    # 清理旧背景 (非默认背景时)
    if user.custom_bg and "default_bg.jpg" not in user.custom_bg:
        old_path = os.path.join(BASE_DIR, user.custom_bg.lstrip("/"))
        if os.path.exists(old_path):
            os.remove(old_path)
            
    filename = f"user_{user.id}_{file.filename}"
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    web_path = f"/static/user_uploads/{filename}"
    user.custom_bg = web_path
    db.commit()
    
    return {"url": web_path}


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

@app.get("/")
async def read_root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/admin")
async def read_admin():
    # 确保文件路径正确
    admin_path = os.path.join("static", "admin.html")
    if os.path.exists(admin_path):
        return FileResponse(admin_path)
    raise HTTPException(status_code=404, detail="Admin page not found")

class AdminLogin(BaseModel):
    username: str
    password: str

@app.post("/api/admin/login")
async def admin_login(user_in: AdminLogin, db: Session = Depends(database.get_db)):
    # 1. 验证用户是否存在
    user = db.query(models.User).filter(models.User.username == user_in.username).first()
    
    # 2. 校验密码
    if not user or not security.verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="管理员账号或密码错误")
    
    # 3. 核心：强制校验管理员身份
    if not user.is_admin:
        # 这里故意不给具体提示，增加安全性
        raise HTTPException(status_code=403, detail="权限不足，禁止从该接口登录")
    
    # 4. 生成 Token
    access_token = security.create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "redirect": "/admin" # 登录成功后的跳转建议
    }

@app.get("/api/admin/config")
async def get_config(db: Session = Depends(database.get_db), _ = Depends(admin_required)):
    reg_status = db.query(models.SystemConfig).filter(models.SystemConfig.key == "registration_open").first()
    # 如果数据库没记录，默认返回开启
    status = reg_status.value if reg_status else "true"
    return {"registration_open": status == "true"}

# 修改系统配置
@app.post("/api/admin/config/registration")
async def update_reg_config(open: bool, db: Session = Depends(database.get_db), _ = Depends(admin_required)):
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "registration_open").first()
    if not config:
        config = models.SystemConfig(key="registration_open", value=str(open).lower())
        db.add(config)
    else:
        config.value = str(open).lower()
    db.commit()
    return {"msg": f"注册功能已{'开启' if open else '关闭'}"}

# 获取所有用户列表及其链接统计
@app.get("/api/admin/users")
async def get_all_users(db: Session = Depends(get_db), _ = Depends(admin_required)):
    users = db.query(models.User).all()
    result = []
    for u in users:
        link_count = db.query(models.Link).filter(models.Link.user_id == u.id).count()
        result.append({
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "link_count": link_count
        })
    return result

# 查看指定用户的链接
@app.get("/api/admin/user-links/{uid}")
async def get_specific_user_links(uid: int, db: Session = Depends(get_db), _ = Depends(admin_required)):
    return db.query(models.Link).filter(models.Link.user_id == uid).all()

@app.post("/api/admin/users/{username}/toggle")
async def toggle_user_active(username: str, db: Session = Depends(database.get_db)):
    # 查找用户
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 防止管理员禁用自己（安全保障）
    # 如果需要更严谨，可以从 Token 获取当前操作者身份进行比对
    if user.is_admin:
        # 这里允许管理员被禁用吗？通常建议至少保留一个超级管理员
        admin_count = db.query(models.User).filter(models.User.is_admin == True, models.User.is_active == True).count()
        if admin_count <= 1 and user.is_active:
             raise HTTPException(status_code=400, detail="系统必须保留至少一名活跃的管理员")

    # 翻转状态
    user.is_active = not user.is_active
    db.commit()
    
    return {"status": "success", "current_active": user.is_active}

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    models.init_db()
    uvicorn.run(app, host="0.0.0.0", port=8000)