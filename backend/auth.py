from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from dotenv import load_dotenv
import os
import secrets
import httpx
from datetime import datetime, timezone

from oauth_state_store import OAuthStateStore

load_dotenv()
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

REDIRECT_URI = "http://localhost:8000/auth/callback"


def _simdi_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def oauth_flow_init(state_store: OAuthStateStore) -> tuple[str, str]:
    """Auth URL ve state üretir. State store'a payload kaydeder.
    Returns: (auth_url, state)
    """
    flow = Flow.from_client_secrets_file(
        "credentials.json",
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    auth_url, state = flow.authorization_url(
        prompt="consent",
        access_type="offline",
    )
    payload: dict = {"provider": "google", "created_at": _simdi_utc()}
    # Yeni google-auth-oauthlib sürümleri PKCE otomatik kullanır;
    # code_verifier'ı token exchange için sakla.
    if getattr(flow, "code_verifier", None):
        payload["code_verifier"] = flow.code_verifier
    state_store.kaydet(state, payload)
    return auth_url, state


def oauth_flow_fetch_token(state: str, code: str, code_verifier: str | None = None) -> Credentials:
    """Token exchange yapar. CSRF doğrulaması caller tarafından yapılmış olmalı."""
    flow = Flow.from_client_secrets_file(
        "credentials.json",
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    if code_verifier:
        flow.code_verifier = code_verifier
    flow.fetch_token(code=code)
    return flow.credentials


def get_user_info(credentials):
    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    return {
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "picture": user_info.get("picture"),
    }


# ─── pCloud OAuth ─────────────────────────────────────────────

PCLOUD_CLIENT_ID     = os.getenv("PCLOUD_CLIENT_ID")
PCLOUD_CLIENT_SECRET = os.getenv("PCLOUD_CLIENT_SECRET")
PCLOUD_REDIRECT_URI  = "http://localhost:8000/auth/pcloud/callback"
PCLOUD_AUTH_URL      = "https://my.pcloud.com/oauth2/authorize"


def pcloud_auth_url_olustur(state: str) -> str:
    """State'i parametre alır, URL üretir. State yönetimi caller'ın sorumluluğunda."""
    params = (
        f"?client_id={PCLOUD_CLIENT_ID}"
        f"&redirect_uri={PCLOUD_REDIRECT_URI}"
        "&response_type=code"
        f"&state={state}"
    )
    return PCLOUD_AUTH_URL + params


def pcloud_token_exchange(code: str, hostname: str = "api.pcloud.com") -> dict:
    """Yalnızca token exchange yapar. State doğrulaması caller tarafından yapılmış olmalı.
    pCloud, token exchange için GET kullanır; redirect_uri gönderilmez.
    EU hesaplar için hostname='eapi.pcloud.com' geçilmeli."""
    resp = httpx.get(
        f"https://{hostname}/oauth2_token",
        params={
            "client_id":     PCLOUD_CLIENT_ID,
            "client_secret": PCLOUD_CLIENT_SECRET,
            "code":          code,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"[pCloud token exchange] status={resp.status_code} body={data}")

    if data.get("result", 0) != 0:
        raise RuntimeError(f"pCloud token hatası: {data.get('error', 'bilinmeyen')}")

    return {
        "access_token": data["access_token"],
        "hostname":     data.get("hostname", hostname),
    }


# ─── OneDrive OAuth (MSAL) ────────────────────────────────────

ONEDRIVE_CLIENT_ID     = os.getenv("ONEDRIVE_CLIENT_ID")
ONEDRIVE_CLIENT_SECRET = os.getenv("ONEDRIVE_CLIENT_SECRET")
ONEDRIVE_TENANT_ID     = os.getenv("ONEDRIVE_TENANT_ID", "consumers")
ONEDRIVE_REDIRECT_URI  = "http://localhost:8000/auth/onedrive/callback"
ONEDRIVE_SCOPES        = [
    "https://graph.microsoft.com/Files.ReadWrite.All",
    "https://graph.microsoft.com/User.Read",
    "offline_access",
]


def onedrive_auth_url_olustur(state: str) -> str:
    """State'i parametre alır, URL üretir. State yönetimi caller'ın sorumluluğunda."""
    scope = "%20".join(ONEDRIVE_SCOPES)
    return (
        f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}/oauth2/v2.0/authorize"
        f"?client_id={ONEDRIVE_CLIENT_ID}"
        "&response_type=code"
        f"&redirect_uri={ONEDRIVE_REDIRECT_URI}"
        f"&scope={scope}"
        f"&state={state}"
        "&prompt=consent"
    )


def onedrive_token_exchange(code: str) -> dict:
    """Yalnızca token exchange yapar. State doğrulaması caller tarafından yapılmış olmalı."""
    resp = httpx.post(
        f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}/oauth2/v2.0/token",
        data={
            "client_id":     ONEDRIVE_CLIENT_ID,
            "client_secret": ONEDRIVE_CLIENT_SECRET,
            "code":          code,
            "redirect_uri":  ONEDRIVE_REDIRECT_URI,
            "grant_type":    "authorization_code",
            "scope":         " ".join(ONEDRIVE_SCOPES),
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        raise RuntimeError(f"OneDrive token hatası: {data.get('error_description', data['error'])}")

    return {
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
    }
