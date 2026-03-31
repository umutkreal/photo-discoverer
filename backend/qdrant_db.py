from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import os

def qdrant_baglanti():
    client = QdrantClient(
        url=os.getenv("QDRANT_URL"),
        api_key=os.getenv("QDRANT_API_KEY")
    )
    return client

def collection_olustur(client, collection_name, vector_size):
    mevcut = [c.name for c in client.get_collections().collections]
    if collection_name not in mevcut:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE)
        )
        print("✅ Collection oluşturuldu!")
    else:
        print("ℹ️ Collection zaten mevcut, atlandı.")

def fotograf_kaydet(client, collection_name, index, vektor, foto):
    client.upsert(
        collection_name=collection_name,
        points=[PointStruct(
            id=index,
            vector=vektor,
            payload={
                "filename": foto["name"],
                "file_id": foto["id"],
                "drive_url": f"https://drive.google.com/file/d/{foto['id']}/view"
            }
        )]
    )