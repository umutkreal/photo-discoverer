"""
Multi-provider OAuth credentials — SQLite backend.
Yapı: (user_id, source) → credentials_json

Önceki in-memory implementasyondan farklı olarak server restart'ta kaybolmaz.
"""

import json
import sqlite3
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from user_store import DB_PATH

try:
    from google.oauth2.credentials import Credentials as _GoogleCredentials
    _GOOGLE_SCOPES = [
        "openid",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
except ImportError:
    _GoogleCredentials = None
    _GOOGLE_SCOPES = []


def _simdi_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class TokenStore(ABC):
    @abstractmethod
    def kaydet(self, user_id: str, source: str, credentials) -> None:
        pass

    @abstractmethod
    def getir(self, user_id: str, source: str):
        pass

    @abstractmethod
    def getir_tum(self, user_id: str) -> dict:
        pass

    @abstractmethod
    def sil(self, user_id: str, source: str | None = None) -> None:
        pass

    @abstractmethod
    def page_token_kaydet(self, user_id: str, source: str, token: str) -> None:
        pass

    @abstractmethod
    def page_token_getir(self, user_id: str, source: str) -> str | None:
        pass

    @abstractmethod
    def page_token_sil(self, user_id: str, source: str) -> None:
        pass


class SqliteTokenStore(TokenStore):
    def __init__(self, db_path: str = DB_PATH):
        self._db_path = db_path

    def _conn(self):
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _serialize(self, source: str, credentials) -> str:
        if source == "gdrive" and _GoogleCredentials and isinstance(credentials, _GoogleCredentials):
            return credentials.to_json()
        return json.dumps(credentials)

    def _deserialize(self, source: str, credentials_json: str):
        if source == "gdrive" and _GoogleCredentials:
            info = json.loads(credentials_json)
            return _GoogleCredentials.from_authorized_user_info(info, _GOOGLE_SCOPES)
        return json.loads(credentials_json)

    def kaydet(self, user_id: str, source: str, credentials) -> None:
        creds_json = self._serialize(source, credentials)
        with self._conn() as c:
            c.execute(
                """INSERT OR REPLACE INTO tokens (user_id, source, credentials_json, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (user_id, source, creds_json, _simdi_utc()),
            )
            c.commit()

    def getir(self, user_id: str, source: str):
        with self._conn() as c:
            row = c.execute(
                "SELECT credentials_json FROM tokens WHERE user_id = ? AND source = ?",
                (user_id, source),
            ).fetchone()
        return self._deserialize(source, row[0]) if row else None

    def getir_tum(self, user_id: str) -> dict:
        with self._conn() as c:
            rows = c.execute(
                "SELECT source, credentials_json FROM tokens WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        return {row[0]: self._deserialize(row[0], row[1]) for row in rows}

    def sil(self, user_id: str, source: str | None = None) -> None:
        with self._conn() as c:
            if source:
                c.execute(
                    "DELETE FROM tokens WHERE user_id = ? AND source = ?", (user_id, source)
                )
            else:
                c.execute("DELETE FROM tokens WHERE user_id = ?", (user_id,))
            c.commit()

    def page_token_kaydet(self, user_id: str, source: str, token: str) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT OR REPLACE INTO page_tokens (user_id, source, token, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (user_id, source, token, _simdi_utc()),
            )
            c.commit()

    def page_token_getir(self, user_id: str, source: str) -> str | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT token FROM page_tokens WHERE user_id = ? AND source = ?",
                (user_id, source),
            ).fetchone()
        return row[0] if row else None

    def page_token_sil(self, user_id: str, source: str) -> None:
        with self._conn() as c:
            c.execute(
                "DELETE FROM page_tokens WHERE user_id = ? AND source = ?",
                (user_id, source),
            )
            c.commit()


_singleton: SqliteTokenStore | None = None


def token_store_getir() -> SqliteTokenStore:
    global _singleton
    if _singleton is None:
        _singleton = SqliteTokenStore()
    return _singleton


# ─── Module-level convenience wrappers (sync.py ve diğerleri için) ────────

def kaydet(user_id: str, source: str, credentials) -> None:
    token_store_getir().kaydet(user_id, source, credentials)


def getir(user_id: str, source: str):
    return token_store_getir().getir(user_id, source)


def getir_tum(user_id: str) -> dict:
    return token_store_getir().getir_tum(user_id)


def sil(user_id: str, source: str | None = None) -> None:
    token_store_getir().sil(user_id, source)


def page_token_kaydet(user_id: str, source: str, token: str) -> None:
    token_store_getir().page_token_kaydet(user_id, source, token)


def page_token_getir(user_id: str, source: str) -> str | None:
    return token_store_getir().page_token_getir(user_id, source)


def page_token_sil(user_id: str, source: str) -> None:
    token_store_getir().page_token_sil(user_id, source)
