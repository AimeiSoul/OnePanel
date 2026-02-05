from pydantic import BaseModel
from typing import Optional


# 基础模型，包含共有字段
class LinkBase(BaseModel):
    title: str
    url: str
    icon: Optional[str] = None


# 创建链接时使用的模型 (输入)
class LinkCreate(LinkBase):
    pass


# 返回给前端的模型 (输出)
class LinkOut(LinkBase):
    id: int
    user_id: Optional[int]

    class Config:
        from_attributes = True  # 允许从 SQLAlchemy 模型对象自动转换
