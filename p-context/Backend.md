# Backend — Mimari Referans

## Genel Mimari

**Çerçeve:** FastAPI (`backend/main.py`)  
**Veritabanı:** SQLite (`app.db`) — kullanıcılar, tokenlar, albümler  
**Vektör Deposu:** Qdrant Cloud — her kullanıcı için ayrı collection  
**Embedding:** SigLIP (`google/siglip-base-patch16-224`) — 768 boyutlu vektörler  
**AI Düzenleme:** Replicate.com — 6 farklı model  
**Provider Katmanı:** Abstract `BaseProvider` + factory pattern (GDrive, Dropbox, pCloud, OneDrive)  
**Port:** `http://localhost:8000` (CORS: `http://localhost:3000` için açık)

Uygulama başlarken `init_db()` tek seferde tüm SQLite tablolarını oluşturur. Qdrant client `qdrant_baglanti()` ile global olarak başlatılır. SigLIP modeli `embedding.py` import edildiğinde yüklenir (~350 MB RAM).

---

## API Endpoint Listesi

### Health

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/` | Hayır | "API çalışıyor" mesajı |
| GET | `/health` | Hayır | `{ status: "ok" }` |

### Auth — Google Drive (Kullanıcı Girişi)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/auth/login` | Hayır | Google OAuth auth URL döner |
| GET | `/auth/callback` | Hayır | Google kodu token'a çevirir; JWT + user bilgisiyle frontend'e `RedirectResponse` |

### Auth — Provider Bağlama

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/auth/dropbox/login` | JWT | Dropbox auth URL döner |
| GET | `/auth/dropbox/callback` | Hayır | Dropbox token exchange; frontend `/account?connected=dropbox` yönlendirme |
| GET | `/auth/pcloud/login` | JWT | pCloud auth URL döner |
| GET | `/auth/pcloud/callback` | Hayır | pCloud token exchange; frontend'e yönlendirme |
| GET | `/auth/onedrive/login` | JWT | OneDrive auth URL döner |
| GET | `/auth/onedrive/callback` | Hayır | OneDrive token exchange; frontend'e yönlendirme |

### Kullanıcı

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/users/me` | JWT | Aktif kullanıcı bilgisini döner |
| PATCH | `/users/me` | JWT | `email` veya `name` günceller |
| DELETE | `/users/me` | JWT | Hesabı siler (Qdrant collection + DB). Body: `{ confirm: "DELETE {email}" }` |

### İndeksleme & Senkronizasyon

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/index` | JWT | Tüm providerları sıfırdan indexler. Body: `{ folder_id?, limit: 500 }` |
| DELETE | `/index` | JWT | Tüm Qdrant point'leri siler, collection korunur. Page token'lar sıfırlanır. |
| POST | `/sync` | JWT | Delta senkronizasyon. Hiç token yoksa `{ synced: false }` döner |

### Arama & İstatistikler

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/search` | JWT | SigLIP vektör araması. Parametreler: `q, limit, offset, source, year_from, year_to, camera_make` |
| GET | `/stats` | JWT | EXIF kapsamı: toplam / EXIF'li / GPS'li, kamera markaları |

### Debug (Geliştirici)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/debug/collection` | Query `user_id` | Qdrant collection içeriğini listeler |
| GET | `/debug/providers` | Query `user_id` | Her provider için fotoğraf listesi |

### Entegrasyonlar

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/integrations` | JWT | 4 provider için bağlantı durumu + label + disabled flag |
| DELETE | `/integrations/{source}` | JWT | Provider bağlantısını keser, page token'ı da siler |

### Fotoğraflar

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| DELETE | `/photos/{source}/{file_id}` | JWT | Cloud'dan + Qdrant'tan + tüm albümlerden siler |
| GET | `/photos/duplicates` | JWT | Benzer fotoğraf grupları. Params: `threshold (0.95)`, `limit (300)` |
| POST | `/photos/duplicates/resolve` | JWT | Seçilen kopyaları sil. Body: `{ keep: PhotoRef, delete: [PhotoRef] }` |
| GET | `/thumbnail` | Query `token` | Provider-agnostik thumbnail proxy. Params: `file_id, token, source` |

### Albümler

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/albums` | JWT | Yeni albüm. Body: `{ name }` |
| GET | `/albums` | JWT | Kullanıcının albümleri + fotoğraf sayıları |
| GET | `/albums/{album_id}` | JWT | Albüm detayı + fotoğraf listesi |
| PATCH | `/albums/{album_id}` | JWT | Albümü yeniden adlandır. Body: `{ name }` |
| DELETE | `/albums/{album_id}` | JWT | Albümü sil (cascade) |
| POST | `/albums/{album_id}/photos` | JWT | Fotoğraf referansı ekle |
| DELETE | `/albums/{album_id}/photos` | JWT | Fotoğraf referansını kaldır. Query: `source, file_id` |

### AI Düzenleme

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/edit/providers` | Hayır | Aktif edit provider listesi ve desteklenen işlemler |
| POST | `/edit` | JWT | AI görüntü düzenleme. Görsel cloud'dan indirilir veya `image_b64` ile gönderilir |
| POST | `/saveOnCloud` | JWT | Editlenmiş görseli cloud'a yükler. Body: `{ image_b64, filename, source, folder }` |

---

## Auth Akışı

### Google OAuth (Kullanıcı Girişi)

```
GET /auth/login
  → oauth_flow_init(state_store)
  → PKCE code_verifier varsa state payload'a eklenir
  → state_store.kaydet(state, {provider, created_at, code_verifier?})
  → { auth_url } döner

Kullanıcı Google'da izin verir
  → GET /auth/callback?code=X&state=Y

  1. state_store.tuket(state) → payload (atomik, tek kullanım, 10dk TTL)
  2. payload'dan code_verifier al
  3. oauth_flow_fetch_token(state, code, code_verifier) → Google Credentials
  4. get_user_info(credentials) → {email, name, picture}
  5. Kullanıcı DB'de yoksa:
     a. uuid4() ile user_id oluştur
     b. Qdrant collection oluştur: "user_" + uuid (dash'siz)
     c. users tablosuna kaydet
  6. token_store.kaydet(user_id, "gdrive", credentials)
  7. store.son_giris_guncelle(user_id)
  8. jwt_olustur(user_id) → 24 saatlik HS256 JWT
  9. RedirectResponse → frontend /auth/callback?access_token=...&email=...&name=...&picture=...
```

### Provider OAuth (Bulut Bağlama)

```
GET /auth/dropbox/login  (JWT gerekli — aktif user_id var)
  → state = secrets.token_urlsafe(16)
  → state_store.kaydet(state, {provider: "dropbox", email: user.email})
  → { auth_url } döner

GET /auth/dropbox/callback?code=X&state=Y
  → state_store.tuket(state) → payload'dan email al
  → user_store.email_ile_getir(email) → user_id
  → httpx ile token exchange
  → token_store.kaydet(user_id, "dropbox", {access_token, refresh_token})
  → RedirectResponse → frontend /account?connected=dropbox
```

pCloud ve OneDrive akışları aynı pattern'i izler. Hata durumunda `?error=...` ile frontend'e yönlendirilir.

### JWT & Dependency Injection

`jwt_handler.py`:
- `jwt_olustur(user_id)` — `{sub: user_id, exp: +24h}` payload, HS256 imzalı
- `jwt_dogrula(token)` — geçerliyse `user_id` string döner, değilse `None`

`dependencies.py`:
- `aktif_kullanici_id()` — Bearer token'dan user_id; 401 yoksa
- `aktif_kullanici()` — user_id'den DB'den User objesi; 401 yoksa
- `kullanici_tum_credentials()` — token_store.getir_tum(); hiç provider yoksa 401

### OAuthStateStore

`oauth_state_store.py` — InMemory singleton (thread-safe):
- `kaydet(state, payload, ttl=600)` — state + expire time saklar
- `tuket(state)` — atomik: al + sil; expire olmuşsa None
- `temizle_suresi_gecenler()` — manuel temizleme

**Not:** Server restart'ta state kaybedilir. Gelecekte Redis'e geçilebilir.

---

## Provider Sistemi

### BaseProvider (`providers/base.py`)

```python
class BaseProvider(ABC):
    source_key: str  # "gdrive" | "dropbox" | "pcloud" | "onedrive"
    
    def fotograflari_listele(klasor_id=None, limit=100) → list[dict]
    def foto_indir(file_id) → PIL.Image
    def degisiklikleri_getir(page_token) → (eklenenler, silinenler, yeni_token)
    def foto_sil(file_id) → bool
    def baslangic_token_al() → str
    def foto_yukle(image_bytes, filename, folder) → dict
```

Standart fotoğraf dict formatı (tüm provider'lar döner):
```python
{
  "id": str,          # provider-özel ID (GDrive: file ID, Dropbox: path_lower)
  "name": str,
  "size": int,
  "folder_path": str,
  "drive_url": str,
  "exif": {           # GDrive doldurur, Dropbox/pCloud boş {}
    "date_taken": str | None,
    "year": int | None,
    "month": int | None,
    "lat": float | None,
    "lon": float | None,
    "camera_make": str | None,
    "camera_model": str | None,
  }
}
```

### GoogleDriveProvider (`providers/gdrive.py`)

- **Kütüphane:** `googleapiclient` (Drive v3)
- **Listeleme:** `mimeType contains 'image/' and trashed = false` + `imageMediaMetadata` alanı
- **İndirme:** `MediaIoBaseDownload` → BytesIO → PIL.Image
- **Delta:** Changes API → `newStartPageToken`; removed/trashed → silinenler, image/* MIME → eklenenler
- **Yükleme:** Klasörü bul/oluştur, `MediaIoBaseUpload`
- **Token yenileme:** `google-auth` kütüphanesi otomatik yapar
- **EXIF:** `imageMediaMetadata.time`, `location.latitude/longitude`, `cameraMake/cameraModel`

### DropboxProvider (`providers/dropbox.py`)

- **Kütüphane:** Dropbox Python SDK
- **ID:** `path_lower` (file ID değil)
- **Listeleme:** `files_list_folder("", recursive=True)` + uzantı filtresi (jpg/jpeg/png/heic)
- **Delta:** `files_list_folder_continue(cursor)` → `DeletedMetadata` / `FileMetadata`; başlangıç için `files_list_folder_get_latest_cursor()`
- **Token yenileme:** SDK, `refresh_token` varsa otomatik yapar
- **EXIF:** Yok (`exif: {}`)

### PCloudProvider (`providers/pcloud.py`)

- **API:** REST, Bearer token (header'da)
- **EU hesaplar:** `hostname=eapi.pcloud.com`
- **Listeleme:** `/listfolder` recursive manuel traversal (EU endpoint rekursif parametreyi desteklemez)
- **İndirme:** `/getfilelink` → CDN URL → `httpx.get()`
- **Delta:** `/diff?diffid=...` → `create/modify/delete` olayları; başlangıç için `/diff?last=1&limit=0`
- **Auth hatası:** result code 1000 veya 2094 → `PCloudAuthError` raise eder → token silinir
- **EXIF:** Yok (`exif: {}`)

### OneDriveProvider (not: `providers/` altında ayrı dosya, `main.py`'de `onedrive_token_exchange` `auth.py`'de)

- **Kütüphane:** `httpx` (Microsoft Graph API)
- **Scopes:** `Files.ReadWrite.All`, `User.Read`, `offline_access`
- **Token yenileme:** Manuel — `token_refresh.py:onedrive_token_yenile()`. Access token expire olduğunda 401 gelir; `/thumbnail` endpoint'i ve `sync.py` otomatik refresh dener
- **EXIF:** `photo.takenDateTime`, `location.latitude/longitude`

### Factory (`providers/factory.py`)

```python
def provider_getir(source: str, credentials) → BaseProvider
```

`match source:` ile doğru provider sınıfını instantiate eder.

---

## Edit Provider Sistemi

### EditIslemi Enum (`edit_providers/base.py`)

| Değer | Açıklama |
|-------|----------|
| `inpainting` | Maskeli alanı prompt ile doldur |
| `outpainting` | Görüntüyü kenarlara doğru genişlet |
| `background_remove` | Arka planı kaldır, şeffaf PNG |
| `restore` | Çizik/hasar/solmayı onar |
| `upscale` | 2× veya 4× çözünürlük artırma |
| `style_transfer` | Prompt ile stil dönüşümü |
| `text_edit` | Doğal dil talimatıyla serbest düzenleme |

**Validasyonlar** (`BaseEditProvider.isle()`):
- `inpainting` → maske zorunlu
- `inpainting`, `outpainting`, `style_transfer`, `text_edit` → prompt zorunlu

### ReplicateEditProvider (`edit_providers/replicate.py`)

| Anahtar | Replicate Model | İşlem |
|---------|-----------------|-------|
| `flux_fill_pro` | `black-forest-labs/flux-fill-pro` | Inpainting + Outpainting |
| `flux_kontext_pro` | `black-forest-labs/flux-kontext-pro` | Stil Transferi |
| `flux_kontext_max` | `black-forest-labs/flux-kontext-max` | Metin ile Düzenle |
| `restore_image` | `flux-kontext-apps/restore-image` | Restorasyon |
| `clarity_pro` | `philz1337x/clarity-pro-upscaler` | Çözünürlük Artırma |
| `remove_background` | `bria/remove-background` | Arka Plan Kaldırma |

**`NamedBytesIO`:** `.name` attribute'u eklenerek Replicate SDK'nın MIME tipini algılaması sağlanır.

**`_output_to_pil(output, mode)`:** Replicate çıktısı 3 formatta gelebilir: URL string → `httpx.get()`, bytes → `BytesIO`, chunks iterator → `b"".join(chunks)`.

### Factory (`edit_providers/factory.py`)

```python
def edit_provider_getir(provider_adi: str) → BaseEditProvider
```
Şu an yalnızca `"replicate"` aktif. FAL provider yoruma alınmış.

`desteklenen_providerlar()` → `GET /edit/providers` endpoint'i için aktif provider + işlem listesi döner.

---

## Veri Katmanı — SQLite (`app.db`)

Tüm tablolar `user_store.py:init_db()` tarafından idempotent biçimde oluşturulur.

### `users` Tablosu

```sql
CREATE TABLE IF NOT EXISTS users (
    user_id           TEXT PRIMARY KEY,   -- UUID v4 (dash'li)
    email             TEXT UNIQUE NOT NULL,
    username          TEXT UNIQUE NOT NULL, -- max 30 karakter, Türkçe normalize
    name              TEXT,
    picture           TEXT,
    qdrant_collection TEXT NOT NULL,       -- "user_" + UUID (dash'siz)
    created_at        TEXT NOT NULL,       -- ISO 8601 UTC
    last_login        TEXT                 -- ISO 8601 UTC veya NULL
);
```

Username üretimi: isim → Türkçe normalize → alfanumerik → çakışma varsa sayısal suffix.

### `tokens` Tablosu

```sql
CREATE TABLE IF NOT EXISTS tokens (
    user_id          TEXT NOT NULL,
    source           TEXT NOT NULL,   -- "gdrive" | "dropbox" | "pcloud" | "onedrive"
    credentials_json TEXT NOT NULL,   -- GDrive: google-auth JSON, diğerleri: {access_token, refresh_token?}
    updated_at       TEXT,
    PRIMARY KEY (user_id, source),
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

GDrive credentials `Credentials.to_json()` ile serileştirilir; diğerleri düz `json.dumps()`.

### `page_tokens` Tablosu

```sql
CREATE TABLE IF NOT EXISTS page_tokens (
    user_id    TEXT NOT NULL,
    source     TEXT NOT NULL,
    token      TEXT NOT NULL,   -- GDrive: startPageToken, Dropbox: cursor, pCloud: diffid string
    updated_at TEXT,
    PRIMARY KEY (user_id, source),
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

Delta senkronizasyon checkpoint'leri. Token yoksa (`None` veya `""`) → provider henüz indexlenmemiş.

### `albums` Tablosu

```sql
CREATE TABLE IF NOT EXISTS albums (
    album_id   TEXT PRIMARY KEY,  -- UUID v4
    owner      TEXT NOT NULL,     -- user_id
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(owner) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### `album_photos` Tablosu

```sql
CREATE TABLE IF NOT EXISTS album_photos (
    album_id    TEXT NOT NULL,
    source      TEXT NOT NULL,
    file_id     TEXT NOT NULL,
    filename    TEXT DEFAULT '',
    drive_url   TEXT DEFAULT '',
    folder_path TEXT DEFAULT '',
    file_size   INTEGER DEFAULT 0,
    added_at    TEXT NOT NULL,
    PRIMARY KEY (album_id, source, file_id),
    FOREIGN KEY(album_id) REFERENCES albums(album_id) ON DELETE CASCADE
);
```

Fotoğraflar cloud'da kalır; yalnızca referanslar saklanır. `fotograf_cikar_global(source, file_id)` tüm albümlerden temizler.

---

## Qdrant Yapısı

### Collection Adlandırma

`user_` + user_id (UUID, dash'ler kaldırılmış)  
Örnek: `user_550e8400e29b41d4a716446655440000`

Her kullanıcı için ayrı collection; user kaydı oluşturulurken eager olarak oluşturulur.

### Vektör Yapılandırması

- **Boyut:** 768
- **Mesafe:** Cosine
- **Model:** SigLIP `google/siglip-base-patch16-224`

### Point ID Üretimi

```python
def file_id_to_point_id(file_id: str) -> int:
    hash_bytes = hashlib.md5(file_id.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder="big")
```

Deterministik — aynı `file_id` her zaman aynı integer ID verir. Upsert ve silme için gerekli.

### Payload Şeması

Her vektör ile birlikte saklanan payload:

```json
{
  "filename": "IMG_2847.jpg",
  "file_id": "provider-özel-id",
  "drive_url": "https://...",
  "source": "gdrive",
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

EXIF alanları opsiyonel: `None` olan alanlar payload'a dahil edilmez. Qdrant'ta alan yokmuş gibi davranır; filtreleme sırasında bu fotoğraf o filtre kapsamı dışında kalır.

### Duplikat Tespiti

`duplikatlari_bul(client, col, threshold, limit)`:
1. Tüm vektörleri `scroll()` ile çeker
2. Her vektör için `query_points()` ile threshold üstündeki komşuları bulur
3. Ziyaret edilenler setinde takip ederek her fotoğrafın tek grupta görünmesini sağlar
4. Self her zaman grubun ilk elemanı (score=1.0)

---

## Sync / Index Akışı

### Tam İndeksleme (`sync.py:index_all`)

1. `collection_olustur()` (idempotent)
2. Her provider için:
   - `fotograflari_listele()` → mevcut fotoğraflar
   - "Hayalet temizliği": Qdrant'ta var ama provider'da yok → `toplu_fotograf_sil()` + `album_fotograf_cikar_global()`
   - Her fotoğraf: `foto_indir()` → `foto_vektore_cevir()` → `fotograf_kaydet()`
3. İndeksleme bittikten SONRA: `baslangic_token_al()` → `T_start` tüket → `T1` kaydet (`page_token_kaydet()`)

**Neden sonradan token alınır:** İndeksleme sırasında oluşan değişiklik olaylarını bir sonraki delta sync'in tekrar işlememesi için.

### Delta Senkronizasyon (`sync.py:delta_sync`)

1. `page_token_getir()` → token yoksa (henüz index yapılmamış) atla
2. `degisiklikleri_getir(saved_token)` → `(eklenenler, silinenler, yeni_token)`
3. Silinenler: `toplu_fotograf_sil()` + `album_fotograf_cikar_global()`
4. Eklenenler: Qdrant'ta var mı? (`qdrant_client.retrieve()`) → yoksa embed + kaydet
5. Reconciliation (silme): provider listesi vs Qdrant → delta'nın kaçırdığı silmeleri temizle
6. Reconciliation (ekleme): provider'da olup Qdrant'ta olmayan dosyaları yeniden indeksle (indekslemede hata alan dosyalar burada yakalanır)
7. `page_token_kaydet(user_id, source, yeni_token)`

Hiçbir provider için token yoksa `None` döner → frontend "önce index yapın" mesajı gösterir.

**OneDrive 401 yönetimi:** Hem `index_all` hem `delta_sync` içinde, 401 alınırsa `onedrive_token_yenile()` çağrılır, başarısız olursa token silinir.

---

## Env Değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `JWT_SECRET` | Evet | HS256 imzalama anahtarı |
| `QDRANT_URL` | Evet | Qdrant Cloud endpoint |
| `QDRANT_API_KEY` | Evet | Qdrant API anahtarı |
| `REPLICATE_API_TOKEN` | AI edit için | Replicate.com token |
| `HUGGINGFACE_TOKEN` | Hayır | HuggingFace login (gated model için) |
| `DROPBOX_APP_KEY` | Dropbox için | Dropbox uygulaması key |
| `DROPBOX_APP_SECRET` | Dropbox için | Dropbox uygulaması secret |
| `DROPBOX_REDIRECT_URI` | Hayır | Varsayılan: `http://localhost:8000/auth/dropbox/callback` |
| `PCLOUD_CLIENT_ID` | pCloud için | pCloud OAuth client ID |
| `PCLOUD_CLIENT_SECRET` | pCloud için | pCloud OAuth client secret |
| `ONEDRIVE_CLIENT_ID` | OneDrive için | Azure uygulama client ID |
| `ONEDRIVE_CLIENT_SECRET` | OneDrive için | Azure uygulama secret |
| `ONEDRIVE_TENANT_ID` | Hayır | Varsayılan: `consumers` |
| `PCLOUD_API_URL` | Hayır | Varsayılan: `https://api.pcloud.com` (EU: `https://eapi.pcloud.com`) |

Google OAuth kimlik bilgileri `credentials.json` dosyasından okunur (Google Cloud Console'dan indirilen service key).

---

## Bağımlılıklar (`requirements.txt`)

```
fastapi
uvicorn[standard]
python-multipart        # dosya yükleme
opencv-python           # (eski bağımlılık, artık kullanılmıyor)
tensorflow              # (eski bağımlılık, artık kullanılmıyor)
numpy
pillow
python-dotenv==1.0.1
```

**Not:** `requirements.txt` güncel değil. Gerçekte kullanılan kütüphaneler:

| Kütüphane | Kullanım |
|-----------|----------|
| `fastapi`, `uvicorn` | Web framework |
| `python-jose` | JWT (jose) |
| `google-auth-oauthlib`, `google-api-python-client` | Google OAuth + Drive API |
| `dropbox` | Dropbox SDK |
| `httpx` | Async HTTP (pCloud, OneDrive, Replicate output) |
| `qdrant-client` | Qdrant Cloud bağlantısı |
| `transformers`, `torch`, `sentencepiece` | SigLIP modeli |
| `Pillow` | Görüntü işleme |
| `replicate` | AI model çalıştırma |
| `python-dotenv` | `.env` dosyası |
| `python-multipart` | FastAPI form upload |
