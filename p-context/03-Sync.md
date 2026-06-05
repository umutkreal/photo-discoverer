# 03 — İndeksleme & Delta Senkronizasyon

## Genel Bakış
İki modlu senkronizasyon sistemi: tam indeksleme (ilk kurulum veya zorla yenileme) ve delta sync (yalnızca değişiklikleri alır). Her biri `backend/sync.py`'de implement edilmiştir.

---

## `backend/sync.py`

### `index_all(qdrant_client, col_name, user_id, all_credentials, limit, folder_id)`
Tüm bağlı provider'lar için tam indeksleme yapar.

**Adımlar:**
1. Qdrant collection'ı yoksa oluşturur
2. Her provider için:
   - `fotograflari_listele()` → mevcut fotoğraf listesi
   - "Ghost" kayıtları temizle (Qdrant'ta var ama provider'da yok)
   - Her fotoğraf: `foto_indir()` → `foto_vektore_cevir()` → `fotograf_kaydet()`
3. TÜM indeksleme bittikten sonra: `baslangic_token_al()` → `T_start` → `degisiklikleri_getir(T_start)` → `T1` kaydedilir
4. Döner: `{indexed, total_found, errors}`

> T_start sonradan alınmasının nedeni: indeksleme sırasında oluşan değişiklik olaylarını bir sonraki delta sync'in yakalamaması için.

### `delta_sync(qdrant_client, col_name, user_id, all_credentials)`
Yalnızca son sync'ten bu yana değişen fotoğrafları günceller.

**Adımlar:**
1. Kaydedilmiş `page_token`'ı olmayan provider'lar atlanır (hiç indekslenmemiş)
2. Her provider için:
   - `degisiklikleri_getir(saved_token)` → `(eklenen, silinen, yeni_token)`
   - Silinen dosyalar Qdrant'tan toplu silinir
   - Eklenenler için: Qdrant'ta var mı? → varsa atla, yoksa indir+embed
   - Reconciliation: provider listesi vs Qdrant → kaçan silmeleri temizle
   - Yeni token'ı kaydet
3. Döner: `{added, deleted, errors}` (hiç token yoksa `None`)

### cTag Problemi (OneDrive)
OneDrive'da `/content` endpoint'i cTag'ı günceller. Bu delta raporunda sahte "değişti" kaydı oluşturur.

**Çözüm (3 katmanlı):**
1. Sync token indekslemeden SONRA alınır
2. `T_start` hemen tüketilir, `T1` kaydedilir
3. `delta_sync` sırasında Qdrant'ta varlık kontrolü yapılır

---

## FastAPI Endpoint'leri (`backend/main.py`)

**`POST /index`**
Body: `{ folder_id?: string, limit: int = 500 }`
- Tüm bağlı provider'lar üzerinde `index_all()` çalıştırır
- Döner: `{indexed, total_found, errors}`

**`POST /sync`**
- `delta_sync()` çalıştırır
- Döner: `{added, deleted}` veya hata mesajı
- Sync uyarıları frontend'de localStorage'a yazılarak Search sayfasında toast olarak gösterilir

---

## Frontend — `frontend/src/app/account/page.tsx`

İndeksleme ve senkronizasyon işlemleri `/account` sayfasında yer alır (eski `/dashboard` yolu artık mevcut değildir).

### Bölümler

**Tam İndeksleme:**
- Limit (varsayılan 500) girdi alanı
- `indexApi.start({ limit })` → `POST /index`
- Sonuç kartı: indekslenen / bulunan / hatalar

**Delta Senkronizasyon:**
- Tek "Senkronize Et" butonu
- `syncApi.run()` → `POST /sync`
- Sonuç: eklenen / silinen sayıları
- Sync hataları `localStorage.last_sync_warning`'a kaydedilir, Search sayfasında toast olarak gösterilir

---

## Akış Özeti

```
POST /index
  ├─ GDrive: fotograflari_listele() → indir → embed → Qdrant'a yaz
  ├─ Dropbox: aynı
  ├─ OneDrive: aynı
  └─ pCloud: aynı
  → baslangic_token_al() → T_start tüket → T1 kaydet

POST /sync (delta)
  ├─ degisiklikleri_getir(T1) → eklenen + silinen
  ├─ Silinen → toplu_fotograf_sil()
  ├─ Eklenen → Qdrant kontrolü → yeniyse embed
  └─ Yeni token kaydet
```
