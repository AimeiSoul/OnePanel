from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from app.database import engine
from app import models
from app.api import auth, admin, links, init, group
from app.database import engine
from app import models
from app.core import config
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_DIR = os.path.join(BASE_DIR, "data")
DB_DIRDIR = os.path.join(DB_DIR, "onepanel.db")
if not os.path.exists(DB_DIRDIR):
    models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="OnePanel")

def init_system_config():
    db: Session = SessionLocal()
    try:
        defaults = {
            "site_title": "OnePanel | 洛水天依",
            "favicon_api": "https://favicon.cccyun.cc/${hostname}",
            "risk_keywords": "赌博,博彩,赌场,下注,色情,成人,翻墙,梯子,vpn,加速器,镜像站,代充,破解",
            "custom_styles": "",
            "custom_scripts": ""
        }
        
        for k, v in defaults.items():
            exists = db.query(models.SystemConfig).filter(models.SystemConfig.key == k).first()
            if not exists:
                new_item = models.SystemConfig(key=k, value=v)
                db.add(new_item)
        db.commit()
    except Exception as e:
        print(f"初始化配置失败: {e}")
    finally:
        db.close()

init_system_config()

app.include_router(init.router)
app.include_router(auth.router)
app.include_router(group.router)
app.include_router(links.router)
app.include_router(admin.router)


app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")


@app.get("/")
async def read_root_index():
    return FileResponse(os.path.join(config.STATIC_DIR, "index.html"))

@app.get("/init")
async def read_root_init():
    return FileResponse(os.path.join(config.STATIC_DIR, "init.html"))

@app.get("/login")
async def read_root_index():
    return FileResponse(os.path.join(config.STATIC_DIR, "login.html"))

@app.get("/register")
async def read_root_index():
    return FileResponse(os.path.join(config.STATIC_DIR, "register.html"))


@app.get("/admin")
async def read_admin_index():
    return FileResponse(os.path.join(config.STATIC_DIR, "admin.html"))

@app.get("/admin_login")
async def read_admin_login():
    return FileResponse(os.path.join(config.STATIC_DIR, "admin_login.html"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
