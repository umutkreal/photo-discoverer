"""
Senkronizasyon modülü — tüm provider'lar için delta sync.

İlk çalıştırmada: tüm fotoğrafları indexle, her provider için page token kaydet.
Sonraki çalıştırmalarda: sadece değişenleri işle (eklenen/silinen).
"""

from providers.factory import provider_getir
from providers.pcloud import PCloudAuthError
from embedding import foto_vektore_cevir
from qdrant_db import collection_olustur, fotograf_kaydet, toplu_fotograf_sil, file_id_to_point_id
from token_store import page_token_kaydet, page_token_getir, sil as token_sil
from album_store import fotograf_cikar_global as album_fotograf_cikar_global
from token_refresh import onedrive_token_yenile


def _is_onedrive_401(e: Exception) -> bool:
    return hasattr(e, "response") and getattr(e.response, "status_code", None) == 401


def _onedrive_refresh(user_id: str, creds: dict) -> tuple[dict, object]:
    """Token yenile, yeni (creds, provider) döndür."""
    new_creds = onedrive_token_yenile(user_id, creds["refresh_token"])
    return new_creds, provider_getir("onedrive", new_creds)


def index_all(qdrant_client, col_name, user_id, all_credentials: dict, limit=500, folder_id=None):
    """
    Tam indexleme — tüm bağlı provider'ları sıfırdan indexler.
    all_credentials: {source: credentials} dict — token_store.getir_tum() çıktısı.
    Collection user yaratılırken oluşturulmuştu (eager creation); burada zaten var varsayılır.
    """
    collection_olustur(qdrant_client, col_name, 512)

    total_indexed = 0
    total_found = 0
    all_errors = []
    needs_reauth: list[str] = []

    for source, creds in all_credentials.items():
        print(f"\n📂 [{source}] indexleme başlıyor...")
        provider = provider_getir(source, creds)

        try:
            fotolar = provider.fotograflari_listele(klasor_id=folder_id, limit=limit)
        except PCloudAuthError as e:
            token_sil(user_id, source)
            needs_reauth.append(source)
            all_errors.append({"source": source, "error": str(e), "auth_required": True})
            print(f"  ❌ [{source}] kimlik doğrulama hatası, token silindi: {e}")
            continue
        except Exception as e:
            if source == "onedrive" and _is_onedrive_401(e):
                print(f"  🔄 [{source}] 401 — token yenileniyor...")
                try:
                    creds, provider = _onedrive_refresh(user_id, creds)
                    fotolar = provider.fotograflari_listele(klasor_id=folder_id, limit=limit)
                except Exception as re:
                    token_sil(user_id, source)
                    needs_reauth.append(source)
                    all_errors.append({"source": source, "error": str(re), "auth_required": True})
                    print(f"  ❌ [{source}] token yenileme başarısız: {re}")
                    continue
            else:
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
                for fid in hayalet_idler:
                    album_fotograf_cikar_global(source, fid)
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

        # Tüm download'lardan SONRA token al — T_start'ı hemen tüket, T1'i kaydet
        try:
            token = provider.baslangic_token_al()
            _, _, gelismis_token = provider.degisiklikleri_getir(token)
            page_token_kaydet(user_id, source, gelismis_token)
        except Exception as e:
            print(f"  ⚠️ [{source}] başlangıç token alınamadı: {e}")

    return {
        "indexed":      total_indexed,
        "total_found":  total_found,
        "errors":       all_errors if all_errors else None,
        "needs_reauth": needs_reauth if needs_reauth else None,
    }


def delta_sync(qdrant_client, col_name, user_id, all_credentials: dict):
    """
    Delta sync — her provider için sadece son sync'ten bu yana değişenleri işler.
    Hiçbir provider için token yoksa None döner (henüz index yapılmamış demek).
    """
    added = 0
    deleted = 0
    all_errors = []
    needs_reauth: list[str] = []
    herhangi_token_var = False

    for source, creds in all_credentials.items():
        saved_token = page_token_getir(user_id, source)
        if not saved_token:  # None veya boş string
            print(f"  ⚠️ [{source}] için kayıtlı token yok, atlanıyor.")
            continue

        herhangi_token_var = True
        print(f"\n🔄 [{source}] delta sync başlıyor...")
        provider = provider_getir(source, creds)

        try:
            eklenenler, silinenler, yeni_token = provider.degisiklikleri_getir(saved_token)
        except PCloudAuthError as e:
            token_sil(user_id, source)
            needs_reauth.append(source)
            all_errors.append({"source": source, "error": str(e), "auth_required": True})
            print(f"  ❌ [{source}] kimlik doğrulama hatası, token silindi: {e}")
            continue
        except Exception as e:
            if source == "onedrive" and _is_onedrive_401(e):
                print(f"  🔄 [{source}] 401 — token yenileniyor...")
                try:
                    creds, provider = _onedrive_refresh(user_id, creds)
                    eklenenler, silinenler, yeni_token = provider.degisiklikleri_getir(saved_token)
                except Exception as re:
                    token_sil(user_id, source)
                    needs_reauth.append(source)
                    all_errors.append({"source": source, "error": str(re), "auth_required": True})
                    print(f"  ❌ [{source}] token yenileme başarısız: {re}")
                    continue
            else:
                all_errors.append({"source": source, "error": f"Değişiklik alınamadı: {e}"})
                print(f"  ❌ [{source}] değişiklik hatası: {e}")
                continue

        # Delta'dan gelen silmeler
        if silinenler:
            try:
                toplu_fotograf_sil(qdrant_client, col_name, silinenler)
                for fid in silinenler:
                    album_fotograf_cikar_global(source, fid)
                deleted += len(silinenler)
                print(f"  🗑️ [{source}] delta: {len(silinenler)} fotoğraf silindi")
            except Exception as e:
                all_errors.append({"source": source, "action": "silme", "error": str(e)})

        # Eklenenler — Qdrant'ta zaten var olanları atla
        for foto in eklenenler:
            try:
                point_id = file_id_to_point_id(foto["id"])
                if qdrant_client.retrieve(collection_name=col_name, ids=[point_id]):
                    print(f"  ⏭️ [{source}] Zaten mevcut, atlanıyor: {foto.get('name', foto['id'])}")
                    continue
                image = provider.foto_indir(foto["id"])
                vektor = foto_vektore_cevir(image)
                fotograf_kaydet(qdrant_client, col_name, vektor, foto, source)
                added += 1
                print(f"  ✅ [{source}] Yeni: {foto.get('name', foto['id'])}")
            except Exception as e:
                all_errors.append({"source": source, "file": foto.get("name", "?"), "error": str(e)})
                print(f"  ❌ [{source}] {foto.get('name', '?')}: {e}")

        # Reconciliation: delta'nın kaçırdığı silmeleri yakala
        # Provider'ın güncel listesiyle Qdrant'ı karşılaştır
        try:
            provider_fotolar = provider.fotograflari_listele(limit=5000)
            provider_idler = {f["id"] for f in provider_fotolar}
            mevcut_points, _ = qdrant_client.scroll(
                collection_name=col_name, limit=5000,
                with_payload=True, with_vectors=False,
            )
            kayip_idler = [
                r.payload["file_id"] for r in mevcut_points
                if r.payload.get("source") == source
                and r.payload.get("file_id") not in provider_idler
            ]
            if kayip_idler:
                toplu_fotograf_sil(qdrant_client, col_name, kayip_idler)
                for fid in kayip_idler:
                    album_fotograf_cikar_global(source, fid)
                deleted += len(kayip_idler)
                print(f"  🗑️ [{source}] reconciliation: {len(kayip_idler)} kayıp dosya temizlendi")

            # Ters kontrol: provider'da olup Qdrant'ta olmayan dosyaları yeniden indeksle
            mevcut_source_idler = {
                r.payload["file_id"] for r in mevcut_points
                if r.payload.get("source") == source
            }
            eksik_fotolar = [f for f in provider_fotolar if f["id"] not in mevcut_source_idler]
            if eksik_fotolar:
                print(f"  🔁 [{source}] {len(eksik_fotolar)} eksik dosya yeniden indeksleniyor...")
                for foto in eksik_fotolar:
                    try:
                        image = provider.foto_indir(foto["id"])
                        vektor = foto_vektore_cevir(image)
                        fotograf_kaydet(qdrant_client, col_name, vektor, foto, source)
                        added += 1
                        print(f"  ✅ [{source}] Eksik geri yüklendi: {foto.get('name', foto['id'])}")
                    except Exception as e:
                        all_errors.append({"source": source, "file": foto.get("name", "?"), "error": str(e)})
                        print(f"  ❌ [{source}] {foto.get('name', '?')}: {e}")
        except Exception as e:
            print(f"  ⚠️ [{source}] reconciliation hatası: {e}")

        page_token_kaydet(user_id, source, yeni_token)

    if not herhangi_token_var:
        return None

    return {
        "added":        added,
        "deleted":      deleted,
        "errors":       all_errors if all_errors else None,
        "needs_reauth": needs_reauth if needs_reauth else None,
    }
