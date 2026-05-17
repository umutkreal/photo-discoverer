from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from dotenv import load_dotenv
import os
import secrets
import httpx
load_dotenv()
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/drive",          # okuma + silme (readonly yetersiz)
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

REDIRECT_URI = "http://localhost:8000/auth/callback"

_flow = None


def oauth_flow_init():
    global _flow
    _flow = Flow.from_client_secrets_file(
        "credentials.json",
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    auth_url, _ = _flow.authorization_url(
        prompt="consent",
        access_type="offline",
    )
    return auth_url


def oauth_flow_fetch_token(authorization_response_url: str):
    """Tam callback URL'sini kullanarak token al."""
    global _flow
    if _flow is None:
        raise RuntimeError("OAuth flow başlatılmamış. Önce /auth/login çağır.")
    _flow.fetch_token(authorization_response=authorization_response_url)
    return _flow.credentials


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
PCLOUD_TOKEN_URL     = "https://api.pcloud.com/oauth2_token"

_pcloud_states: dict = {}   # state → email


def pcloud_auth_url_olustur(email: str) -> str:
    state = secrets.token_urlsafe(16)
    _pcloud_states[state] = email
    params = (
        f"?client_id={PCLOUD_CLIENT_ID}"
        f"&redirect_uri={PCLOUD_REDIRECT_URI}"
        "&response_type=code"
        f"&state={state}"
    )
    return PCLOUD_AUTH_URL + params


def pcloud_token_al(code: str, state: str) -> tuple[dict, str]:
    """Döner: ({"access_token": "..."}, email)"""
    email = _pcloud_states.pop(state, None)
    if not email:
        raise RuntimeError("Geçersiz veya süresi dolmuş state parametresi")

    resp = httpx.post(
        PCLOUD_TOKEN_URL,
        data={
            "client_id":     PCLOUD_CLIENT_ID,
            "client_secret": PCLOUD_CLIENT_SECRET,
            "code":          code,
            "redirect_uri":  PCLOUD_REDIRECT_URI,
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("result", 0) != 0:
        raise RuntimeError(f"pCloud token hatası: {data.get('error', 'bilinmeyen')}")

    return {"access_token": data["access_token"]}, email


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

_onedrive_states: dict = {}   # state → email


def onedrive_auth_url_olustur(email: str) -> str:
    state = secrets.token_urlsafe(16)
    _onedrive_states[state] = email
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


def onedrive_token_al(code: str, state: str) -> tuple[dict, str]:
    """Döner: ({"access_token": "...", "refresh_token": "..."}, email)"""
    email = _onedrive_states.pop(state, None)
    if not email:
        raise RuntimeError("Geçersiz veya süresi dolmuş state parametresi")

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
    }, email