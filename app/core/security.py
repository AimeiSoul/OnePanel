from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class About:
        __version__ = bcrypt.__version__
    bcrypt.__about__ = About()
from passlib.context import CryptContext
import hashlib

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "X6Fe1Aw873PGph"
ALGORITHM = "HS256"

def get_password_hash(password: str):
    pw_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return pwd_context.hash(pw_hash)

def verify_password(plain_password: str, hashed_password: str):
    pw_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return pwd_context.verify(pw_hash, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)