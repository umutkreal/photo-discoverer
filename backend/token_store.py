"""
Google OAuth credentials'ı bellekte saklar.
Key: user_email (str)
Value: google.oauth2.credentials.Credentials nesnesi

⚠️ Sunucu restart olursa tüm credentials kaybolur.
   Production'da Redis'e taşınacak — sadece bu dosya değişecek.
"""

_store: dict = {}
_page_tokens: dict = {}


def kaydet(email: str, credentials) -> None:
    _store[email] = credentials


def getir(email: str):
    return _store.get(email)


def sil(email: str) -> None:
    _store.pop(email, None)


# ─── Sync page token yönetimi ───

def page_token_kaydet(email: str, token: str) -> None:
    """Google Drive Changes API page token'ını saklar."""
    _page_tokens[email] = token


def page_token_getir(email: str) -> str | None:
    """Kaydedilmiş page token'ı döner. Yoksa None."""
    return _page_tokens.get(email)