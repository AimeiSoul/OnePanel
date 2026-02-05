from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from app.database import engine
from app import models
from app.api import auth, admin, links, init
from app.database import engine
from app import models
from app.core import config

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="OnePanel")

# 包含路由模块
app.include_router(init.router)
app.include_router(auth.router)
app.include_router(links.router)
app.include_router(admin.router)


# 静态资源与页面
app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")

@app.get("/")
async def read_root():
    return FileResponse(os.path.join(config.STATIC_DIR, "index.html"))

@app.get("/admin")
async def read_admin():
    return FileResponse(os.path.join(config.STATIC_DIR, "admin.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)