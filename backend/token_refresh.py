"""
OneDrive token yenileme middleware.
Google credentials otomatik refresh yapar (google-auth library).
OneDrive için manuel refresh gereklidir.
"""

import httpx
import os

ONEDRIVE_TENANT_ID     = os.getenv("ONEDRIVE_TENANT_ID", "consumers")
ONEDRIVE_CLIENT_ID     = os.getenv("ONEDRIVE_CLIENT_ID")
ONEDRIVE_CLIENT_SECRET = os.getenv("ONEDRIVE_CLIENT_SECRET")
ONEDRIVE_SCOPES        = [
    "https://graph.microsoft.com/Files.ReadWrite.All",
    "https://graph.microsoft.com/User.Read",
    "offline_access",
]


def onedrive_token_yenile(user_id: str, refresh_token: str) -> dict:
    """Refresh token ile yeni access_token al ve SQLite'a yaz.

    Returns: {"access_token": "...", "refresh_token": "..."}
    """
    from token_store import token_store_getir  # geç import — circular import önlemek için

    resp = httpx.post(
        f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}/oauth2/v2.0/token",
        data={
            "client_id":     ONEDRIVE_CLIENT_ID,
            "client_secret": ONEDRIVE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type":    "refresh_token",
            "scope":         " ".join(ONEDRIVE_SCOPES),
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        raise RuntimeError(
            f"OneDrive token yenileme hatası: {data.get('error_description', data['error'])}"
        )

    yeni_creds = {
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token", refresh_token),
    }
    token_store_getir().kaydet(user_id, "onedrive", yeni_creds)
    return yeni_creds


def onedrive_credentials_hazirla(user_id: str) -> dict | None:
    """OneDrive credentials döner; 401 aldıktan sonra refresh için `onedrive_token_yenile` çağır."""
    from token_store import token_store_getir
    return token_store_getir().getir(user_id, "onedrive")
