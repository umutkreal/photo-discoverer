from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, FilterSelector, Filter, FieldCondition, MatchValue
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
    Google Drive file_id'den deterministik Qdrant point ID üretir.
    Aynı file_id her zaman aynı ID'yi verir.
    Böylece sync sırasında silme/güncelleme yapabiliriz.
    """
    hash_bytes = hashlib.md5(file_id.encode()).digest()
    # İlk 8 byte'ı unsigned 64-bit integer'a çevir
    return int.from_bytes(hash_bytes[:8], byteorder="big")


def fotograf_kaydet(client, collection_name, vektor, foto):
    """Fotoğrafı Qdrant'a kaydeder. ID, file_id'den türetilir."""
    point_id = file_id_to_point_id(foto["id"])
    client.upsert(
        collection_name=collection_name,
        points=[
            PointStruct(
                id=point_id,
                vector=vektor,
                payload={
                    "filename": foto["name"],
                    "file_id": foto["id"],
                    "drive_url": f"https://drive.google.com/file/d/{foto['id']}/view",
                },
            )
        ],
    )


def fotograf_sil(client, collection_name, file_id: str):
    """Belirli bir fotoğrafı Qdrant'tan siler (file_id ile)."""
    point_id = file_id_to_point_id(file_id)
    client.delete(
        collection_name=collection_name,
        points_selector=[point_id],
    )


def toplu_fotograf_sil(client, collection_name, file_ids: list[str]):
    """Birden fazla fotoğrafı tek seferde siler."""
    if not file_ids:
        return
    point_ids = [file_id_to_point_id(fid) for fid in file_ids]
    client.delete(
        collection_name=collection_name,
        points_selector=point_ids,
    )