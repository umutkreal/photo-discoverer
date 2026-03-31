"""
Google OAuth credentials'ı bellekte saklar.
Key: user_email (str)
Value: google.oauth2.credentials.Credentials nesnesi

⚠️ Sunucu restart olursa tüm credentials kaybolur.
   Production'da Redis'e taşınacak — sadece bu dosya değişecek.
"""

_store: dict = {}


def kaydet(email: str, credentials) -> None:
    _store[email] = credentials


def getir(email: str):
    return _store.get(email)


def sil(email: str) -> None:
    _store.pop(email, None)