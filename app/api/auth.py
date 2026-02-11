from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from app.api.deps import get_db, get_current_user
from app.schemas.user import UserRegister, UserOut, UserUpdate
from app.core import security, config
from app import models
import shutil
import os
import uuid


router = APIRouter(tags=["认证"])


@router.post("/api/register")
async def register(user_in: UserRegister, db: Session = Depends(get_db)):
    user_count = db.query(models.User).count()

    if user_count > 0:
        reg_config = (
            db.query(models.SystemConfig)
            .filter(models.SystemConfig.key == "registration_open")
            .first()
        )
        if reg_config and reg_config.value == "false":
            raise HTTPException(status_code=403, detail="管理员已关闭注册功能")

    if db.query(models.User).filter(models.User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="用户名已被占用")

    try:
        new_user = models.User(
            username=user_in.username,
            hashed_password=security.get_password_hash(user_in.password),
            is_admin=(user_count == 0),
            custom_bg="/static/default_bg.jpg",
        )
        db.add(new_user)
        db.flush()

        default_group = models.Group(name="默认分组", order=0, user_id=new_user.id)
        db.add(default_group)

        db.commit()
        return {"msg": "注册成功并已创建默认分组"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")


@router.post("/api/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = (
        db.query(models.User).filter(models.User.username == form_data.username).first()
    )
    if not user or not security.verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="用户名或密码错误")

    if not user.is_active:
        raise HTTPException(
            status_code=403, 
            detail="您的账号已被管理员禁用，请联系管理人员。"
        )    

    token = security.create_access_token(data={"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/api/user/me", response_model=UserOut)
async def get_me(current_user: models.User = Depends(get_current_user)):

    return current_user

@router.put("/api/user/me")
async def update_me(
    obj_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    update_data = obj_in.model_dump(exclude_unset=True)
    
    for field in update_data:
        setattr(current_user, field, update_data[field])
    
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.post("/api/upload-bg")
async def upload_background(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    ext = os.path.splitext(file.filename)[1]

    filename = f"{uuid.uuid4()}{ext}"

    file_path = os.path.join(config.UPLOAD_DIR, filename)

    if current_user.custom_bg:

        old_bg_relative = current_user.custom_bg.lstrip("/")

        old_bg_path = os.path.join(os.getcwd(), old_bg_relative)


        if os.path.exists(old_bg_path) and "default_bg" not in old_bg_path:

            try:

                os.remove(old_bg_path)

            except Exception as e:

                print(f"删除旧背景失败: {e}") 


    with open(file_path, "wb") as buffer:

        shutil.copyfileobj(file.file, buffer)

    relative_path = f"/static/user_uploads/{filename}"

    current_user.custom_bg = relative_path

    db.commit()

    return {"msg": "背景更新成功", "url": relative_path}