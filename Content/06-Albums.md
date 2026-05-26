# 06 — Albümler

## Genel Bakış
Sanal albüm sistemi: fotoğraflar cloud'da kalır, yalnızca `source + file_id` referansları SQLite'ta tutulur. Kullanıcılar farklı bulut sağlayıcılardan fotoğrafları aynı albümde gruplayabilir.

---

## Backend

### `backend/album_store.py`

**Veritabanı şeması:**
```sql
albums (
  album_id   TEXT PRIMARY KEY,   -- UUID
  owner      TEXT,               -- kullanıcı email
  name       TEXT,
  created_at TEXT
)

album_photos (
  album_id    TEXT,
  source      TEXT,              -- "gdrive" | "dropbox" | ...
  file_id     TEXT,
  filename    TEXT,
  drive_url   TEXT,
  folder_path TEXT,
  file_size   INTEGER,
  added_at    TEXT,
  FOREIGN KEY(album_id) REFERENCES albums(album_id) ON DELETE CASCADE
)
```

**Fonksiyonlar:**

| Fonksiyon | Açıklama |
|-----------|----------|
| `init_db()` | Tabloları oluşturur |
| `album_olustur(owner, name)` | Yeni albüm (UUID oluşturur) |
| `albumleri_listele(owner)` | Albüm listesi + fotoğraf sayıları |
| `album_getir(album_id, owner)` | Albüm detayı + fotoğraflar |
| `album_yeniden_adlandir(album_id, owner, name)` | İsim değişikliği |
| `album_sil(album_id, owner)` | Albüm + fotoğraf referansları siler (CASCADE) |
| `fotograf_ekle(album_id, source, file_id, ...)` | Fotoğraf referansı ekler |
| `fotograf_cikar(album_id, source, file_id)` | Referansı kaldırır |

**Not:** Fotoğraflar cloud'da kalır, silme işlemi yalnızca albüm referansını kaldırır.

---

### `backend/main.py` — Album Endpoint'leri

| Endpoint | Metot | Açıklama |
|----------|-------|----------|
| `/albums` | GET | Kullanıcının albümlerini listeler |
| `/albums` | POST | Yeni albüm oluşturur |
| `/albums/{album_id}` | GET | Albüm detayı + fotoğraflar |
| `/albums/{album_id}` | PATCH | Albüm adını değiştirir |
| `/albums/{album_id}` | DELETE | Albümü siler |
| `/albums/{album_id}/photos` | POST | Fotoğraf ekler |
| `/albums/{album_id}/photos/{source}/{file_id}` | DELETE | Fotoğraf referansını kaldırır |

---

## Frontend

### `frontend/src/app/albums/page.tsx` — Albüm Listesi

**Bileşenler:**
- **Başlık + Yeni Albüm butonu:** Form toggle ile inline oluşturma (isim input + Oluştur/İptal)
- **Albüm grid'i** (auto-fill, 240px min-width):
  - Her kart: gradient başlık, albüm adı, fotoğraf sayısı + tarih, sil butonu
  - Hover: yukarı kalkma, border rengi accent'e döner
  - Kart tıklama → `/albums/{id}` yönlendirir
- **Boş durum:** "Henüz albüm yok" mesajı

**State:** `albums[], creating, newName, showForm, error`

**API çağrıları:** `albumApi.list()`, `albumApi.create(name)`, `albumApi.delete(id)`

---

### `frontend/src/app/albums/[id]/page.tsx` — Albüm Detayı

**Başlık:**
- Breadcrumb ← Albümler
- Albüm adı (kalem ikonu ile düzenleme modu)
- Fotoğraf sayısı + oluşturulma tarihi
- Görünüm modu toggle: Grid / Lightbox

**Grid Görünümü:**
- Auto-fill grid (200px min)
- Her fotoğraf: thumbnail, dosya adı, kaynak noktası, kaldır (×) butonu
- Tıklama → lightbox açar

**Lightbox Modal:**
- Tam ekran overlay, tek fotoğraf görüntüleme
- Önceki/Sonraki navigasyon (sol/sağ ok butonları)
- Klavye kısayolları: ← → gezinme, Esc kapatma
- Alt thumbnail strip (aktif olanı otomatik scroll)
- Üst bar: "X/Y" sayacı + kapat
- Meta bilgiler: dosya adı, kaynak rozeti, klasör yolu, dosya boyutu
- Butonlar: Sürücüde Aç, Fotoğrafı Kaldır

**Yeniden Adlandırma:**
Kalem ikonuna tıkla → inline form → Kaydet/İptal

**State:** `album, photos[], renaming, newName, removing`

**API çağrıları:** `albumApi.get(id)`, `albumApi.rename(id, name)`, `albumApi.removePhoto(album_id, source, file_id)`

---

## Search Sayfasından Albüm Ekleme

`frontend/src/app/search/page.tsx` içindeki `PhotoCard` bileşeninde "+ Albüm" butonu:
- Mevcut albümleri listeler
- Seçilen albüme `albumApi.addPhoto()` çağrısı yapar

---

## Akış Özeti

```
Albüm oluştur → POST /albums → SQLite'a UUID ile kaydet
Fotoğraf ekle → POST /albums/{id}/photos → (source, file_id, metadata) kaydet
Albüm görüntüle → GET /albums/{id} → referansları getir → thumbnail proxy ile göster
Fotoğraf kaldır → DELETE /albums/{id}/photos/{source}/{file_id} → yalnızca referans silinir
```
