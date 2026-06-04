from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import os

# .env dosyasına ekle: JWT_SECRET=buraya-uzun-rastgele-bir-key-yaz
SECRET_KEY = os.getenv("JWT_SECRET", "gizli-anahtar-degistir-beni")
ALGORITHM = "HS256"
EXPIRE_MINUTES = 60 * 24  # 24 saat


def jwt_olustur(user_id: str) -> str:
    """user_id'den JWT token üretir."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def jwt_dogrula(token: str) -> str | None:
    """JWT token'ı doğrular, geçerliyse user_id döner."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None