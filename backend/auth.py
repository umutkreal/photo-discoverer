from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import os

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/drive.readonly",
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