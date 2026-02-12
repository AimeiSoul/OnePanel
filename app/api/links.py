from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import shutil
import requests
import uuid
import os
from app.api.deps import get_db, get_current_user, get_optional_user
from app.schemas.link import LinkCreate, LinkOut
from app import models
from pydantic import BaseModel
from typing import List
from app.core.config import ICONS_DIR
from app.core.crawler import get_remote_http_title

router = APIRouter(prefix="/api/links", tags=["链接管理"])

class ReorderSchema(BaseModel):
    link_ids: List[int]
    group_id: int

@router.get("/", response_model=list[LinkOut])
async def get_links(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_optional_user),
):
    if current_user:
        return (
            db.query(models.Link)
            .join(models.Group)
            .filter(
                (models.Group.user_id == current_user.id) | (models.Group.id == 1)
            )
            .order_by(models.Link.order.asc())
            .all()
        )
    return []

@router.post("/", response_model=LinkOut)
async def add_link(
    link: LinkCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if link.group_id == 1 and user.id != 1:
        raise HTTPException(status_code=403, detail="无法向公共分组添加内容")

    group = db.query(models.Group).filter(
        models.Group.id == link.group_id, 
        models.Group.user_id == user.id
    ).first()

    if not group and not (link.group_id == 1 and user.id == 1):
        raise HTTPException(status_code=403, detail="目标分组不存在或无权操作")
    
    remote_title = await get_remote_http_title(link.url)

    link_count = db.query(models.Link).filter(models.Link.group_id == link.group_id).count()
    link_data = link.model_dump()
    link_data.pop("order", None) 

    new_link = models.Link(**link_data, order=link_count, http_title=remote_title)
    db.add(new_link)
    db.commit()
    db.refresh(new_link)
    return new_link

def check_link_permission(db: Session, link_id: int, user: models.User):
    if link_id is None:
        return True
        
    link = db.query(models.Link).join(models.Group).filter(models.Link.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="链接不存在")
        
    is_owner = link.group.user_id == user.id
    is_admin_public = link.group_id == 1 and user.id == 1
    
    if not (is_owner or is_admin_public):
        raise HTTPException(status_code=403, detail="无权操作此链接的图标")
    return link

def cleanup_old_icon_file(icon_path: str):
    if icon_path and icon_path.startswith("/static/icons/"):
        relative_path = icon_path.lstrip("/")
        if os.path.exists(relative_path):
            try:
                os.remove(relative_path)
            except Exception as e:
                print(f"清理旧图标文件失败: {e}")

@router.post("/upload-icon")
async def upload_link_icon(
    file: UploadFile = File(...), 
    link_id: int = Form(None), 
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "只支持图片上传")

    link_obj = None
    if link_id:
        link_obj = check_link_permission(db, link_id, user)
        if link_obj and link_obj.icon:
            cleanup_old_icon_file(link_obj.icon)

    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    save_path = os.path.join(ICONS_DIR, filename)
    icon_url = f"/static/icons/{filename}"
    
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if link_obj:
        link_obj.icon = icon_url
        db.commit()
        
    return {"icon_url": f"/static/icons/{filename}"}

@router.post("/download-icon")
async def download_link_icon(
    url: str = Form(...), 
    link_id: int = Form(None), 
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    
    link_obj = None
    if link_id:
        link_obj = check_link_permission(db, link_id, user)
        if link_obj and link_obj.icon:
            cleanup_old_icon_file(link_obj.icon)

    try:
        res = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        
        content_type = res.headers.get('content-type', '')
        ext = ".png"
        if 'jpeg' in content_type: ext = ".jpg"
        elif 'svg' in content_type: ext = ".svg"
        elif 'x-icon' in content_type: ext = ".ico"

        filename = f"{uuid.uuid4()}{ext}"
        save_path = os.path.join(ICONS_DIR, filename)
        icon_url = f"/static/icons/{filename}"
        
        with open(save_path, "wb") as f:
            f.write(res.content)

        if link_obj:
            link_obj.icon = icon_url
            db.commit()
            
        return {"icon_url": f"/static/icons/{filename}"}
    except Exception as e:
        raise HTTPException(400, f"抓取图标失败: {str(e)}")

@router.put("/{link_id}/move")
async def move_link(
    link_id: int,
    target_group_id: int,
    new_order: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if target_group_id == 1 and user.id != 1:
        raise HTTPException(status_code=403, detail="无法移动到公共分组")

    link = db.query(models.Link).join(models.Group).filter(
        models.Link.id == link_id, 
        (models.Group.user_id == user.id) | (models.Group.id == 1 and user.id == 1)
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="链接不存在或无权操作")

    link.group_id = target_group_id
    link.order = new_order
    db.commit()
    return {"msg": "移动成功"}

@router.delete("/{link_id}")
async def delete_link(
    link_id: int, 
    db: Session = Depends(get_db), 
    user: models.User = Depends(get_current_user)
):
    link = check_link_permission(db, link_id, user)

    if link.group_id == 1 and user.id != 1:
        raise HTTPException(status_code=403, detail="无法删除公共分组内容")

    group = db.query(models.Group).filter(models.Group.id == link.group_id).first()
    if group.user_id != user.id and not (group.id == 1 and user.id == 1):
         raise HTTPException(status_code=403, detail="无权删除")

    if link.icon:
        cleanup_old_icon_file(link.icon)

    db.delete(link)
    db.commit()
    return {"msg": "已删除"}

@router.put("/reorder")
async def reorder_links(
    data: ReorderSchema,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if data.group_id == 1 and current_user.id != 1:
        raise HTTPException(status_code=403, detail="无法修改公共分组顺序")

    group_exists = db.query(models.Group).filter(
        models.Group.id == data.group_id, 
        (models.Group.user_id == current_user.id) | (models.Group.id == 1 and current_user.id == 1)
    ).first()
    
    if not group_exists:
        raise HTTPException(status_code=403, detail="无权操作该分组")

    for index, l_id in enumerate(data.link_ids):
        db.query(models.Link).filter(models.Link.id == l_id).update(
            {"order": index, "group_id": data.group_id},
            synchronize_session=False
        )
    
    db.commit()
    db.expire_all() 
    return {"status": "success"}

@router.post("/check-health")
async def health_check_trigger():

    return {"msg": "健康检查已触发"}


