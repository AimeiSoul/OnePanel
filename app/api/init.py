from fastapi import FastAPI, Query, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.user import UserRegister
from app.core import security
from app import models

router = APIRouter(prefix="/api/system", tags=["系统初始化"])

@router.get("/status")
async def get_system_status(db: Session = Depends(get_db)):
    # 检查是否已经存在管理员
    admin_exists = db.query(models.User).filter(models.User.is_admin == True).first()
    return {
        "is_initialized": bool(admin_exists),
        "status": "running"
    }

@router.post("/init")
async def init_admin(
    username: str = Query(...), 
    password: str = Query(...), 
    db: Session = Depends(get_db)
):
    # 防止重复初始化
    if db.query(models.User).filter(models.User.is_admin == True).first():
        raise HTTPException(status_code=400, detail="系统已初始化，请直接登录")
    
    new_admin = models.User(
        username=username,
        hashed_password=security.get_password_hash(password),
        is_admin=True,
        custom_bg="/static/default_bg.jpg"
    )
    db.add(new_admin)
    db.commit()
    return {"msg": "管理员初始化成功"}