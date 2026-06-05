from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Optional
import asyncio
import base64
import io
from io import BytesIO
import os
import secrets
import uuid
import httpx as _httpx

from auth import (
    oauth_flow_init, oauth_flow_fetch_token, get_user_info,
    pcloud_auth_url_olustur, pcloud_token_exchange,
    onedrive_auth_url_olustur, onedrive_token_exchange,
)
from oauth_state_store import oauth_state_store_getir
from jwt_handler import jwt_olustur
from token_store import token_store_getir, page_token_sil
from user_store import User, user_store_getir, init_db
from dependencies import aktif_kullanici, aktif_kullanici_id, kullanici_tum_credentials
from embedding import metin_vektore_cevir
from qdrant_db import qdrant_baglanti, collection_olustur, fotograf_sil, duplikatlari_bul, collection_temizle
from providers.factory import provider_getir
from edit_providers import edit_provider_getir, desteklenen_providerlar, EditIslemi, EditHatasi
from sync import index_all, delta_sync
from album_store import (
    init_db as album_db_init,
    album_olustur, albumleri_listele, album_getir,
    album_yeniden_adlandir, album_sil,
    fotograf_ekle as album_fotograf_ekle,
    fotograf_cikar as album_fotograf_cikar,
    fotograf_cikar_global as album_fotograf_cikar_global,
)
from datetime import datetime, timezone

load_dotenv()

app = FastAPI(title="Photo Discovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

qdrant_client = qdrant_baglanti()
init_db()        # users, albums, album_photos, tokens, page_tokens
album_db_init()  # no-op — şema init_db() tarafından oluşturuldu
VECTOR_SIZE = 768


def _simdi_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ═══════════════════════════════════════════
#  Health
# ═══════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "Photo Discovery API çalışıyor ✅"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ═══════════════════════════════════════════
#  Auth — Google Drive
# ═══════════════════════════════════════════

@app.get("/auth/login")
def login():
    state_store = oauth_state_store_getir()
    auth_url, _ = oauth_flow_init(state_store)
    return {"auth_url": auth_url}


@app.get("/auth/callback")
def callback(code: str, state: str):
    state_store = oauth_state_store_getir()
    payload = state_store.tuket(state)
    if not payload:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi geçmiş state")

    code_verifier = payload.get("code_verifier")
    credentials = oauth_flow_fetch_token(state, code, code_verifier)
    google_user = get_user_info(credentials)
    email = google_user["email"]

    store = user_store_getir()
    mevcut = store.email_ile_getir(email)

    if mevcut:
        user_id = mevcut.user_id
    else:
        # Yeni kullanıcı oluşturma — önce Qdrant, sonra DB (invariant korunur)
        user_id = str(uuid.uuid4())
        username = store.username_uretebilir(google_user.get("name", ""), user_id[:6])
        qdrant_col = f"user_{user_id.replace('-', '')}"

        try:
            collection_olustur(qdrant_client, qdrant_col, VECTOR_SIZE)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Qdrant collection oluşturulamadı: {e}")

        store.yarat(
            user_id=user_id,
            email=email,
            username=username,
            name=google_user.get("name", ""),
            picture=google_user.get("picture", ""),
            qdrant_collection=qdrant_col,
        )

    token_store_getir().kaydet(user_id, "gdrive", credentials)
    store.son_giris_guncelle(user_id)

    jwt_token = jwt_olustur(user_id)
    frontend_url = "http://localhost:3000/auth/callback"
    name_enc    = google_user.get("name", "").replace(" ", "+")
    picture_enc = google_user.get("picture", "")
    return RedirectResponse(
        url=f"{frontend_url}?access_token={jwt_token}"
            f"&email={google_user.get('email', '')}"
            f"&name={name_enc}"
            f"&picture={picture_enc}"
    )


# ═══════════════════════════════════════════
#  Auth — Dropbox
# ═══════════════════════════════════════════

FRONTEND_INTEGRATIONS = "http://localhost:3000/account"


@app.get("/auth/dropbox/login")
def dropbox_login(user: User = Depends(aktif_kullanici)):
    app_key = os.getenv("DROPBOX_APP_KEY")
    redirect_uri = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8000/auth/dropbox/callback")

    state = secrets.token_urlsafe(16)
    state_store = oauth_state_store_getir()
    state_store.kaydet(state, {
        "provider": "dropbox",
        "email": user.email,
        "created_at": _simdi_utc(),  # DEBUG: ileride kaldırılabilir
    })

    auth_url = (
        "https://www.dropbox.com/oauth2/authorize"
        f"?client_id={app_key}"
        "&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
        "&token_access_type=offline"
        "&scope=files.content.read+files.content.write+files.metadata.read"
    )
    return {"auth_url": auth_url}


@app.get("/auth/dropbox/callback")
def dropbox_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code = request.query_params.get("code")
    state = request.query_params.get("state")

    state_store = oauth_state_store_getir()
    payload = state_store.tuket(state)
    if not payload:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=invalid_state")

    # State payload'ında email var — user_id'ye dönüştür
    email = payload["email"]
    db_user = user_store_getir().email_ile_getir(email)
    if not db_user:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=user_not_found")
    user_id = db_user.user_id

    app_key = os.getenv("DROPBOX_APP_KEY")
    app_secret = os.getenv("DROPBOX_APP_SECRET")
    redirect_uri = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8000/auth/dropbox/callback")

    try:
        resp = _httpx.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={"code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri},
            auth=(app_key, app_secret),
            timeout=15,
        )
        resp.raise_for_status()
        token_data = resp.json()
    except Exception:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=no_access_token")

    token_store_getir().kaydet(user_id, "dropbox", {
        "access_token":  access_token,
        "refresh_token": token_data.get("refresh_token"),
    })
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=dropbox")


# ═══════════════════════════════════════════
#  Auth — pCloud
# ═══════════════════════════════════════════

@app.get("/auth/pcloud/login")
def pcloud_login(user: User = Depends(aktif_kullanici)):
    state = secrets.token_urlsafe(16)
    state_store = oauth_state_store_getir()
    state_store.kaydet(state, {
        "provider": "pcloud",
        "email": user.email,
        "created_at": _simdi_utc(),  # DEBUG: ileride kaldırılabilir
    })
    auth_url = pcloud_auth_url_olustur(state)
    return {"auth_url": auth_url}


@app.get("/auth/pcloud/callback")
def pcloud_callback(request: Request):
    print(f"[pCloud callback] params={dict(request.query_params)}")
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code     = request.query_params.get("code")
    state    = request.query_params.get("state")
    hostname = request.query_params.get("hostname", "api.pcloud.com")

    state_store = oauth_state_store_getir()
    payload = state_store.tuket(state)
    if not payload:
        print(f"[pCloud callback] state not found: {state}")
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=invalid_state")

    email = payload["email"]
    db_user = user_store_getir().email_ile_getir(email)
    if not db_user:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=user_not_found")

    try:
        token_data = pcloud_token_exchange(code, hostname=hostname)
    except Exception as e:
        print(f"[pCloud callback] token exchange exception: {e}")
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    token_store_getir().kaydet(db_user.user_id, "pcloud", token_data)
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=pcloud")


# ═══════════════════════════════════════════
#  Auth — OneDrive
# ═══════════════════════════════════════════

@app.get("/auth/onedrive/login")
def onedrive_login(user: User = Depends(aktif_kullanici)):
    state = secrets.token_urlsafe(16)
    state_store = oauth_state_store_getir()
    state_store.kaydet(state, {
        "provider": "onedrive",
        "email": user.email,
        "created_at": _simdi_utc(),  # DEBUG: ileride kaldırılabilir
    })
    auth_url = onedrive_auth_url_olustur(state)
    return {"auth_url": auth_url}


@app.get("/auth/onedrive/callback")
def onedrive_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code  = request.query_params.get("code")
    state = request.query_params.get("state")

    state_store = oauth_state_store_getir()
    payload = state_store.tuket(state)
    if not payload:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=invalid_state")

    email = payload["email"]
    db_user = user_store_getir().email_ile_getir(email)
    if not db_user:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=user_not_found")

    try:
        token_data = onedrive_token_exchange(code)
    except RuntimeError:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    token_store_getir().kaydet(db_user.user_id, "onedrive", token_data)
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=onedrive")


# ═══════════════════════════════════════════
#  Users
# ═══════════════════════════════════════════

@app.get("/users/me")
def kullanici_getir(user: User = Depends(aktif_kullanici)):
    return user


@app.patch("/users/me")
def kullanici_guncelle(body: dict, user: User = Depends(aktif_kullanici)):
    store = user_store_getir()
    if "email" in body:
        yeni_email = str(body["email"]).strip()
        if not yeni_email or "@" not in yeni_email:
            raise HTTPException(400, "Geçersiz email formatı")
        mevcut = store.email_ile_getir(yeni_email)
        if mevcut and mevcut.user_id != user.user_id:
            raise HTTPException(409, "Bu email başka bir kullanıcıda kayıtlı")
        return store.email_guncelle(user.user_id, yeni_email)
    if "name" in body:
        return store.ad_guncelle(user.user_id, str(body["name"]).strip())
    raise HTTPException(400, "Geçersiz istek: 'email' veya 'name' alanı gerekli")


@app.delete("/users/me")
def hesap_sil(body: dict, user: User = Depends(aktif_kullanici)):
    expected = f"DELETE {user.email}"
    if body.get("confirm") != expected:
        raise HTTPException(400, "Onay metni eşleşmiyor")
    try:
        qdrant_client.delete_collection(user.qdrant_collection)
    except Exception:
        pass
    user_store_getir().sil(user.user_id)
    return {"deleted": True, "user_id": user.user_id}


# ═══════════════════════════════════════════
#  Index — temizle
# ═══════════════════════════════════════════

@app.delete("/index")
def index_sifirla(user: User = Depends(aktif_kullanici)):
    """Collection'daki tüm point'leri siler. Collection korunur. Page token'lar sıfırlanır."""
    silinen = collection_temizle(qdrant_client, user.qdrant_collection)
    store = token_store_getir()
    for source in VALID_PROVIDERS:
        store.page_token_sil(user.user_id, source)
    return {
        "message": "İndeks temizlendi",
        "deleted_points": silinen,
        "collection": user.qdrant_collection,
    }


# ═══════════════════════════════════════════
#  Index (tam indexleme)
# ═══════════════════════════════════════════

class IndexRequest(BaseModel):
    folder_id: Optional[str] = None
    limit: int = 500


@app.post("/index")
def index_photos(
    body: IndexRequest,
    user: User = Depends(aktif_kullanici),
):
    all_credentials = token_store_getir().getir_tum(user.user_id)
    if not all_credentials:
        raise HTTPException(401, "Hiçbir cloud hesabı bağlı değil")

    result = index_all(
        qdrant_client=qdrant_client,
        col_name=user.qdrant_collection,
        user_id=user.user_id,
        all_credentials=all_credentials,
        limit=body.limit,
        folder_id=body.folder_id,
    )

    return {
        "message":    "Indexleme tamamlandı",
        "collection": user.qdrant_collection,
        **result,
    }


# ═══════════════════════════════════════════
#  Sync (delta senkronizasyon)
# ═══════════════════════════════════════════

@app.post("/sync")
def sync_photos(user: User = Depends(aktif_kullanici)):
    all_credentials = token_store_getir().getir_tum(user.user_id)
    if not all_credentials:
        raise HTTPException(401, "Hiçbir cloud hesabı bağlı değil")

    result = delta_sync(
        qdrant_client=qdrant_client,
        col_name=user.qdrant_collection,
        user_id=user.user_id,
        all_credentials=all_credentials,
    )

    if result is None:
        return {
            "message": "Henüz indexleme yapılmamış. Önce POST /index çağırın.",
            "synced":  False,
        }

    return {"message": "Senkronizasyon tamamlandı", "synced": True, **result}


# ═══════════════════════════════════════════
#  Search
# ═══════════════════════════════════════════

@app.get("/search")
def search_photos(
    q:           str           = Query(..., description="Arama metni"),
    limit:       int           = Query(default=10, ge=1, le=50),
    offset:      int           = Query(default=0, ge=0),
    source:      Optional[str] = Query(default=None),
    year_from:   Optional[int] = Query(default=None, ge=1900, le=2100),
    year_to:     Optional[int] = Query(default=None, ge=1900, le=2100),
    camera_make: Optional[str] = Query(default=None),
    user: User = Depends(aktif_kullanici),
):
    col_name = user.qdrant_collection
    query_vector = metin_vektore_cevir(q)

    has_exif_filter = bool(year_from or year_to or camera_make)
    has_any_filter  = bool(source or has_exif_filter)

    fetch_limit = 500 if has_exif_filter else ((limit + offset) * 4 if source else limit + offset)

    search_response = qdrant_client.query_points(
        collection_name=col_name,
        query=query_vector,
        limit=fetch_limit,
    )

    points = search_response.points

    if source:
        points = [p for p in points if p.payload.get("source") == source]
    if year_from:
        points = [p for p in points if (p.payload.get("year") or 0) >= year_from]
    if year_to:
        points = [p for p in points if (p.payload.get("year") or 9999) <= year_to]
    if camera_make:
        points = [p for p in points
                  if (p.payload.get("camera_make") or "").lower() == camera_make.lower()]

    paginated = points[offset : offset + limit]

    results = []
    for hit in paginated:
        p        = hit.payload
        src      = p.get("source", "gdrive")
        file_id  = p.get("file_id")
        results.append({
            "filename":     p.get("filename"),
            "file_id":      file_id,
            "drive_url":    p.get("drive_url"),
            "source":       src,
            "folder_path":  p.get("folder_path", ""),
            "thumbnail_url": "",
            "score":        round(hit.score, 4),
            "file_size":    p.get("file_size", 0),
            "year":         p.get("year"),
            "month":        p.get("month"),
            "date_taken":   p.get("date_taken"),
            "camera_make":  p.get("camera_make"),
            "camera_model": p.get("camera_model"),
            "lat":          p.get("lat"),
            "lon":          p.get("lon"),
        })

    total_filtered = len(points)
    if not has_any_filter:
        try:
            total_filtered = qdrant_client.get_collection(col_name).points_count
        except Exception:
            total_filtered = len(points)

    return {
        "results":     results,
        "total_found": total_filtered,
        "has_more":    (offset + limit) < total_filtered,
        "query":       q,
    }


# ═══════════════════════════════════════════
#  Stats
# ═══════════════════════════════════════════

@app.get("/stats")
def collection_stats(user: User = Depends(aktif_kullanici)):
    col_name = user.qdrant_collection
    try:
        records, _ = qdrant_client.scroll(
            collection_name=col_name,
            limit=5000,
            with_payload=True,
            with_vectors=False,
        )
    except Exception:
        return {"total": 0, "with_exif": 0, "with_gps": 0, "camera_makes": []}

    total     = len(records)
    with_exif = sum(1 for r in records if r.payload.get("year") is not None)
    with_gps  = sum(1 for r in records if r.payload.get("lat")  is not None)
    makes     = sorted({r.payload["camera_make"] for r in records if r.payload.get("camera_make")})

    return {"total": total, "with_exif": with_exif, "with_gps": with_gps, "camera_makes": makes}


@app.get("/debug/collection")
def debug_collection(user_id: str = Query(...)):
    from qdrant_db import collection_adi
    col_name = collection_adi(user_id)
    try:
        records, _ = qdrant_client.scroll(
            collection_name=col_name, limit=1000,
            with_payload=True, with_vectors=False,
        )
    except Exception as e:
        return {"error": str(e), "photos": []}

    photos = [
        {
            "source":    r.payload.get("source", "?"),
            "filename":  r.payload.get("filename", "?"),
            "file_id":   r.payload.get("file_id", "?"),
            "file_size": r.payload.get("file_size", 0),
        }
        for r in records
    ]
    by_source: dict = {}
    for p in photos:
        by_source.setdefault(p["source"], []).append(p["filename"])

    return {
        "total":     len(photos),
        "by_source": {src: len(files) for src, files in by_source.items()},
        "photos":    sorted(photos, key=lambda x: (x["source"], x["filename"])),
    }


@app.get("/debug/providers")
def debug_providers(user_id: str = Query(...)):
    all_creds = token_store_getir().getir_tum(user_id)
    result = {}
    for source, creds in all_creds.items():
        try:
            provider = provider_getir(source, creds)
            photos   = provider.fotograflari_listele(limit=500)
            result[source] = {
                "count":  len(photos),
                "photos": [{"name": p["name"], "id": p["id"][:40]} for p in photos],
            }
        except Exception as e:
            result[source] = {"error": str(e), "count": 0}
    return result


# ═══════════════════════════════════════════
#  Integrations
# ═══════════════════════════════════════════

VALID_PROVIDERS    = {"gdrive", "dropbox", "onedrive", "pcloud"}
DISABLED_PROVIDERS: set = set()
PROVIDER_LABELS = {
    "gdrive":   "Google Drive",
    "dropbox":  "Dropbox",
    "pcloud":   "pCloud",
    "onedrive": "OneDrive",
}


@app.get("/integrations")
def get_integrations(user: User = Depends(aktif_kullanici)):
    all_creds = token_store_getir().getir_tum(user.user_id)
    result = {
        p: {"connected": p in all_creds, "label": PROVIDER_LABELS[p], "disabled": False}
        for p in VALID_PROVIDERS
    }
    result.update({
        p: {"connected": False, "label": PROVIDER_LABELS[p], "disabled": True}
        for p in DISABLED_PROVIDERS
    })
    return result


@app.delete("/integrations/{source}")
def revoke_integration(source: str, user: User = Depends(aktif_kullanici)):
    if source not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail="Geçersiz provider")
    store = token_store_getir()
    store.sil(user.user_id, source)
    store.page_token_sil(user.user_id, source)
    return {"message": f"{PROVIDER_LABELS[source]} bağlantısı kesildi", "source": source}


# ═══════════════════════════════════════════
#  Photo actions
# ═══════════════════════════════════════════

@app.delete("/photos/{source}/{file_id}")
def delete_photo(
    source: str,
    file_id: str,
    user: User = Depends(aktif_kullanici),
):
    if source not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail="Geçersiz provider")

    creds = token_store_getir().getir(user.user_id, source)
    if not creds:
        raise HTTPException(status_code=400, detail=f"{PROVIDER_LABELS[source]} hesabı bağlı değil")

    provider = provider_getir(source, creds)
    cloud_deleted = provider.foto_sil(file_id)

    fotograf_sil(qdrant_client, user.qdrant_collection, file_id)
    album_fotograf_cikar_global(source, file_id)

    return {"deleted": True, "cloud_deleted": cloud_deleted}


@app.get("/photos/duplicates")
def get_duplicates(
    threshold: float = Query(default=0.95, ge=0.5, le=1.0),
    limit:     int   = Query(default=300, ge=10, le=500),
    user: User = Depends(aktif_kullanici),
):
    try:
        groups = duplikatlari_bul(qdrant_client, user.qdrant_collection, threshold, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yinelenen tarama hatası: {e}")

    total_size = sum(
        p.get("file_size", 0)
        for g in groups
        for p in g[1:]
    )
    return {
        "groups":         groups,
        "total_groups":   len(groups),
        "saveable_bytes": total_size,
    }


class _PhotoRef(BaseModel):
    source:  str
    file_id: str

class ResolveRequest(BaseModel):
    keep:   _PhotoRef
    delete: list[_PhotoRef]


@app.post("/photos/duplicates/resolve")
def resolve_duplicates(body: ResolveRequest, user: User = Depends(aktif_kullanici)):
    store   = token_store_getir()
    results = []

    for item in body.delete:
        cloud_ok = False
        error    = None
        creds    = store.getir(user.user_id, item.source)
        if creds:
            try:
                prov     = provider_getir(item.source, creds)
                cloud_ok = prov.foto_sil(item.file_id)
            except Exception as e:
                error = str(e)

        try:
            fotograf_sil(qdrant_client, user.qdrant_collection, item.file_id)
            index_ok = True
        except Exception as e:
            index_ok = False
            error = error or str(e)

        results.append({
            "source":        item.source,
            "file_id":       item.file_id,
            "cloud_deleted": cloud_ok,
            "index_deleted": index_ok,
            "error":         error,
        })

    return {"resolved": len(body.delete), "results": results}


# ═══════════════════════════════════════════
#  Albums
# ═══════════════════════════════════════════

class AlbumCreateRequest(BaseModel):
    name: str

class AlbumRenameRequest(BaseModel):
    name: str

class AlbumPhotoRequest(BaseModel):
    source:      str
    file_id:     str
    filename:    str = ""
    drive_url:   str = ""
    folder_path: str = ""
    file_size:   int = 0


@app.post("/albums", status_code=201)
def create_album(body: AlbumCreateRequest, user: User = Depends(aktif_kullanici)):
    if not body.name.strip():
        raise HTTPException(400, "Albüm adı boş olamaz")
    return album_olustur(user.user_id, body.name.strip())


@app.get("/albums")
def list_albums(user: User = Depends(aktif_kullanici)):
    return {"albums": albumleri_listele(user.user_id)}


@app.get("/albums/{album_id}")
def get_album(album_id: str, user: User = Depends(aktif_kullanici)):
    album = album_getir(album_id, user.user_id)
    if not album:
        raise HTTPException(404, "Albüm bulunamadı")
    return album


@app.patch("/albums/{album_id}")
def rename_album(album_id: str, body: AlbumRenameRequest, user: User = Depends(aktif_kullanici)):
    if not body.name.strip():
        raise HTTPException(400, "Albüm adı boş olamaz")
    if not album_yeniden_adlandir(album_id, user.user_id, body.name.strip()):
        raise HTTPException(404, "Albüm bulunamadı")
    return {"message": "Albüm adı güncellendi"}


@app.delete("/albums/{album_id}")
def delete_album(album_id: str, user: User = Depends(aktif_kullanici)):
    if not album_sil(album_id, user.user_id):
        raise HTTPException(404, "Albüm bulunamadı")
    return {"message": "Albüm silindi"}


@app.post("/albums/{album_id}/photos", status_code=201)
def add_photo_to_album(album_id: str, body: AlbumPhotoRequest, user: User = Depends(aktif_kullanici)):
    if not album_fotograf_ekle(
        album_id=album_id, owner=user.user_id,
        source=body.source, file_id=body.file_id,
        filename=body.filename, drive_url=body.drive_url,
        folder_path=body.folder_path, file_size=body.file_size,
    ):
        raise HTTPException(404, "Albüm bulunamadı")
    return {"message": "Fotoğraf albüme eklendi"}


@app.delete("/albums/{album_id}/photos")
def remove_photo_from_album(
    album_id: str,
    source:   str = Query(...),
    file_id:  str = Query(...),
    user: User = Depends(aktif_kullanici),
):
    if not album_fotograf_cikar(album_id, user.user_id, source, file_id):
        raise HTTPException(404, "Albüm veya fotoğraf bulunamadı")
    return {"message": "Fotoğraf albümden çıkarıldı"}


# ═══════════════════════════════════════════
#  Thumbnail proxy
# ═══════════════════════════════════════════

@app.get("/thumbnail")
def thumbnail(
    file_id: str = Query(...),
    token:   str = Query(...),
    source:  str = Query(default="gdrive"),
):
    from fastapi.responses import Response as _Resp
    from jwt_handler import jwt_dogrula

    user_id = jwt_dogrula(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Geçersiz token")

    store = token_store_getir()

    if source == "gdrive":
        from providers.gdrive import GoogleDriveProvider
        from googleapiclient.http import MediaIoBaseDownload

        creds = store.getir(user_id, "gdrive")
        if not creds:
            raise HTTPException(status_code=401, detail="Google Drive oturumu bulunamadı")

        provider = GoogleDriveProvider(creds)
        req = provider.service.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
        return _Resp(content=buf.getvalue(), media_type="image/jpeg")

    if source == "dropbox":
        from providers.dropbox import DropboxProvider

        creds = store.getir(user_id, "dropbox")
        if not creds:
            raise HTTPException(status_code=401, detail="Dropbox oturumu bulunamadı")

        try:
            provider = DropboxProvider(creds)
            result = provider.dbx.files_get_temporary_link(file_id)
            return RedirectResponse(url=result.link, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Dropbox thumbnail hatası: {e}")

    if source == "pcloud":
        from providers.pcloud import PCloudProvider

        creds = store.getir(user_id, "pcloud")
        if not creds:
            raise HTTPException(status_code=401, detail="pCloud oturumu bulunamadı")

        try:
            provider = PCloudProvider(creds["access_token"], creds.get("hostname", "api.pcloud.com"))
            link_data = provider._get("/getthumblink", fileid=int(file_id), size="256x256", crop=0)
            download_url = f"https://{link_data['hosts'][0]}{link_data['path']}"
            return RedirectResponse(url=download_url, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"pCloud thumbnail hatası: {e}")

    if source == "onedrive":
        from token_refresh import onedrive_token_yenile

        creds = store.getir(user_id, "onedrive")
        if not creds:
            raise HTTPException(status_code=401, detail="OneDrive oturumu bulunamadı")

        def _onedrive_thumb(access_token: str) -> str:
            headers = {"Authorization": f"Bearer {access_token}"}
            resp = _httpx.get(
                f"https://graph.microsoft.com/v1.0/me/drive/items/{file_id}/thumbnails/0/medium",
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("url", "")

        try:
            thumb_url = _onedrive_thumb(creds["access_token"])
        except _httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                try:
                    creds = onedrive_token_yenile(user_id, creds["refresh_token"])
                    thumb_url = _onedrive_thumb(creds["access_token"])
                except Exception as re:
                    raise HTTPException(status_code=401, detail=f"OneDrive token yenileme başarısız: {re}")
            else:
                raise HTTPException(status_code=500, detail=f"OneDrive thumbnail hatası: {e}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OneDrive thumbnail hatası: {e}")

        return RedirectResponse(url=thumb_url, status_code=302)

    raise HTTPException(status_code=400, detail=f"Thumbnail proxy desteklenmiyor: {source}")


# =============================================================================
# AI Image Edit
# =============================================================================

class EditIstek(BaseModel):
    source:   str
    file_id:  str             = ""
    image_b64: Optional[str] = None
    edit_provider: str        = Field("replicate")
    islem:    EditIslemi

    prompt:        Optional[str]  = None
    maske_b64:     Optional[str]  = None
    guc:           float          = Field(0.85, ge=0.0, le=1.0)
    outpaint_modu: str            = "Zoom out 2x"
    adimlar:       int            = Field(50, ge=1, le=50)
    olcek:         int            = Field(2, ge=2, le=4)
    aciklama:      str            = "Fix scratches, damage, and improve overall quality"


@app.get("/edit/providers")
async def edit_provider_listesi():
    return desteklenen_providerlar()


@app.post("/edit")
async def fotograf_duzenle(
    istek: EditIstek,
    user: User = Depends(aktif_kullanici),
):
    from PIL import Image as PILImage

    loop = asyncio.get_event_loop()

    if istek.image_b64:
        try:
            img_bytes = base64.b64decode(istek.image_b64)
            gorsel = PILImage.open(BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Geçersiz görsel verisi: {e}")
    else:
        creds = token_store_getir().getir(user.user_id, istek.source)
        if not creds:
            return {"hata": f"'{istek.source}' bağlantısı bulunamadı. Önce entegrasyonlardan bağlanın."}
        try:
            cloud_provider = provider_getir(istek.source, creds)
            gorsel = await loop.run_in_executor(None, cloud_provider.foto_indir, istek.file_id)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Fotoğraf indirilemedi: {e}")

    maske = None
    if istek.maske_b64:
        maske_bytes = base64.b64decode(istek.maske_b64)
        maske = PILImage.open(BytesIO(maske_bytes)).convert("L").resize(gorsel.size)

    try:
        edit_provider = edit_provider_getir(istek.edit_provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        sonuc = await loop.run_in_executor(
            None,
            lambda: edit_provider.isle(
                islem=istek.islem,
                gorsel=gorsel,
                maske=maske,
                prompt=istek.prompt,
                guc=istek.guc,
                outpaint_modu=istek.outpaint_modu,
                adimlar=istek.adimlar,
                olcek=istek.olcek,
                aciklama=istek.aciklama,
            ),
        )
    except EditHatasi as e:
        return {"hata": e.message}

    buf = BytesIO()
    if sonuc.gorsel.mode == "RGBA":
        sonuc.gorsel.save(buf, format="PNG")
        mime_type = "image/png"
    else:
        sonuc.gorsel.save(buf, format="JPEG", quality=92)
        mime_type = "image/jpeg"
    w, h = sonuc.gorsel.size

    gorsel_buf = BytesIO()
    gorsel.save(gorsel_buf, format="JPEG", quality=92)

    return {
        "sonuc_b64":     base64.b64encode(buf.getvalue()).decode(),
        "gorsel_b64":    base64.b64encode(gorsel_buf.getvalue()).decode(),
        "mime_type":     mime_type,
        "islem":         istek.islem,
        "edit_provider": istek.edit_provider,
        "model":         sonuc.model,
        "boyut":         {"genislik": w, "yukseklik": h},
    }


# =============================================================================
# Save on cloud for edited images
# =============================================================================

class CloudSaveRequest(BaseModel):
    image_b64: str
    filename: str
    source: str
    folder: str = "PhotoMind-Edited"


@app.post("/saveOnCloud")
async def buluta_kaydet(
    istek: CloudSaveRequest,
    user: User = Depends(aktif_kullanici),
):
    src_creds = token_store_getir().getir(user.user_id, istek.source)
    if not src_creds:
        raise HTTPException(status_code=400, detail=f"'{istek.source}' bağlantısı bulunamadı")

    try:
        image_bytes = base64.b64decode(istek.image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz base64 görsel")

    provider = provider_getir(istek.source, src_creds)
    try:
        meta = provider.foto_yukle(image_bytes, istek.filename, istek.folder)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yükleme hatası: {e}")

    return {"success": True, "file": meta}
