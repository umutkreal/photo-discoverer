"""
Cross-cloud sanal albüm depolama — SQLite.
Fotoğraflar yerinde kalır, sadece referanslar (source + file_id) saklanır.
"""

import sqlite3
import uuid
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "albums.db")


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS albums (
                album_id   TEXT PRIMARY KEY,
                owner      TEXT NOT NULL,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        c.execute("""
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
                FOREIGN KEY (album_id) REFERENCES albums(album_id) ON DELETE CASCADE
            )
        """)
        c.commit()


def album_olustur(owner: str, name: str) -> dict:
    album_id   = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    with _conn() as c:
        c.execute(
            "INSERT INTO albums (album_id, owner, name, created_at) VALUES (?, ?, ?, ?)",
            (album_id, owner, name, created_at),
        )
        c.commit()
    return {"album_id": album_id, "owner": owner, "name": name, "created_at": created_at, "photo_count": 0}


def albumleri_listele(owner: str) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT a.album_id, a.owner, a.name, a.created_at,
                   COUNT(p.file_id) AS photo_count
            FROM albums a
            LEFT JOIN album_photos p ON a.album_id = p.album_id
            WHERE a.owner = ?
            GROUP BY a.album_id
            ORDER BY a.created_at DESC
        """, (owner,)).fetchall()
    return [dict(r) for r in rows]


def album_getir(album_id: str, owner: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM albums WHERE album_id = ? AND owner = ?",
            (album_id, owner),
        ).fetchone()
        if not row:
            return None
        photos = c.execute(
            "SELECT * FROM album_photos WHERE album_id = ? ORDER BY added_at",
            (album_id,),
        ).fetchall()
    result = dict(row)
    result["photos"] = [dict(p) for p in photos]
    return result


def album_yeniden_adlandir(album_id: str, owner: str, name: str) -> bool:
    with _conn() as c:
        cur = c.execute(
            "UPDATE albums SET name = ? WHERE album_id = ? AND owner = ?",
            (name, album_id, owner),
        )
        c.commit()
    return cur.rowcount > 0


def album_sil(album_id: str, owner: str) -> bool:
    with _conn() as c:
        cur = c.execute(
            "DELETE FROM albums WHERE album_id = ? AND owner = ?",
            (album_id, owner),
        )
        c.commit()
    return cur.rowcount > 0


def fotograf_ekle(
    album_id: str, owner: str, source: str, file_id: str,
    filename: str = "", drive_url: str = "",
    folder_path: str = "", file_size: int = 0,
) -> bool:
    with _conn() as c:
        if not c.execute(
            "SELECT 1 FROM albums WHERE album_id = ? AND owner = ?", (album_id, owner)
        ).fetchone():
            return False
        c.execute("""
            INSERT OR REPLACE INTO album_photos
            (album_id, source, file_id, filename, drive_url, folder_path, file_size, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (album_id, source, file_id, filename, drive_url, folder_path, file_size,
              datetime.utcnow().isoformat()))
        c.commit()
    return True


def fotograf_cikar(album_id: str, owner: str, source: str, file_id: str) -> bool:
    with _conn() as c:
        if not c.execute(
            "SELECT 1 FROM albums WHERE album_id = ? AND owner = ?", (album_id, owner)
        ).fetchone():
            return False
        c.execute(
            "DELETE FROM album_photos WHERE album_id = ? AND source = ? AND file_id = ?",
            (album_id, source, file_id),
        )
        c.commit()
    return True
