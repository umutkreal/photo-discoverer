from abc import ABC, abstractmethod
from dataclasses import dataclass
import re
import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")


def _simdi_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class User:
    user_id: str            # UUID v4 with dashes
    email: str
    username: str           # max 30 char
    name: str
    picture: str
    qdrant_collection: str  # "user_" + uuid no dashes
    created_at: str
    last_login: str | None


class UserStore(ABC):
    @abstractmethod
    def yarat(self, user_id: str, email: str, username: str, name: str, picture: str, qdrant_collection: str) -> User:
        pass

    @abstractmethod
    def getir(self, user_id: str) -> User | None:
        pass

    @abstractmethod
    def email_ile_getir(self, email: str) -> User | None:
        pass

    @abstractmethod
    def username_uretebilir(self, name: str, user_id_ilk_6: str = "") -> str:
        pass

    @abstractmethod
    def email_guncelle(self, user_id: str, yeni_email: str) -> User:
        pass

    @abstractmethod
    def ad_guncelle(self, user_id: str, yeni_ad: str) -> User:
        pass

    @abstractmethod
    def sil(self, user_id: str) -> bool:
        pass

    @abstractmethod
    def son_giris_guncelle(self, user_id: str) -> None:
        pass


_TURKCE = str.maketrans("şçğüöıŞÇĞÜÖIİ", "scguoiSCGUOii")


def _normalize_username(name: str) -> str:
    normalized = name.translate(_TURKCE).lower()
    normalized = re.sub(r"[^a-z0-9]", "", normalized)
    return normalized[:30]


class SqliteUserStore(UserStore):
    def __init__(self, db_path: str = DB_PATH):
        self._db_path = db_path

    def _conn(self):
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _satir_to_user(self, row) -> User:
        return User(
            user_id=row["user_id"],
            email=row["email"],
            username=row["username"],
            name=row["name"] or "",
            picture=row["picture"] or "",
            qdrant_collection=row["qdrant_collection"],
            created_at=row["created_at"],
            last_login=row["last_login"],
        )

    def yarat(self, user_id: str, email: str, username: str, name: str, picture: str, qdrant_collection: str) -> User:
        created_at = _simdi_utc()
        with self._conn() as c:
            c.execute(
                """INSERT INTO users
                   (user_id, email, username, name, picture, qdrant_collection, created_at, last_login)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
                (user_id, email, username, name, picture, qdrant_collection, created_at),
            )
            c.commit()
        return User(user_id, email, username, name, picture, qdrant_collection, created_at, None)

    def getir(self, user_id: str) -> User | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return self._satir_to_user(row) if row else None

    def email_ile_getir(self, email: str) -> User | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return self._satir_to_user(row) if row else None

    def username_uretebilir(self, name: str, user_id_ilk_6: str = "") -> str:
        base = _normalize_username(name)
        if not base:
            base = f"user{user_id_ilk_6}" if user_id_ilk_6 else "user"

        with self._conn() as c:
            if not c.execute("SELECT 1 FROM users WHERE username = ?", (base,)).fetchone():
                return base
            for i in range(2, 10000):
                suffix = str(i)
                candidate = (base[: 30 - len(suffix)] + suffix)
                if not c.execute("SELECT 1 FROM users WHERE username = ?", (candidate,)).fetchone():
                    return candidate
        return f"user{user_id_ilk_6}"

    def email_guncelle(self, user_id: str, yeni_email: str) -> User:
        with self._conn() as c:
            c.execute("UPDATE users SET email = ? WHERE user_id = ?", (yeni_email, user_id))
            c.commit()
        return self.getir(user_id)

    def ad_guncelle(self, user_id: str, yeni_ad: str) -> User:
        with self._conn() as c:
            c.execute("UPDATE users SET name = ? WHERE user_id = ?", (yeni_ad, user_id))
            c.commit()
        return self.getir(user_id)

    def sil(self, user_id: str) -> bool:
        with self._conn() as c:
            cur = c.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            c.commit()
        return cur.rowcount > 0

    def son_giris_guncelle(self, user_id: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE users SET last_login = ? WHERE user_id = ?", (_simdi_utc(), user_id))
            c.commit()


def init_db(db_path: str = DB_PATH) -> None:
    """Tüm tabloları oluşturur. Idempotent — zaten varsa dokunmaz."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id           TEXT PRIMARY KEY,
            email             TEXT UNIQUE NOT NULL,
            username          TEXT UNIQUE NOT NULL,
            name              TEXT,
            picture           TEXT,
            qdrant_collection TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            last_login        TEXT
        );

        CREATE TABLE IF NOT EXISTS albums (
            album_id   TEXT PRIMARY KEY,
            owner      TEXT NOT NULL,
            name       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(owner) REFERENCES users(user_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS album_photos (
            album_id    TEXT NOT NULL,
            source      TEXT NOT NULL,
            file_id     TEXT NOT NULL,
            filename    TEXT DEFAULT '',
            drive_url   TEXT DEFAULT '',
            folder_path TEXT DEFAULT '',
            file_size   INTEGER DEFAULT 0,
            added_at    TEXT NOT NULL,
            PRIMARY KEY (album_id, source, file_id),
            FOREIGN KEY(album_id) REFERENCES albums(album_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tokens (
            user_id          TEXT NOT NULL,
            source           TEXT NOT NULL,
            credentials_json TEXT NOT NULL,
            updated_at       TEXT,
            PRIMARY KEY (user_id, source),
            FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS page_tokens (
            user_id    TEXT NOT NULL,
            source     TEXT NOT NULL,
            token      TEXT NOT NULL,
            updated_at TEXT,
            PRIMARY KEY (user_id, source),
            FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    conn.close()


_singleton: SqliteUserStore | None = None


def user_store_getir() -> SqliteUserStore:
    global _singleton
    if _singleton is None:
        _singleton = SqliteUserStore()
    return _singleton
