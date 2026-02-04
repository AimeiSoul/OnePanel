from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import Session
try:
    from database import Base, engine
except ImportError:
    from .database import Base, engine

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    custom_bg = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

class SystemConfig(Base):
    __tablename__ = "system_config"
    key = Column(String, primary_key=True) 
    value = Column(String)

class Link(Base):
    __tablename__ = "links"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

def init_db():
    Base.metadata.create_all(bind=engine)