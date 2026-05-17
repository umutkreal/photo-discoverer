from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
import hashlib
import io
import os
import secrets
import httpx as _httpx

from auth import (
    oauth_flow_init, oauth_flow_fetch_token, get_user_info,
    pcloud_auth_url_olustur, pcloud_token_al,
    onedrive_auth_url_olustur, onedrive_token_al,
)
from jwt_handler import jwt_olustur
from token_store import (
    kaydet as credentials_kaydet,
    getir as credentials_getir,
    getir_tum as credentials_getir_tum,
    sil as credentials_sil,
    page_token_sil,
)
from dependencies import aktif_kullanici, kullanici_tum_credentials
from embedding import metin_vektore_cevir
from qdrant_db import qdrant_baglanti, collection_olustur, fotograf_sil, duplikatlari_bul
from providers.factory import provider_getir
from sync import index_all, delta_sync
from album_store import (
    init_db as album_db_init,
    album_olustur, albumleri_listele, album_getir,
    album_yeniden_adlandir, album_sil,
    fotograf_ekle as album_fotograf_ekle,
    fotograf_cikar as album_fotograf_cikar,
)

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
album_db_init()
VECTOR_SIZE = 512


def collection_adi(email: str) -> str:
    email_hash = hashlib.md5(email.encode()).hexdigest()[:12]
    return f"photos_{email_hash}"


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
    auth_url = oauth_flow_init()
    return {"auth_url": auth_url}


@app.get("/auth/callback")
def callback(request: Request):
    authorization_response = str(request.url)
    credentials = oauth_flow_fetch_token(authorization_response)
    user = get_user_info(credentials)

    credentials_kaydet(user["email"], "gdrive", credentials)

    token = jwt_olustur(
        {
            "email":   user["email"],
            "name":    user["name"],
            "picture": user["picture"],
        }
    )

    frontend_url = "http://localhost:3000/auth/callback"
    params = (
        f"?access_token={token}"
        f"&email={user['email']}"
        f"&name={user.get('name', '')}"
        f"&picture={user.get('picture', '')}"
    )
    return RedirectResponse(url=frontend_url + params)


@app.get("/auth/me")
def me(user: dict = Depends(aktif_kullanici)):
    return {"logged_in_user": user}


# ═══════════════════════════════════════════
#  Auth — Dropbox
# ═══════════════════════════════════════════

_dropbox_states: dict = {}   # state → email (bellekte, sunucu restart'ta sıfırlanır)
FRONTEND_INTEGRATIONS = "http://localhost:3000/settings/integrations"


@app.get("/auth/dropbox/login")
def dropbox_login(user: dict = Depends(aktif_kullanici)):
    """Dropbox OAuth2 akışını başlatır. Kullanıcıyı yetkilendirme sayfasına yönlendirir."""
    app_key = os.getenv("DROPBOX_APP_KEY")
    redirect_uri = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8000/auth/dropbox/callback")

    state = secrets.token_urlsafe(16)
    _dropbox_states[state] = user["email"]

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
    """Dropbox'tan dönen auth code'u access token ile değiştirir ve kaydeder."""
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code = request.query_params.get("code")
    state = request.query_params.get("state")

    email = _dropbox_states.pop(state, None)
    if not email:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=invalid_state")

    app_key = os.getenv("DROPBOX_APP_KEY")
    app_secret = os.getenv("DROPBOX_APP_SECRET")
    redirect_uri = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8000/auth/dropbox/callback")

    try:
        resp = _httpx.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            auth=(app_key, app_secret),
            timeout=15,
        )
        resp.raise_for_status()
        token_data = resp.json()
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    access_token = token_data.get("access_token")
    if not access_token:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=no_access_token")

    credentials_kaydet(email, "dropbox", {
        "access_token":  access_token,
        "refresh_token": token_data.get("refresh_token"),
    })
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=dropbox")


# ═══════════════════════════════════════════
#  Auth — pCloud
# ═══════════════════════════════════════════

@app.get("/auth/pcloud/login")
def pcloud_login(user: dict = Depends(aktif_kullanici)):
    auth_url = pcloud_auth_url_olustur(user["email"])
    return {"auth_url": auth_url}


@app.get("/auth/pcloud/callback")
def pcloud_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code  = request.query_params.get("code")
    state = request.query_params.get("state")

    try:
        token_data, email = pcloud_token_al(code, state)
    except RuntimeError:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    credentials_kaydet(email, "pcloud", token_data)
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=pcloud")


# ═══════════════════════════════════════════
#  Auth — OneDrive
# ═══════════════════════════════════════════

@app.get("/auth/onedrive/login")
def onedrive_login(user: dict = Depends(aktif_kullanici)):
    auth_url = onedrive_auth_url_olustur(user["email"])
    return {"auth_url": auth_url}


@app.get("/auth/onedrive/callback")
def onedrive_callback(request: Request):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error={error}")

    code  = request.query_params.get("code")
    state = request.query_params.get("state")

    try:
        token_data, email = onedrive_token_al(code, state)
    except RuntimeError:
        return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?error=token_exchange_failed")

    credentials_kaydet(email, "onedrive", token_data)
    return RedirectResponse(f"{FRONTEND_INTEGRATIONS}?connected=onedrive")


# ═══════════════════════════════════════════
#  Index (tam indexleme)
# ═══════════════════════════════════════════

class IndexRequest(BaseModel):
    folder_id: Optional[str] = None
    limit: int = 500


@app.post("/index")
def index_photos(
    body: IndexRequest,
    ctx: dict = Depends(kullanici_tum_credentials),
):
    """
    Tam indexleme — tüm bağlı cloud provider'larını sıfırdan indexler.
    Bitince her provider için page_token kaydeder.
    """
    user = ctx["user"]
    all_credentials = ctx["credentials"]
    email = user["email"]
    col_name = collection_adi(email)

    result = index_all(
        qdrant_client=qdrant_client,
        col_name=col_name,
        email=email,
        all_credentials=all_credentials,
        limit=body.limit,
        folder_id=body.folder_id,
    )

    return {
        "message":    "Indexleme tamamlandı",
        "collection": col_name,
        **result,
    }


# ═══════════════════════════════════════════
#  Sync (delta senkronizasyon)
# ═══════════════════════════════════════════

@app.post("/sync")
def sync_photos(
    ctx: dict = Depends(kullanici_tum_credentials),
):
    """
    Delta sync — sadece son sync'ten bu yana değişenleri işler.
    Kayıtlı token yoksa "önce /index çağır" uyarısı döner.
    """
    user = ctx["user"]
    all_credentials = ctx["credentials"]
    email = user["email"]
    col_name = collection_adi(email)

    result = delta_sync(
        qdrant_client=qdrant_client,
        col_name=col_name,
        email=email,
        all_credentials=all_credentials,
    )

    if result is None:
        return {
            "message": "Henüz indexleme yapılmamış. Önce POST /index çağırın.",
            "synced":  False,
        }

    return {
        "message": "Senkronizasyon tamamlandı",
        "synced":  True,
        **result,
    }


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
    user: dict = Depends(aktif_kullanici),
):
    email    = user["email"]
    col_name = collection_adi(email)

    query_vector = metin_vektore_cevir(q)

    has_exif_filter = bool(year_from or year_to or camera_make)
    has_any_filter  = bool(source or has_exif_filter)

    # EXIF filtresi varsa koleksiyonun büyük bölümünü çek (kişisel arşiv için 500 yeterli)
    fetch_limit = 500 if has_exif_filter else ((limit + offset) * 4 if source else limit + offset)

    search_response = qdrant_client.query_points(
        collection_name=col_name,
        query=query_vector,
        limit=fetch_limit,
    )

    points = search_response.points

    # Python tarafı filtreleme — Qdrant filter API versiyonuyla uyumsuzluk olmasın diye
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
            "thumbnail_url": "",   # frontend thumbnailUrl() fonksiyonu üretiyor
            "score":        round(hit.score, 4),
            "file_size":    p.get("file_size", 0),
            # EXIF — yoksa None, frontend buna toleranslı
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
#  Stats (EXIF kapsam istatistikleri)
# ═══════════════════════════════════════════

@app.get("/stats")
def collection_stats(user: dict = Depends(aktif_kullanici)):
    """Koleksiyondaki EXIF ve GPS kapsamını döner. Dropdown için camera_makes listesi içerir."""
    col_name = collection_adi(user["email"])
    try:
        records, _ = qdrant_client.scroll(
            collection_name=col_name,
            limit=5000,
            with_payload=True,
            with_vectors=False,
        )
    except Exception:
        return {"total": 0, "with_exif": 0, "with_gps": 0, "camera_makes": []}

    total      = len(records)
    with_exif  = sum(1 for r in records if r.payload.get("year") is not None)
    with_gps   = sum(1 for r in records if r.payload.get("lat")  is not None)
    makes      = sorted({r.payload["camera_make"] for r in records if r.payload.get("camera_make")})

    return {
        "total":        total,
        "with_exif":    with_exif,
        "with_gps":     with_gps,
        "camera_makes": makes,
    }


@app.get("/debug/collection")
def debug_collection(email: str = Query(...)):
    """Qdrant'taki tüm kayıtları listeler — auth gerektirmez, sadece dev ortamı."""
    col_name = collection_adi(email)
    try:
        records, _ = qdrant_client.scroll(
            collection_name=col_name,
            limit=1000,
            with_payload=True,
            with_vectors=False,
        )
    except Exception as e:
        return {"error": str(e), "photos": []}

    photos = [
        {
            "source":   r.payload.get("source", "?"),
            "filename": r.payload.get("filename", "?"),
            "file_id":  r.payload.get("file_id", "?"),
            "file_size": r.payload.get("file_size", 0),
        }
        for r in records
    ]

    by_source: dict = {}
    for p in photos:
        by_source.setdefault(p["source"], []).append(p["filename"])

    return {
        "total":    len(photos),
        "by_source": {src: len(files) for src, files in by_source.items()},
        "photos":   sorted(photos, key=lambda x: (x["source"], x["filename"])),
    }


@app.get("/debug/providers")
def debug_providers(email: str = Query(...)):
    """Her provider'ın kaç fotoğraf listelediğini gösterir — auth gerektirmez."""
    all_creds = credentials_getir_tum(email)
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
#  Integrations (bağlı hesaplar)
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
def get_integrations(user: dict = Depends(aktif_kullanici)):
    """Kullanıcının hangi provider'lara bağlı olduğunu döner."""
    all_creds = credentials_getir_tum(user["email"])
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
def revoke_integration(source: str, user: dict = Depends(aktif_kullanici)):
    """Bir provider bağlantısını keser ve sync token'ını siler."""
    if source not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail="Geçersiz provider")
    credentials_sil(user["email"], source)
    page_token_sil(user["email"], source)
    return {"message": f"{PROVIDER_LABELS[source]} bağlantısı kesildi", "source": source}


# ═══════════════════════════════════════════
#  Photo actions (silme, yinelenenleri bul)
# ═══════════════════════════════════════════

@app.delete("/photos/{source}/{file_id}")
def delete_photo(
    source: str,
    file_id: str,
    user: dict = Depends(aktif_kullanici),
):
    """
    Fotoğrafı hem cloud provider'dan hem de Qdrant'tan siler.
    """
    if source not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail="Geçersiz provider")

    creds = credentials_getir(user["email"], source)
    if not creds:
        raise HTTPException(status_code=400, detail=f"{PROVIDER_LABELS[source]} hesabı bağlı değil")

    provider = provider_getir(source, creds)
    cloud_deleted = provider.foto_sil(file_id)

    col_name = collection_adi(user["email"])
    fotograf_sil(qdrant_client, col_name, file_id)

    return {"deleted": True, "cloud_deleted": cloud_deleted}


@app.get("/photos/duplicates")
def get_duplicates(
    threshold: float = Query(default=0.95, ge=0.5, le=1.0),
    limit:     int   = Query(default=300, ge=10, le=500),
    user: dict = Depends(aktif_kullanici),
):
    col_name = collection_adi(user["email"])
    try:
        groups = duplikatlari_bul(qdrant_client, col_name, threshold, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yinelenen tarama hatası: {e}")

    total_size = sum(
        p.get("file_size", 0)
        for g in groups
        for p in g[1:]   # ilk fotoğraf dışındakiler silinebilir
    )
    return {
        "groups":       groups,
        "total_groups": len(groups),
        "saveable_bytes": total_size,
    }


class _PhotoRef(BaseModel):
    source:  str
    file_id: str

class ResolveRequest(BaseModel):
    keep:   _PhotoRef
    delete: list[_PhotoRef]


@app.post("/photos/duplicates/resolve")
def resolve_duplicates(body: ResolveRequest, user: dict = Depends(aktif_kullanici)):
    """
    keep: saklanacak fotoğraf — dokunulmaz.
    delete: kalıcı silinecekler — önce buluttan, sonra Qdrant'tan.
    """
    email    = user["email"]
    col_name = collection_adi(email)
    results  = []

    for item in body.delete:
        cloud_ok = False
        error    = None
        creds    = credentials_getir(email, item.source)
        if creds:
            try:
                prov     = provider_getir(item.source, creds)
                cloud_ok = prov.foto_sil(item.file_id)
            except Exception as e:
                error = str(e)

        try:
            fotograf_sil(qdrant_client, col_name, item.file_id)
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
def create_album(body: AlbumCreateRequest, user: dict = Depends(aktif_kullanici)):
    if not body.name.strip():
        raise HTTPException(400, "Albüm adı boş olamaz")
    return album_olustur(user["email"], body.name.strip())


@app.get("/albums")
def list_albums(user: dict = Depends(aktif_kullanici)):
    return {"albums": albumleri_listele(user["email"])}


@app.get("/albums/{album_id}")
def get_album(album_id: str, user: dict = Depends(aktif_kullanici)):
    album = album_getir(album_id, user["email"])
    if not album:
        raise HTTPException(404, "Albüm bulunamadı")
    return album


@app.patch("/albums/{album_id}")
def rename_album(album_id: str, body: AlbumRenameRequest, user: dict = Depends(aktif_kullanici)):
    if not body.name.strip():
        raise HTTPException(400, "Albüm adı boş olamaz")
    if not album_yeniden_adlandir(album_id, user["email"], body.name.strip()):
        raise HTTPException(404, "Albüm bulunamadı")
    return {"message": "Albüm adı güncellendi"}


@app.delete("/albums/{album_id}")
def delete_album(album_id: str, user: dict = Depends(aktif_kullanici)):
    if not album_sil(album_id, user["email"]):
        raise HTTPException(404, "Albüm bulunamadı")
    return {"message": "Albüm silindi"}


@app.post("/albums/{album_id}/photos", status_code=201)
def add_photo_to_album(album_id: str, body: AlbumPhotoRequest, user: dict = Depends(aktif_kullanici)):
    if not album_fotograf_ekle(
        album_id=album_id, owner=user["email"],
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
    user: dict = Depends(aktif_kullanici),
):
    if not album_fotograf_cikar(album_id, user["email"], source, file_id):
        raise HTTPException(404, "Albüm veya fotoğraf bulunamadı")
    return {"message": "Fotoğraf albümden çıkarıldı"}


# ═══════════════════════════════════════════
#  Thumbnail proxy (tüm provider'lar)
# ═══════════════════════════════════════════

@app.get("/thumbnail")
def thumbnail(
    file_id: str = Query(...),
    token:   str = Query(...),
    source:  str = Query(default="gdrive"),
):
    from fastapi.responses import Response as _Resp
    from jwt_handler import jwt_dogrula

    payload = jwt_dogrula(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Geçersiz token")

    email = payload["email"]

    if source == "gdrive":
        from providers.gdrive import GoogleDriveProvider
        from googleapiclient.http import MediaIoBaseDownload

        creds = credentials_getir(email, "gdrive")
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

        creds = credentials_getir(email, "dropbox")
        if not creds:
            raise HTTPException(status_code=401, detail="Dropbox oturumu bulunamadı")

        try:
            provider = DropboxProvider(creds)
            # Geçici CDN linki al → browser doğrudan Dropbox'tan yükler, backend veri taşımaz
            result = provider.dbx.files_get_temporary_link(file_id)
            return RedirectResponse(url=result.link, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Dropbox thumbnail hatası: {e}")

    if source == "pcloud":
        from providers.pcloud import PCloudProvider

        creds = credentials_getir(email, "pcloud")
        if not creds:
            raise HTTPException(status_code=401, detail="pCloud oturumu bulunamadı")

        try:
            provider = PCloudProvider(creds["access_token"])
            link_data = provider._get("/getthumb", fileid=int(file_id), size="256x256", crop=0)
            download_url = f"https://{link_data['hosts'][0]}{link_data['path']}"
            return RedirectResponse(url=download_url, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"pCloud thumbnail hatası: {e}")

    if source == "onedrive":
        from providers.onedrive import OneDriveProvider

        creds = credentials_getir(email, "onedrive")
        if not creds:
            raise HTTPException(status_code=401, detail="OneDrive oturumu bulunamadı")

        try:
            headers = {"Authorization": f"Bearer {creds['access_token']}"}
            resp = _httpx.get(
                f"https://graph.microsoft.com/v1.0/me/drive/items/{file_id}/thumbnails/0/medium",
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            thumb_url = resp.json().get("url", "")
            return RedirectResponse(url=thumb_url, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OneDrive thumbnail hatası: {e}")

    raise HTTPException(status_code=400, detail=f"Thumbnail proxy desteklenmiyor: {source}")
