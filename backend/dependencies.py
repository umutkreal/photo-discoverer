from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jwt_handler import jwt_dogrula
from token_store import getir as credentials_getir

security = HTTPBearer()


def aktif_kullanici(
    auth: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Authorization: Bearer <token> header'ından kullanıcıyı doğrular.
    Başarısızsa 401 döner.
    """
    payload = jwt_dogrula(auth.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
        )
    return payload


def kullanici_credentials(user: dict = Depends(aktif_kullanici)):
    """
    Kullanıcının Google credentials'ını döner.
    /index ve /search endpoint'lerinde lazım olacak.
    """
    creds = credentials_getir(user["email"])
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google oturumu bulunamadı, tekrar login olun",
        )
    return {"user": user, "credentials": creds}