from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship

try:
    from app.database import Base, engine
except ImportError:
    from database import Base, engine


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    custom_bg = Column(String, nullable=True) 
    is_active = Column(Boolean, default=True)
    hidden_groups = Column(String, default="")

    groups = relationship("Group", back_populates="owner", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    order = Column(Integer, default=0) 
    user_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="groups")
    links = relationship("Link", back_populates="group", cascade="all, delete-orphan", order_by="Link.order")

class Link(Base):
    __tablename__ = "links"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    http_title = Column(Text, nullable=True)
    order = Column(Integer, default=0)  
    group_id = Column(Integer, ForeignKey("groups.id"))
    group = relationship("Group", back_populates="links")


class SystemConfig(Base):
    __tablename__ = "system_config"
    key = Column(String(50), primary_key=True) 
    value = Column(Text, nullable=True)

    def __repr__(self):
        return f"<SystemConfig(key='{self.key}', value='{self.value}')>"


def init_db():
    Base.metadata.create_all(bind=engine)
