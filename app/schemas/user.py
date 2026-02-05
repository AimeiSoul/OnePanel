# app/schemas/user.py
from pydantic import BaseModel, field_validator
import re

class UserBase(BaseModel):
    username: str

class UserRegister(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v):
        # 1. 长度校验
        if len(v) < 8:
            raise ValueError('密码至少需要8位')
        
        # 2. 复杂度校验 (大小写、数字、特殊字符 4选3)
        checks = [
            bool(re.search(r"[A-Z]", v)),  # 大写
            bool(re.search(r"[a-z]", v)),  # 小写
            bool(re.search(r"[0-9]", v)),  # 数字
            bool(re.search(r"[!@#$%^&*(),.?\":{}|<>]", v)) # 符号
        ]
        
        if sum(checks) < 3:
            raise ValueError('密码需包含大小写、数字、符号中的至少三类')
        return v

class UserOut(UserBase):
    id: int
    is_admin: bool
    custom_bg: str | None
    class Config:
        from_attributes = True