from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt_handler import jwt_dogrula
from token_store import getir_tum as credentials_getir_tum

security = HTTPBearer()


def aktif_kullanici(
    auth: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Authorization: Bearer <token> header'ından kullanıcıyı doğrular."""
    payload = jwt_dogrula(auth.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
        )
    return payload


def kullanici_tum_credentials(user: dict = Depends(aktif_kullanici)):
    """
    Kullanıcının tüm provider credential'larını döner.
    Hiçbir provider bağlı değilse 401 döner.
    """
    all_creds = credentials_getir_tum(user["email"])
    if not all_creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Hiçbir cloud hesabı bağlı değil, lütfen tekrar giriş yapın.",
        )
    return {"user": user, "credentials": all_creds}
