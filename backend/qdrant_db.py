from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import os
import hashlib


def collection_adi(user_id: str) -> str:
    """user_id'den Qdrant collection adı üretir: 'user_' + UUID (dash'siz)."""
    return f"user_{user_id.replace('-', '')}"


def qdrant_baglanti():
    client = QdrantClient(
        url=os.getenv("QDRANT_URL"),
        api_key=os.getenv("QDRANT_API_KEY"),
    )
    return client


def collection_olustur(client, collection_name, vector_size):
    mevcut = [c.name for c in client.get_collections().collections]
    if collection_name not in mevcut:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
        print(f"✅ Collection oluşturuldu: {collection_name}")
    else:
        print(f"ℹ️ Collection zaten mevcut: {collection_name}")


def file_id_to_point_id(file_id: str) -> int:
    """
    file_id'den deterministik Qdrant point ID üretir.
    Aynı file_id her zaman aynı ID'yi verir — sync sırasında silme/güncelleme için.
    """
    hash_bytes = hashlib.md5(file_id.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder="big")


def fotograf_kaydet(client, collection_name, vektor, foto: dict, source: str = "gdrive"):
    """Fotoğrafı Qdrant'a kaydeder. source alanı hangi cloud'dan geldiğini belirtir."""
    point_id = file_id_to_point_id(foto["id"])
    fallback_url = f"https://drive.google.com/file/d/{foto['id']}/view" if source == "gdrive" else ""

    exif = foto.get("exif") or {}

    # None değerler payload'a dahil edilmez — Qdrant'ta alan yokmuş gibi davranır,
    # hata vermez; sadece o fotoğraf EXIF filtresi kapsamı dışında kalır.
    payload: dict = {
        "filename":     foto["name"],
        "file_id":      foto["id"],
        "drive_url":    foto.get("drive_url", fallback_url),
        "source":       source,
        "folder_path":  foto.get("folder_path", ""),
        "file_size":    foto.get("size", 0),
    }
    exif_fields = {
        "date_taken":   exif.get("date_taken"),
        "year":         exif.get("year"),
        "month":        exif.get("month"),
        "lat":          exif.get("lat"),
        "lon":          exif.get("lon"),
        "camera_make":  exif.get("camera_make"),
        "camera_model": exif.get("camera_model"),
    }
    payload.update({k: v for k, v in exif_fields.items() if v is not None})

    client.upsert(
        collection_name=collection_name,
        points=[PointStruct(id=point_id, vector=vektor, payload=payload)],
    )


def fotograf_sil(client, collection_name, file_id: str):
    point_id = file_id_to_point_id(file_id)
    client.delete(
        collection_name=collection_name,
        points_selector=[point_id],
    )


def duplikatlari_bul(client, collection_name: str, threshold: float = 0.95, limit: int = 500) -> list:
    """
    Yüksek cosine benzerliğine sahip fotoğraf gruplarını döner.
    """
    print(f"\n{'='*60}")
    print(f"🔍 DUPLIKAT TARAMA — threshold={threshold}, limit={limit}")
    print(f"{'='*60}")

    try:
        all_records, _ = client.scroll(
            collection_name=collection_name,
            limit=limit,
            with_vectors=True,
            with_payload=True,
        )
    except Exception as e:
        print(f"❌ Scroll hatası: {e}")
        return []

    print(f"📦 {len(all_records)} kayıt çekildi")

    # İLK KAYDIN VEKTÖR FORMATINI İNCELE
    if all_records:
        v = all_records[0].vector
        print(f"\n🧪 İlk kaydın vektör formatı:")
        print(f"   type: {type(v).__name__}")
        if isinstance(v, list):
            print(f"   length: {len(v)}")
            print(f"   ilk 3 değer: {v[:3]}")
        elif isinstance(v, dict):
            print(f"   keys: {list(v.keys())}")
            for k, val in v.items():
                print(f"   '{k}' → type={type(val).__name__}, len={len(val) if hasattr(val,'__len__') else '?'}")
        else:
            print(f"   value: {v}")

    visited: set = set()
    groups = []

    for idx, record in enumerate(all_records):
        if record.id in visited:
            continue

        # Vektör formatı uyumluluğu — dict ise listeye çıkar
        vec = record.vector
        if isinstance(vec, dict):
            # Named vector veya unnamed vector dict olarak gelmiş
            vec = vec.get("") or (next(iter(vec.values())) if vec else None)

        if vec is None or (hasattr(vec, '__len__') and len(vec) == 0):
            print(f"⚠️ [{idx}] {record.payload.get('filename','?')} — vektör boş/None, atlanıyor")
            visited.add(record.id)
            continue

        try:
            result = client.query_points(
                collection_name=collection_name,
                query=vec,
                limit=15,
            )
            hits = result.points
        except Exception as e:
            print(f"❌ [{idx}] {record.payload.get('filename','?')} — query_points hatası: {e}")
            visited.add(record.id)
            continue

        # Threshold filtreleme + log
        all_scores = [(h.score, h.payload.get("filename","?") if h.payload else "?") for h in hits]
        hits = [h for h in hits if h.score >= threshold]
        print(f"\n📸 [{idx}] {record.payload.get('filename','?')}")
        print(f"   tüm hits ({len(all_scores)}): {[(round(s,3), n) for s, n in all_scores]}")
        print(f"   threshold {threshold} üstü: {len(hits)}")

        # Self her zaman ilk üye — Qdrant'ın self'i döndürüp döndürmemesi fark etmez
        self_entry = {
            "file_id":     record.payload.get("file_id", str(record.id)),
            "filename":    record.payload.get("filename", ""),
            "source":      record.payload.get("source", "gdrive"),
            "drive_url":   record.payload.get("drive_url", ""),
            "file_size":   record.payload.get("file_size", 0),
            "folder_path": record.payload.get("folder_path", ""),
            "score":       1.0,
        }
        members = [self_entry]

        # Grup oluşursa visited'a eklenecek adaylar — önce topla, sonra onayla
        candidates: list[tuple] = []
        for hit in hits:
            if hit.id == record.id:
                continue  # self search sonucunda geldiyse atla, zaten ekledik
            if hit.id not in visited:
                p = hit.payload or {}
                candidates.append((
                    hit.id,
                    {
                        "file_id":     p.get("file_id", str(hit.id)),
                        "filename":    p.get("filename", ""),
                        "source":      p.get("source", "gdrive"),
                        "drive_url":   p.get("drive_url", ""),
                        "file_size":   p.get("file_size", 0),
                        "folder_path": p.get("folder_path", ""),
                        "score":       round(hit.score, 4),
                    }
                ))

        if candidates:  # en az 1 aday varsa grup oluştu
            for hit_id, entry in candidates:
                members.append(entry)
                visited.add(hit_id)  # sadece grup onaylandıktan sonra visited'a ekle
            groups.append(members)

        visited.add(record.id)

    return groups


def toplu_fotograf_sil(client, collection_name, file_ids: list[str]):
    if not file_ids:
        return
    point_ids = [file_id_to_point_id(fid) for fid in file_ids]
    client.delete(
        collection_name=collection_name,
        points_selector=point_ids,
    )
