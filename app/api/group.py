from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user
from app import models

from app.schemas.link import GroupOut

router = APIRouter(prefix="/api/groups", tags=["分组管理"])


@router.get("/")
async def get_my_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    hidden_ids = [int(x) for x in current_user.hidden_groups.split(",") if x.isdigit()]

    public_group = db.query(models.Group).options(joinedload(models.Group.links)).filter(
        models.Group.id == 1,
        models.Group.user_id == 1
    ).first()

    user_groups = db.query(models.Group).options(joinedload(models.Group.links)).filter(
        models.Group.user_id == current_user.id,
        models.Group.id != 1
    ).order_by(models.Group.order.asc()).all()

    all_groups = []
    
    if public_group:
        if public_group.id not in hidden_ids or current_user.id == 1:
            public_group.is_readonly = True
            all_groups.append(public_group)

    all_groups.extend(user_groups)
    return all_groups

@router.get("/public")
async def get_public_groups(db: Session = Depends(get_db)):
    groups = (
        db.query(models.Group)
        .options(joinedload(models.Group.links)) 
        .filter(
            models.Group.id == 1,
            models.Group.user_id == 1
        )
        .all()
    )
        
    return groups

@router.get("/selectable")
async def get_selectable_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    return db.query(models.Group).filter(
        models.Group.user_id == current_user.id
    ).order_by(models.Group.order.asc()).all()

@router.post("/", response_model=GroupOut)
async def create_group(
    name: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    max_order = (
        db.query(models.Group).filter(models.Group.user_id == current_user.id).count()
    )

    new_group = models.Group(name=name, user_id=current_user.id, order=max_order)
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group


@router.put("/reorder")
async def reorder_groups(
    group_ids: list[int],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 遍历前端传来的 ID 列表，按索引顺序更新数据库中的 order
    for index, g_id in enumerate(group_ids):
        db.query(models.Group).filter(
            models.Group.id == g_id,
            models.Group.user_id == current_user.id # 权限校验
        ).update({"order": index})
    
    db.commit()
    db.expire_all() # 清除缓存，确保下次查询拿到的是最新 order
    return {"status": "success"}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if group_id == 1 and current_user.id != 1:
        raise HTTPException(status_code=403, detail="公共分组禁止修改")
    
    group = (
        db.query(models.Group)
        .filter(models.Group.id == group_id, models.Group.user_id == current_user.id)
        .first()
    )

    if not group:
        raise HTTPException(status_code=404, detail="分组不存在")

    db.delete(group)
    db.commit()
    return {"msg": "分组及其链接已删除"}


@router.put("/{group_id}")
async def update_group(
    group_id: int,
    name: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if group_id == 1 and current_user.id != 1:
        raise HTTPException(status_code=403, detail="公共分组禁止修改")

    group = (
        db.query(models.Group)
        .filter(models.Group.id == group_id, models.Group.user_id == current_user.id)
        .first()
    )

    if not group:
        raise HTTPException(status_code=404, detail="分组不存在")

    group.name = name
    db.commit()
    return {"msg": "修改成功", "name": name}

@router.post("/{group_id}/toggle-visibility")
async def toggle_group_visibility(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    
    hidden_raw = current_user.hidden_groups or ""
    hidden_list = [x for x in hidden_raw.split(",") if x.strip()]
    gid_str = str(group_id)

    if gid_str in hidden_list:
        hidden_list.remove(gid_str) # 取消隐藏
    else:
        hidden_list.append(gid_str) # 设为隐藏

    current_user.hidden_groups = ",".join(hidden_list)
    db.commit()
    return {"hidden_groups": current_user.hidden_groups}

@router.post("/reset-hidden")
async def reset_hidden_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    current_user.hidden_groups = "" # 清空隐藏列表
    db.commit()
    return {"msg": "所有分组已恢复显示"}