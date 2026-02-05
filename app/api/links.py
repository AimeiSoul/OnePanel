from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, optional_oauth2_scheme

from app.schemas.link import LinkCreate, LinkOut

from app.core import security, config

from app import models

from app.api.deps import get_db, get_current_user, get_optional_user


router = APIRouter(prefix="/api/links", tags=["链接"])


@router.get("/", response_model=list[LinkOut])
async def get_links(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_optional_user),  # 自动处理登录或访客
):

    # 基础查询：获取公共链接 (user_id 为空)

    public_links_query = db.query(models.Link).filter(models.Link.user_id == None)

    # 如果用户已登录，返回 (他的私有链接 + 公共链接)

    if current_user:

        return (
            db.query(models.Link)
            .filter(
                (models.Link.user_id == current_user.id) | (models.Link.user_id == None)
            )
            .all()
        )

    # 如果是访客，只返回公共链接

    return public_links_query.all()


@router.post("/", response_model=LinkOut)
async def add_link(
    link: LinkCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):

    new_link = models.Link(**link.model_dump(), user_id=user.id)

    db.add(new_link)

    db.commit()

    db.refresh(new_link)

    return new_link


@router.delete("/{link_id}")
async def delete_link(
    link_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)
):

    link = (
        db.query(models.Link)
        .filter(models.Link.id == link_id, models.Link.user_id == user.id)
        .first()
    )

    if not link:

        raise HTTPException(status_code=404, detail="链接不存在或无权删除")

    db.delete(link)

    db.commit()

    return {"msg": "已删除"}


@router.post("/check-health")
async def health_check_trigger():

    return {"msg": "健康检查已触发"}
