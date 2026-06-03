from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from jwt_handler import jwt_dogrula
from user_store import User, user_store_getir
from token_store import token_store_getir

security = HTTPBearer()


async def aktif_kullanici_id(
    auth: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """JWT validate → sadece user_id string döner. DB query YOK. Yüksek-frekanslı endpoint'ler için."""
    user_id = jwt_dogrula(auth.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
        )
    return user_id


async def aktif_kullanici(
    user_id: str = Depends(aktif_kullanici_id),
) -> User:
    """user_id'den User objesi DB'den fetch eder."""
    user = user_store_getir().getir(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı bulunamadı",
        )
    return user


async def kullanici_tum_credentials(
    user_id: str = Depends(aktif_kullanici_id),
) -> dict:
    """Provider credentials'ları döner. Hiçbir provider bağlı değilse 401."""
    all_creds = token_store_getir().getir_tum(user_id)
    if not all_creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hiçbir cloud hesabı bağlı değil, lütfen tekrar giriş yapın.",
        )
    return all_creds
