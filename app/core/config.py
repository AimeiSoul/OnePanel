import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOAD_DIR = os.path.join(STATIC_DIR, "user_uploads")
ICONS_DIR = os.path.join(STATIC_DIR, "icons")

SECRET_KEY = os.getenv("SECRET_KEY", "X6Fe1Aw873PGph")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

for path in [DATA_DIR, UPLOAD_DIR, ICONS_DIR]:
    os.makedirs(path, exist_ok=True)