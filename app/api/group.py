from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app import models
from app.api.deps import get_current_user, get_db
from app.schemas.link import GroupOut

router = APIRouter(prefix="/api/groups", tags=["分组管理"])


@router.get("/")
async def get_my_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    hidden_ids = [int(item) for item in current_user.hidden_groups.split(",") if item.isdigit()]

    public_group = (
        db.query(models.Group)
        .options(joinedload(models.Group.links))
        .filter(models.Group.id == 1, models.Group.user_id == 1)
        .first()
    )

    user_groups = (
        db.query(models.Group)
        .options(joinedload(models.Group.links))
        .filter(models.Group.user_id == current_user.id, models.Group.id != 1)
        .order_by(models.Group.order.asc())
        .all()
    )

    all_groups = []
    if public_group and (public_group.id not in hidden_ids or current_user.id == 1):
        public_group.is_readonly = True
        all_groups.append(public_group)

    all_groups.extend(user_groups)
    return all_groups


@router.get("/public")
async def get_public_groups(db: Session = Depends(get_db)):
    return (
        db.query(models.Group)
        .options(joinedload(models.Group.links))
        .filter(models.Group.id == 1, models.Group.user_id == 1)
        .all()
    )


@router.get("/selectable")
async def get_selectable_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Group)
        .filter(models.Group.user_id == current_user.id)
        .order_by(models.Group.order.asc())
        .all()
    )


@router.post("/", response_model=GroupOut)
async def create_group(
    name: str | None = Query(None),
    payload: dict[str, Any] | None = Body(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    group_name = (payload or {}).get("name", name)
    if not group_name or not str(group_name).strip():
        raise HTTPException(status_code=422, detail="暂无分组信息")

    max_order = db.query(models.Group).filter(models.Group.user_id == current_user.id).count()
    new_group = models.Group(
        name=str(group_name).strip(),
        user_id=current_user.id,
        order=max_order,
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group


@router.put("/reorder")
async def reorder_groups(
    group_ids: list[int],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    for index, group_id in enumerate(group_ids):
        (
            db.query(models.Group)
            .filter(models.Group.id == group_id, models.Group.user_id == current_user.id)
            .update({"order": index})
        )

    db.commit()
    db.expire_all()
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
    name: str | None = Query(None),
    payload: dict[str, Any] | None = Body(None),
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

    group_name = (payload or {}).get("name", name)
    if not group_name or not str(group_name).strip():
        raise HTTPException(status_code=422, detail="暂无分组信息")

    group.name = str(group_name).strip()
    db.commit()
    return {"msg": "修改成功", "name": group.name}


@router.post("/{group_id}/toggle-visibility")
async def toggle_group_visibility(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    hidden_raw = current_user.hidden_groups or ""
    hidden_list = [item for item in hidden_raw.split(",") if item.strip()]
    group_id_str = str(group_id)

    if group_id_str in hidden_list:
        hidden_list.remove(group_id_str)
    else:
        hidden_list.append(group_id_str)

    current_user.hidden_groups = ",".join(hidden_list)
    db.commit()
    return {"hidden_groups": current_user.hidden_groups}


@router.post("/reset-hidden")
async def reset_hidden_groups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_user.hidden_groups = ""
    db.commit()
    return {"msg": "所有分组已恢复显示"}
