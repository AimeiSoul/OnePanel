from pydantic import BaseModel
from typing import Optional, List

class LinkBase(BaseModel):
    title: str
    url: str
    icon: Optional[str] = None
    order: int = 0
    http_title: Optional[str] = None


class LinkCreate(BaseModel):
    title: str
    url: str
    group_id: int
    icon: Optional[str] = None
    order: Optional[int] = 0


class LinkOut(LinkBase):
    id: int
    group_id: int

    class Config:
        from_attributes = True

class LinkAdminOut(BaseModel):
    id: int
    title: str
    url: str
    owner: str
    risk_score: str

    class Config:
        from_attributes = True
        
class LinkPaginationOut(BaseModel):
    items: List[LinkAdminOut]
    total: int
    page: int
    size: int

class GroupBase(BaseModel):
    name: str
    order: int = 0


class GroupCreate(GroupBase):
    pass


class GroupOut(BaseModel):
    id: int
    name: str
    order: int
    user_id: int
    links: List["LinkOut"] = [] 

    class Config:
        from_attributes = True
