import os

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
import hashlib

from auth import oauth_flow_init, oauth_flow_fetch_token, get_user_info
from jwt_handler import jwt_olustur
from token_store import kaydet as credentials_kaydet
from dependencies import aktif_kullanici, kullanici_credentials
from drive import drive_servisi_olustur, fotograflari_listele, foto_indir
from embedding import foto_vektore_cevir
from qdrant_db import qdrant_baglanti, collection_olustur, fotograf_kaydet

load_dotenv()

app = FastAPI(title="Photo Discovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
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

@app.get("/")
def root():
    return {"message": "Photo Discovery API çalışıyor ✅"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Auth ───

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

    return {
        "user": user,
        "access_token": token,
        "token_type": "bearer",
    }


@app.get("/auth/me")
def me(user: dict = Depends(aktif_kullanici)):
    return {"logged_in_user": user}


# ─── Index ───

class IndexRequest(BaseModel):
    folder_id: Optional[str] = os.getenv("DRIVE_FOLDER_ID")  # İsteğe bağlı, yoksa tüm Drive
    limit: int = 500


@app.post("/index")
def index_photos(
    body: IndexRequest,
    ctx: dict = Depends(kullanici_credentials),
):
    """
    Kullanıcının Drive fotoğraflarını indexler.
    1. Drive'dan fotoğrafları listele
    2. Her birini RAM'e indir → CLIP ile vektöre çevir
    3. Qdrant'a kaydet
    """
    user = ctx["user"]
    credentials = ctx["credentials"]
    email = user["email"]

    # Drive servisi oluştur
    drive_service = drive_servisi_olustur(credentials)

    # Kullanıcıya özel Qdrant collection'ı oluştur
    col_name = collection_adi(email)
    collection_olustur(qdrant_client, col_name, VECTOR_SIZE)

    # Fotoğrafları listele
    fotolar = fotograflari_listele(
        drive_service,
        klasor_id=body.folder_id,
        limit=body.limit,
    )

    if not fotolar:
        return {
            "message": "Drive'da fotoğraf bulunamadı",
            "indexed": 0,
            "total_found": 0,
        }

    # Her fotoğrafı indexle
    basarili = 0
    hatalar = []

    for i, foto in enumerate(fotolar):
        try:
            # 1. RAM'e indir
            image = foto_indir(drive_service, foto["id"])

            # 2. CLIP ile vektöre çevir
            vektor = foto_vektore_cevir(image)

            # 3. Qdrant'a kaydet
            fotograf_kaydet(qdrant_client, col_name, i, vektor, foto)

            basarili += 1
            print(f"  ✅ [{basarili}/{len(fotolar)}] {foto['name']}")

        except Exception as e:
            hatalar.append({"file": foto["name"], "error": str(e)})
            print(f"  ❌ {foto['name']}: {e}")

    return {
        "message": "Indexleme tamamlandı",
        "indexed": basarili,
        "total_found": len(fotolar),
        "errors": hatalar if hatalar else None,
        "collection": col_name,
    }