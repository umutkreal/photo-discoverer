"""
Senkronizasyon modülü — Google Drive Changes API ile delta sync.

İlk çalıştırmada: tüm fotoğrafları indexle, page token kaydet.
Sonraki çalıştırmalarda: sadece değişenleri işle (eklenen/silinen/güncellenen).
"""

from drive import drive_servisi_olustur, fotograflari_listele, foto_indir
from embedding import foto_vektore_cevir
from qdrant_db import collection_olustur, fotograf_kaydet, toplu_fotograf_sil
from token_store import page_token_kaydet, page_token_getir


def baslangic_token_al(drive_service) -> str:
    """Google Drive'dan ilk page token'ı alır."""
    response = drive_service.changes().getStartPageToken().execute()
    return response.get("startPageToken")


def degisiklikleri_getir(drive_service, page_token: str) -> dict:
    """
    Son sync'ten bu yana olan değişiklikleri getirir.
    Returns: {
        "eklenenler": [{"id": "...", "name": "..."}],
        "silinenler": ["file_id_1", "file_id_2"],
        "yeni_token": "..."
    }
    """
    eklenenler = []
    silinenler = []
    new_start_token = page_token

    while True:
        response = drive_service.changes().list(
            pageToken=page_token,
            fields="nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, trashed))",
            spaces="drive",
            includeRemoved=True,
        ).execute()

        for change in response.get("changes", []):
            file_id = change.get("fileId")
            removed = change.get("removed", False)
            file_info = change.get("file")

            if removed:
                silinenler.append(file_id)
                continue

            if file_info is None:
                continue

            mime_type = file_info.get("mimeType", "")
            trashed = file_info.get("trashed", False)

            if trashed:
                silinenler.append(file_id)
            elif mime_type.startswith("image/"):
                eklenenler.append({
                    "id": file_info["id"],
                    "name": file_info["name"],
                })

        # Sonraki sayfa varsa devam et
        if "nextPageToken" in response:
            page_token = response["nextPageToken"]
        else:
            new_start_token = response.get("newStartPageToken", page_token)
            break

    return {
        "eklenenler": eklenenler,
        "silinenler": silinenler,
        "yeni_token": new_start_token,
    }


def index_all(drive_service, qdrant_client, col_name, email, limit=500, folder_id=None):
    """
    İlk seferki tam indexleme.
    Tüm fotoğrafları indexler ve page token kaydeder.
    """
    collection_olustur(qdrant_client, col_name, 512)

    fotolar = fotograflari_listele(drive_service, klasor_id=folder_id, limit=limit)

    if not fotolar:
        token = baslangic_token_al(drive_service)
        page_token_kaydet(email, token)
        return {"indexed": 0, "total_found": 0, "errors": None}

    basarili = 0
    hatalar = []

    for foto in fotolar:
        try:
            image = foto_indir(drive_service, foto["id"])
            vektor = foto_vektore_cevir(image)
            fotograf_kaydet(qdrant_client, col_name, vektor, foto)
            basarili += 1
            print(f"  ✅ [{basarili}/{len(fotolar)}] {foto['name']}")
        except Exception as e:
            hatalar.append({"file": foto["name"], "error": str(e)})
            print(f"  ❌ {foto['name']}: {e}")

    # Page token kaydet — sonraki sync bu noktadan devam edecek
    token = baslangic_token_al(drive_service)
    page_token_kaydet(email, token)

    return {
        "indexed": basarili,
        "total_found": len(fotolar),
        "errors": hatalar if hatalar else None,
    }


def delta_sync(drive_service, qdrant_client, col_name, email):
    """
    Sadece değişen fotoğrafları işler.
    Yenileri ekler, silinenleri kaldırır.
    """
    saved_token = page_token_getir(email)

    if saved_token is None:
        # Hiç sync yapılmamış — caller index_all çağıracak
        return None

    # Değişiklikleri getir
    changes = degisiklikleri_getir(drive_service, saved_token)

    eklenen_sayisi = 0
    silinen_sayisi = 0
    hatalar = []

    # Silinenleri Qdrant'tan kaldır
    if changes["silinenler"]:
        try:
            toplu_fotograf_sil(qdrant_client, col_name, changes["silinenler"])
            silinen_sayisi = len(changes["silinenler"])
            print(f"  🗑️ {silinen_sayisi} fotoğraf Qdrant'tan silindi")
        except Exception as e:
            hatalar.append({"action": "silme", "error": str(e)})
            print(f"  ❌ Silme hatası: {e}")

    # Yenileri indexle
    for foto in changes["eklenenler"]:
        try:
            image = foto_indir(drive_service, foto["id"])
            vektor = foto_vektore_cevir(image)
            fotograf_kaydet(qdrant_client, col_name, vektor, foto)
            eklenen_sayisi += 1
            print(f"  ✅ Yeni: {foto['name']}")
        except Exception as e:
            hatalar.append({"file": foto["name"], "error": str(e)})
            print(f"  ❌ {foto['name']}: {e}")

    # Yeni page token'ı kaydet
    page_token_kaydet(email, changes["yeni_token"])

    return {
        "added": eklenen_sayisi,
        "deleted": silinen_sayisi,
        "errors": hatalar if hatalar else None,
    }