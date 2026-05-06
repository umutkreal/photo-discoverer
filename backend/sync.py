"""
Senkronizasyon modülü — tüm provider'lar için delta sync.

İlk çalıştırmada: tüm fotoğrafları indexle, her provider için page token kaydet.
Sonraki çalıştırmalarda: sadece değişenleri işle (eklenen/silinen).
"""

from providers.factory import provider_getir
from embedding import foto_vektore_cevir
from qdrant_db import collection_olustur, fotograf_kaydet, toplu_fotograf_sil, file_id_to_point_id
from token_store import page_token_kaydet, page_token_getir


def index_all(qdrant_client, col_name, email, all_credentials: dict, limit=500, folder_id=None):
    """
    Tam indexleme — tüm bağlı provider'ları sıfırdan indexler.
    all_credentials: {source: credentials} dict — token_store.getir_tum() çıktısı.
    """
    collection_olustur(qdrant_client, col_name, 512)

    total_indexed = 0
    total_found = 0
    all_errors = []

    for source, creds in all_credentials.items():
        print(f"\n📂 [{source}] indexleme başlıyor...")
        provider = provider_getir(source, creds)

        try:
            fotolar = provider.fotograflari_listele(klasor_id=folder_id, limit=limit)
        except Exception as e:
            all_errors.append({"source": source, "error": f"Liste alınamadı: {e}"})
            print(f"  ❌ [{source}] liste hatası: {e}")
            continue

        total_found += len(fotolar)

        # Hayalet kayıt temizliği: provider'ın listemediği eski Qdrant kayıtlarını sil
        try:
            aktif_idler = {f["id"] for f in fotolar}
            mevcut, _ = qdrant_client.scroll(
                collection_name=col_name, limit=5000,
                with_payload=True, with_vectors=False,
            )
            hayalet_idler = [
                r.payload["file_id"] for r in mevcut
                if r.payload.get("source") == source
                and r.payload.get("file_id") not in aktif_idler
            ]
            if hayalet_idler:
                toplu_fotograf_sil(qdrant_client, col_name, hayalet_idler)
                print(f"  🗑️ [{source}] {len(hayalet_idler)} hayalet kayıt temizlendi: {hayalet_idler}")
        except Exception as e:
            print(f"  ⚠️ [{source}] hayalet temizlik hatası: {e}")

        basarili = 0
        for foto in fotolar:
            try:
                image = provider.foto_indir(foto["id"])
                vektor = foto_vektore_cevir(image)
                fotograf_kaydet(qdrant_client, col_name, vektor, foto, source)
                basarili += 1
                total_indexed += 1
                print(f"  ✅ [{source}] [{basarili}/{len(fotolar)}] {foto['name']}")
            except Exception as e:
                all_errors.append({"source": source, "file": foto.get("name", "?"), "error": str(e)})
                print(f"  ❌ [{source}] {foto.get('name', '?')}: {e}")

        try:
            token = provider.baslangic_token_al()
            page_token_kaydet(email, source, token)
        except Exception as e:
            print(f"  ⚠️ [{source}] başlangıç token alınamadı: {e}")

    return {
        "indexed":     total_indexed,
        "total_found": total_found,
        "errors":      all_errors if all_errors else None,
    }


def delta_sync(qdrant_client, col_name, email, all_credentials: dict):
    """
    Delta sync — her provider için sadece son sync'ten bu yana değişenleri işler.
    Hiçbir provider için token yoksa None döner (henüz index yapılmamış demek).
    """
    added = 0
    deleted = 0
    all_errors = []
    herhangi_token_var = False

    for source, creds in all_credentials.items():
        saved_token = page_token_getir(email, source)
        if saved_token is None:
            print(f"  ⚠️ [{source}] için kayıtlı token yok, atlanıyor.")
            continue

        herhangi_token_var = True
        print(f"\n🔄 [{source}] delta sync başlıyor...")
        provider = provider_getir(source, creds)

        try:
            eklenenler, silinenler, yeni_token = provider.degisiklikleri_getir(saved_token)
        except Exception as e:
            all_errors.append({"source": source, "error": f"Değişiklik alınamadı: {e}"})
            print(f"  ❌ [{source}] değişiklik hatası: {e}")
            continue

        if silinenler:
            try:
                toplu_fotograf_sil(qdrant_client, col_name, silinenler)
                deleted += len(silinenler)
                print(f"  🗑️ [{source}] {len(silinenler)} fotoğraf silindi")
            except Exception as e:
                all_errors.append({"source": source, "action": "silme", "error": str(e)})

        for foto in eklenenler:
            try:
                image = provider.foto_indir(foto["id"])
                vektor = foto_vektore_cevir(image)
                fotograf_kaydet(qdrant_client, col_name, vektor, foto, source)
                added += 1
                print(f"  ✅ [{source}] Yeni: {foto.get('name', foto['id'])}")
            except Exception as e:
                all_errors.append({"source": source, "file": foto.get("name", "?"), "error": str(e)})
                print(f"  ❌ [{source}] {foto.get('name', '?')}: {e}")

        page_token_kaydet(email, source, yeni_token)

    if not herhangi_token_var:
        return None

    return {
        "added":   added,
        "deleted": deleted,
        "errors":  all_errors if all_errors else None,
    }
