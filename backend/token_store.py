"""
Multi-provider OAuth credentials'ı bellekte saklar.
Yapı: email → {source: credentials}
Örnek: "umut@gmail.com" → {"gdrive": <Credentials>, "dropbox": "tok_abc", "onedrive": "ey..."}

⚠️ Sunucu restart olursa tüm credentials kaybolur.
   Production'da Redis'e taşınacak — sadece bu dosya değişecek.
"""

_store: dict = {}        # email → {source: credentials}
_page_tokens: dict = {}  # email → {source: page_token}


# ─── Credential yönetimi ───

def kaydet(email: str, source: str, credentials) -> None:
    if email not in _store:
        _store[email] = {}
    _store[email][source] = credentials


def getir(email: str, source: str):
    """Belirli bir provider'ın credential'ını döner. Yoksa None."""
    return _store.get(email, {}).get(source)


def getir_tum(email: str) -> dict:
    """Kullanıcının tüm provider credential'larını döner: {source: credentials}"""
    return _store.get(email, {})


def sil(email: str, source: str = None) -> None:
    if source:
        _store.get(email, {}).pop(source, None)
    else:
        _store.pop(email, None)


# ─── Sync page token yönetimi ───

def page_token_kaydet(email: str, source: str, token: str) -> None:
    if email not in _page_tokens:
        _page_tokens[email] = {}
    _page_tokens[email][source] = token


def page_token_getir(email: str, source: str) -> str | None:
    return _page_tokens.get(email, {}).get(source)


def page_token_sil(email: str, source: str) -> None:
    _page_tokens.get(email, {}).pop(source, None)
