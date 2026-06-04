# 02 — Arama (CLIP + Qdrant)

## Genel Bakış
Doğal dil ile fotoğraf araması. Kullanıcının yazdığı metin, CLIP modeliyle vektöre çevrilir ve Qdrant'ta cosine similarity ile eşleştirilen fotoğraflar listelenir.

---

## Backend

### `backend/embedding.py`
CLIP modelini (`openai/clip-vit-base-patch32`) sarmalar. Sunucu başlangıcında yüklenir (~500 MB RAM).

| Fonksiyon | Giriş | Çıkış |
|-----------|-------|-------|
| `foto_vektore_cevir(image: PIL.Image)` | PIL görüntü | 512 boyutlu normalize float listesi |
| `metin_vektore_cevir(text: str)` | Metin | 512 boyutlu normalize float listesi |

Her iki çıkış da `F.normalize()` ile normalize edilir; cosine similarity hesabı için hazırdır.

### `backend/qdrant_db.py`
Qdrant Cloud üzerinde vektör depolama ve sorgulama.

**Temel fonksiyonlar:**

| Fonksiyon | Açıklama |
|-----------|----------|
| `qdrant_baglanti()` | Qdrant Cloud'a bağlanır (URL + API key) |
| `collection_olustur(client, name, 512)` | 512 boyutlu cosine collection oluşturur |
| `file_id_to_point_id(file_id)` | Deterministic MD5 tabanlı integer ID |
| `fotograf_kaydet(client, col, vektör, foto, source)` | Vektör + metadata upsert |
| `fotograf_sil(client, col, file_id)` | Tek fotoğraf silme |
| `toplu_fotograf_sil(client, col, file_ids)` | Toplu silme |
| `duplikatlari_bul(client, col, threshold, limit)` | Benzer fotoğraf grupları |

**Qdrant'ta her fotoğraf için saklanan payload:**
```json
{
  "filename": "IMG_2847.jpg",
  "file_id": "provider-özel-id",
  "drive_url": "https://...",
  "source": "gdrive | dropbox | onedrive | pcloud",
  "folder_path": "/Tatil/2024",
  "file_size": 2048000,
  "date_taken": "2024-07-15T14:30:00",
  "year": 2024,
  "month": 7,
  "lat": 41.0082,
  "lon": 28.9784,
  "camera_make": "Apple",
  "camera_model": "iPhone 15 Pro"
}
```

### `backend/main.py` — Arama Endpoint'leri

**`GET /search`**
Parametreler: `q`, `limit`, `offset`, `source`, `year_from`, `year_to`, `camera_make`

Akış:
1. `metin_vektore_cevir(q)` → 512d vektör
2. Dinamik `fetch_limit` hesapla: EXIF filtresi varsa 500, source filtresi varsa `(limit+offset)*4`, filtresizse `limit+offset`
3. `qdrant_client.query_points(collection, query_vector, limit=fetch_limit)`
4. Python tarafında filtre (source / yıl / kamera)
5. `offset : offset+limit` ile sayfalama

**`GET /stats`**
EXIF kapsamını döner: toplam fotoğraf sayısı, EXIF'li / GPS'li sayılar, mevcut kamera markaları.

**`GET /thumbnail`**
Provider-agnostik thumbnail proxy. `file_id` ve `source` parametresi alır, ilgili provider'dan küçük resim indirir ve stream eder.

---

## Frontend — `frontend/src/app/search/page.tsx`

### Bileşenler

**Arama çubuğu:** Metin girişi + kaynak filtre pill'leri (Tümü, Google Drive, Dropbox, OneDrive). Form submit'te `searchApi.search()` çağrılır.

**Filtre paneli (açılır):**
- Yıl aralığı (year_from, year_to)
- Kamera markası dropdown
- İstatistikler: toplam / EXIF'li / GPS'li

**Sonuç grid'i:**
- 12'şer sayfalama, "Daha Fazla" butonu ile ek yükleme
- Her kart: thumbnail, dosya adı, yıl/kamera, score %, kaynak rozeti

**PhotoCard (alt bileşen):**
- Thumbnail görüntüsü (kırık görüntü fallback'i ile)
- Sol alt: kaynak rozeti; sağ üst: benzerlik skoru
- Hover: yukarı kalkma, border rengi değişimi
- "+ Albüm" butonu

**PhotoModal (alt bileşen):**
- Tam ekran overlay: büyük görüntü + EXIF metadata
- Butonlar: Sürücüde Aç, AI Düzenle, Kapat
- Bilgiler: dosya boyutu, kamera, tarih, konum

**Sync Uyarı Toast:**
- `localStorage.last_sync_warning` varsa gösterilir
- Dashboard'daki sync hataları buraya aktarılır

---

## Akış Özeti

```
Kullanıcı "sunset" yazar → searchApi.search("sunset")
  → GET /search?q=sunset&limit=12
  → metin_vektore_cevir("sunset") → 512d vektör
  → Qdrant cosine similarity → fetch_limit (dinamik) sonuç
  → Python filtresi + sayfalama → 12 sonuç
  → Frontend grid'de gösterim
  → Thumbnail'ler GET /thumbnail?file_id=...&source=... proxy'si ile
```
