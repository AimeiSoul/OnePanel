from fastapi import Query, HTTPException, Depends, APIRouter
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.core import security
from app import models

router = APIRouter(prefix="/api/system", tags=["系统初始化"])

@router.get("/config")
async def get_public_config(db: Session = Depends(get_db)):
    configs = db.query(models.SystemConfig).all()
    return {item.key: item.value for item in configs}

@router.get("/status")
async def get_system_status(db: Session = Depends(get_db)):
    admin_exists = db.query(models.User).filter(models.User.is_admin == True).first()
    return {"is_initialized": bool(admin_exists), "status": "running"}


@router.post("/init")
async def init_admin(
    username: str = Query(...),
    password: str = Query(...),
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter(models.User.is_admin == True).first():
        raise HTTPException(status_code=400, detail="系统已初始化")

    try:
        new_admin = models.User(
            username=username,
            hashed_password=security.get_password_hash(password),
            is_admin=True,
            custom_bg="/static/default_bg.jpg",
        )
        db.add(new_admin)
        db.flush() 

        default_group = models.Group(
            name="常用链接", 
            order=0, 
            user_id=new_admin.id,
        )
        db.add(default_group)

        db.commit()
        return {"msg": "初始化成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"失败: {str(e)}")

    except Exception as e:
        db.rollback() 
        raise HTTPException(status_code=500, detail=f"初始化失败: {str(e)}")
