from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, admin_required
from app import models

router = APIRouter(prefix="/api/admin", tags=["管理员后台"])

@router.get("/users")
async def list_users(db: Session = Depends(get_db), _=Depends(admin_required)):
    users = db.query(models.User).all()
    # 简单的格式化输出
    return [{"id": u.id, "username": u.username, "is_admin": u.is_admin} for u in users]

@router.post("/registration/toggle")
async def toggle_registration(open: bool, db: Session = Depends(get_db), _=Depends(admin_required)):
    conf = db.query(models.SystemConfig).filter(models.SystemConfig.key == "registration_open").first()
    if not conf:
        conf = models.SystemConfig(key="registration_open", value=str(open).lower())
        db.add(conf)
    else:
        conf.value = str(open).lower()
    db.commit()
    return {"status": "success", "registration_open": open}

@router.post("/users/{uid}/active")
async def toggle_user_active(uid: int, active: bool, db: Session = Depends(get_db), admin=Depends(admin_required)):
    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能禁用自己")
    
    user.is_active = active
    db.commit()
    return {"msg": f"用户状态已更新为 {'激活' if active else '禁用'}"}