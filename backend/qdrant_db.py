from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import os
import hashlib


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


def duplikatlari_bul(client, collection_name: str, threshold: float = 0.97, limit: int = 300) -> list:
    """
    Yüksek cosine benzerliğine sahip fotoğraf gruplarını döner (potansiyel yinelemeler).
    Her grup en az 2 üye içerir. O(n) sorgu — limit ile kısıtla.
    """
    try:
        records, _ = client.scroll(
            collection_name=collection_name,
            limit=limit,
            with_vectors=True,
            with_payload=True,
        )
    except Exception:
        return []

    visited: set = set()
    groups = []

    for record in records:
        if record.id in visited:
            continue

        try:
            hits = client.search(
                collection_name=collection_name,
                query_vector=record.vector,
                limit=10,
                score_threshold=threshold,
            )
        except Exception:
            visited.add(record.id)
            continue

        members = []
        for hit in hits:
            p = hit.payload or {}
            if hit.id == record.id:
                members.insert(0, {
                    "file_id":     record.payload.get("file_id", str(record.id)),
                    "filename":    record.payload.get("filename", ""),
                    "source":      record.payload.get("source", "gdrive"),
                    "drive_url":   record.payload.get("drive_url", ""),
                    "file_size":   record.payload.get("file_size", 0),
                    "folder_path": record.payload.get("folder_path", ""),
                    "score":       1.0,
                })
            elif hit.id not in visited:
                members.append({
                    "file_id":     p.get("file_id", str(hit.id)),
                    "filename":    p.get("filename", ""),
                    "source":      p.get("source", "gdrive"),
                    "drive_url":   p.get("drive_url", ""),
                    "file_size":   p.get("file_size", 0),
                    "folder_path": p.get("folder_path", ""),
                    "score":       round(hit.score, 4),
                })
                visited.add(hit.id)

        if len(members) >= 2:
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
