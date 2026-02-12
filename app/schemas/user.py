from pydantic import BaseModel, field_validator
import re

class UserBase(BaseModel):
    username: str

class UserRegister(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v):
        if len(v) < 8:
            raise ValueError('密码至少需要8位')
        
        checks = [
            bool(re.search(r"[A-Z]", v)),  
            bool(re.search(r"[a-z]", v)),  
            bool(re.search(r"[0-9]", v)),  
            bool(re.search(r"[!@#$%^&*(),.?\":{}|<>]", v)) 
        ]
        
        if sum(checks) < 3:
            raise ValueError('密码需包含大小写、数字、符号中的至少三类')
        return v

class UserOut(UserBase):
    id: int
    is_admin: bool
    is_active: bool
    custom_bg: str | None
    hidden_groups: str
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    custom_bg: str | None = None
    hidden_groups: str | None = None

class UserPaginationOut(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    size: int