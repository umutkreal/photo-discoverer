from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
from googleapiclient.http import MediaIoBaseDownload
import hashlib
import httpx
import io

from auth import oauth_flow_init, oauth_flow_fetch_token, get_user_info
from jwt_handler import jwt_olustur
from token_store import kaydet as credentials_kaydet
from token_store import page_token_kaydet, page_token_getir
from dependencies import aktif_kullanici, kullanici_credentials
from drive import drive_servisi_olustur, fotograflari_listele, foto_indir
from embedding import foto_vektore_cevir, metin_vektore_cevir
from qdrant_db import qdrant_baglanti, collection_olustur, fotograf_kaydet, toplu_fotograf_sil
from sync import index_all, delta_sync, baslangic_token_al, degisiklikleri_getir

load_dotenv()

app = FastAPI(title="Photo Discovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Qdrant client (uygulama başladığında bir kez bağlan) ───
qdrant_client = qdrant_baglanti()
VECTOR_SIZE = 512


def collection_adi(email: str) -> str:
    """Her kullanıcıya özel collection adı üretir: photos_abc123..."""
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
#  Auth
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

    credentials_kaydet(user["email"], credentials)

    token = jwt_olustur(
        {
            "email": user["email"],
            "name": user["name"],
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
#  Index (tam indexleme)
# ═══════════════════════════════════════════

class IndexRequest(BaseModel):
    folder_id: Optional[str] = None
    limit: int = 500


@app.post("/index")
def index_photos(
    body: IndexRequest,
    ctx: dict = Depends(kullanici_credentials),
):
    """
    Tam indexleme — tüm fotoğrafları sıfırdan indexler.
    İlk kullanımda veya Settings'teki "Yeniden İndeksle" butonunda çağrılır.
    Bitince page_token kaydeder → sonraki /sync çağrıları delta olur.
    """
    user = ctx["user"]
    credentials = ctx["credentials"]
    email = user["email"]

    drive_service = drive_servisi_olustur(credentials)
    col_name = collection_adi(email)

    result = index_all(
        drive_service=drive_service,
        qdrant_client=qdrant_client,
        col_name=col_name,
        email=email,
        limit=body.limit,
        folder_id=body.folder_id,
    )

    return {
        "message": "Indexleme tamamlandı",
        "collection": col_name,
        **result,
    }


# ═══════════════════════════════════════════
#  Sync (delta senkronizasyon)
# ═══════════════════════════════════════════

@app.post("/sync")
def sync_photos(
    ctx: dict = Depends(kullanici_credentials),
):
    """
    Delta senkronizasyon — sadece değişenleri işler.
    - Kayıtlı page_token yoksa → "önce /index çağır" uyarısı
    - Varsa → Changes API ile yeni/silinen fotoğrafları tespit et
    - Yenileri indexle, silinenleri Qdrant'tan kaldır
    - Yeni page_token kaydet
    """
    user = ctx["user"]
    credentials = ctx["credentials"]
    email = user["email"]

    drive_service = drive_servisi_olustur(credentials)
    col_name = collection_adi(email)

    result = delta_sync(
        drive_service=drive_service,
        qdrant_client=qdrant_client,
        col_name=col_name,
        email=email,
    )

    if result is None:
        return {
            "message": "Henüz indexleme yapılmamış. Önce POST /index çağırın.",
            "synced": False,
        }

    return {
        "message": "Senkronizasyon tamamlandı",
        "synced": True,
        **result,
    }


# ═══════════════════════════════════════════
#  Search
# ═══════════════════════════════════════════

@app.get("/search")
def search_photos(
    q: str = Query(..., description="Arama metni"),
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(aktif_kullanici),
):
    """
    Doğal dilde fotoğraf arama.
    1. Metni CLIP text encoder ile 512d vektöre çevir
    2. Qdrant'ta cosine similarity araması yap
    3. offset/limit ile sayfalama
    """
    email = user["email"]
    col_name = collection_adi(email)

    query_vector = metin_vektore_cevir(q)

    search_response = qdrant_client.query_points(
        collection_name=col_name,
        query=query_vector,
        limit=limit + offset,
    )

    paginated = search_response.points[offset:]

    results = []
    for hit in paginated:
        results.append(
            {
                "filename": hit.payload.get("filename"),
                "file_id": hit.payload.get("file_id"),
                "drive_url": hit.payload.get("drive_url"),
                "thumbnail_url": f"https://drive.google.com/thumbnail?id={hit.payload.get('file_id')}&sz=w400",
                "score": round(hit.score, 4),
            }
        )

    collection_info = qdrant_client.get_collection(col_name)
    total_points = collection_info.points_count

    return {
        "results": results,
        "total_found": total_points,
        "has_more": (offset + limit) < total_points,
        "query": q,
    }
@app.get("/thumbnail/{file_id}")
def thumbnail(file_id: str, token: str = Query(...), ):
    from jwt_handler import jwt_dogrula
    from token_store import getir as credentials_getir
    
    payload = jwt_dogrula(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    
    creds = credentials_getir(payload["email"])
    if not creds:
        raise HTTPException(status_code=401, detail="Oturum bulunamadı")
    
    drive_service = drive_servisi_olustur(creds)
    request_obj = drive_service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request_obj)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/jpeg")