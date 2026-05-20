# PhotoMind — Proje Teknik Dokümantasyonu

> **Proje:** AI Tabanlı Cross-Cloud Fotoğraf Yöneticisi
> **UI Adı:** PhotoMind — Cross-Cloud Image Manager
> **Geliştirici:** Umut Kuzyaka
> **Son Güncelleme:** Mayıs 2026
> **Mevcut Durum:** Backend ✅ | Frontend ✅ | Google Drive ✅ | Dropbox ✅ | OneDrive ✅ (delta sync tam çalışıyor) | pCloud ⏳ (credentials bekleniyor)

---

## İçindekiler

1. [Proje Genel Bakış](#1-proje-genel-bakış)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Veri Akışı](#3-veri-akışı)
4. [Backend — Dosya Yapısı](#4-backend--dosya-yapısı)
5. [Temel Modüller](#5-temel-modüller)
6. [Provider Sistemi](#6-provider-sistemi)
7. [Auth Akışları](#7-auth-akışları)
8. [API Endpoint Referansı](#8-api-endpoint-referansı)
9. [Frontend — Sayfa Yapısı](#9-frontend--sayfa-yapısı)
10. [Frontend API Katmanı](#10-frontend-api-katmanı)
11. [Geliştirme Fazları](#11-geliştirme-fazları)
12. [Ortam Değişkenleri](#12-ortam-değişkenleri)
13. [Bilinen Sınırlılıklar](#13-bilinen-sınırlılıklar)

---

## 1. Proje Genel Bakış

Photo Discovery, kullanıcıların birden fazla cloud depolama sağlayıcısındaki (Google Drive, Dropbox, OneDrive, pCloud) fotoğraf arşivlerini **doğal dilde metin arama** ile tarayabildiği bir yapay zeka uygulamasıdır.

### Temel Fikir

Kullanıcı "denizde gün batımı" veya "doğum günü pastası" yazar; sistem bu metni anlayarak tüm bağlı cloud hesaplarındaki en alakalı fotoğrafları bulur ve sıralar.

### Nasıl Çalışır?

```
Cloud'dan fotoğraf indir (RAM'e, diske asla)
        ↓
CLIP modeli ile 512 boyutlu vektöre dönüştür
        ↓
Qdrant vektör veritabanına kaydet
        ↓
Kullanıcı metin yazar → metin de CLIP ile vektöre dönüşür
        ↓
Qdrant cosine similarity araması → en yakın fotoğraflar döner
```

### Neden CLIP?

CLIP (Contrastive Language-Image Pretraining) — OpenAI'ın geliştirdiği, görsel ve metni **aynı 512 boyutlu vektör uzayına** yerleştiren modeldir. "Sunset" kelimesi ile bir gün batımı fotoğrafı bu uzayda birbirine yakın konumlanır; cosine similarity bu yakınlığı sayısal olarak ölçer.

```
foto_vektore_cevir(fotoğraf) → [0.02, -0.11, 0.34, ...]   ← görsel
metin_vektore_cevir("sunset") → [0.03, -0.09, 0.31, ...]  ← metin
cosine_similarity = 0.87  →  "Çok alakalı!"
```

### Privacy-First Tasarım

- Fotoğraflar **hiçbir zaman diske kaydedilmez** — RAM'e alınır, işlenir, atılır.
- Qdrant'ta sadece sayısal vektörler saklanır; vektörden fotoğrafa geri dönmek mümkün değildir.
- Her kullanıcının verisi kendi collection'ına izole edilmiştir.

---

## 2. Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Frontend (3000)                     │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Login   │  │  Dashboard   │  │   Search   │  │ Settings │  │
│  │  Google  │  │  Index/Sync  │  │  + Filters │  │  Albums  │  │
│  │  OAuth   │  │  Controls    │  │  + Modal   │  │  Integr. │  │
│  └──────────┘  └──────────────┘  └────────────┘  └──────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP + Bearer JWT
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (8000)                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Auth Layer │  │  Index/Sync  │  │   Search Engine    │    │
│  │  JWT + OAuth │  │  Pipeline    │  │  Text→CLIP→Qdrant  │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Provider Katmanı                       │   │
│  │  GoogleDriveProvider │ DropboxProvider │ OneDriveProvider │  │
│  │  PCloudProvider      │ (hepsi BaseProvider'dan türer)    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  Google Drive    Dropbox        OneDrive       Qdrant Cloud
  OAuth 2.0       OAuth 2.0      MS OAuth       Vektör DB
  (credentials    (access +      (access +      (512d COSINE)
   object)         refresh)       refresh)
                                                     ↑
                                            CLIP Model (local)
                                       openai/clip-vit-base-patch32
```

---

## 3. Veri Akışı

### Tam İndexleme Akışı

```
POST /index
     │
     ▼
JWT doğrula → email al
     │
     ▼
token_store'dan tüm bağlı provider credentials'larını al
     │
     ├── gdrive credentials → GoogleDriveProvider
     ├── dropbox credentials → DropboxProvider
     ├── onedrive credentials → OneDriveProvider
     └── pcloud credentials → PCloudProvider
           │ (her provider için paralel değil, sıralı)
           ▼
     fotograflari_listele(limit=500)
           │
           ▼
     Hayalet temizlik: Qdrant'ta var ama provider'da olmayan kayıtları sil
           │
           ▼
     Her fotoğraf için:
       foto_indir() → PIL Image (RAM'de)
       foto_vektore_cevir() → 512d float listesi
       fotograf_kaydet() → Qdrant upsert (deterministik ID)
           │
           ▼
     [Tüm download'lar bitti]
     baslangic_token_al() → T_start al
     degisiklikleri_getir(T_start) → T_start'ı tüket → T1 al
     page_token_kaydet(T1)  ← delta sync bu noktadan başlar
           │
           ▼
     {"indexed": N, "total_found": M, "errors": [...]}
```

### Delta Sync Akışı

```
POST /sync
     │
     ▼
Her provider için:
  page_token_getir(email, source) → token var mı?
     ├── Hayır → atla (bu provider henüz indexlenmemiş)
     └── Evet ↓
           │
           ▼
     degisiklikleri_getir(saved_token)
           │
           ├── eklenenler (yeni/güncellenen fotoğraflar)
           └── silinenler (silinen/çöpe atılan dosyaların ID'leri)
                 │
                 ├── silinenler → toplu_fotograf_sil(Qdrant)
                 └── eklenenler → Qdrant existence check →
                       zaten varsa atla / yoksa foto_indir → CLIP → fotograf_kaydet
                           │
                           ▼
                 Reconciliation pass: provider listesi vs Qdrant karşılaştır
                   → delta'nın kaçırdığı silmeler → toplu_fotograf_sil
                           │
                           ▼
                 page_token_kaydet(email, source, yeni_token)
```

### Arama Akışı

```
GET /search?q=sunset&limit=12&offset=0
     │
     ▼
JWT doğrula → email al → collection_adi(email) üret
     │
     ▼
metin_vektore_cevir("sunset") → 512d float listesi
     │
     ▼
qdrant.query_points(collection, query_vector, limit=fetch_limit)
     │
     ▼
Python tarafı filtrele: source / year_from / year_to / camera_make
     │
     ▼
Sayfalama: points[offset : offset + limit]
     │
     ▼
{results: [...], total_found: N, has_more: bool}
```

---

## 4. Backend — Dosya Yapısı

```
backend/
├── main.py              # FastAPI app, tüm endpoint tanımları
├── auth.py              # Google + Dropbox + OneDrive + pCloud OAuth
├── jwt_handler.py       # JWT üretme/doğrulama
├── token_store.py       # In-memory credential ve page token saklama
├── dependencies.py      # FastAPI Depends() middleware
├── embedding.py         # CLIP model (fotoğraf + metin → 512d vektör)
├── qdrant_db.py         # Qdrant bağlantısı + CRUD + duplikat tarama
├── sync.py              # Tam indexleme + delta sync
├── album_store.py       # SQLite ile sanal albüm yönetimi
├── drive.py             # (Legacy) ilk Google Drive wrapper — artık kullanılmıyor
├── albums.db            # SQLite dosyası (otomatik oluşur, Git'e gitmez)
├── credentials.json     # Google OAuth client credentials (Git'e gitmez)
├── .env                 # Ortam değişkenleri (Git'e gitmez)
└── providers/
    ├── __init__.py
    ├── base.py          # BaseProvider ABC — tüm provider'lar bunu uygular
    ├── factory.py       # provider_getir(source, credentials) → BaseProvider
    ├── gdrive.py        # GoogleDriveProvider
    ├── dropbox.py       # DropboxProvider
    ├── onedrive.py      # OneDriveProvider (MS Graph REST API)
    └── pcloud.py        # PCloudProvider
```

---

## 5. Temel Modüller

### `auth.py`

Tüm OAuth akışlarını barındırır. Dört provider için farklı sabitler ve fonksiyonlar içerir; Google bölümü `google-auth-oauthlib` kullanırken diğerleri `httpx` ile manuel token exchange yapar.

**Google:** `oauth_flow_init()` → auth URL üretir; `oauth_flow_fetch_token()` → callback URL'den credentials alır; `get_user_info()` → email/name/picture döner.

**Dropbox:** `main.py`'ın içinde inline — state dict, auth URL, token exchange `httpx.post` ile.

**pCloud:** `pcloud_auth_url_olustur(email)` → state üretir, URL döner; `pcloud_token_al(code, state)` → `api.pcloud.com/oauth2_token`'a POST, `access_token` alır.

**OneDrive:** `onedrive_auth_url_olustur(email)` → Microsoft login URL; `onedrive_token_al(code, state)` → `login.microsoftonline.com/.../token`'a POST, access + refresh token alır.

---

### `token_store.py`

İki in-memory dict yönetir; yapı kasıtlı olarak Redis-ready tasarlanmıştır — sadece bu dosya değiştirilirse tüm sistem Redis'e geçer.

```python
_store: dict      # email → {source: credentials}
_page_tokens: dict  # email → {source: page_token}
```

| Fonksiyon | Açıklama |
|---|---|
| `kaydet(email, source, credentials)` | Provider credential'ını saklar |
| `getir(email, source)` | Tek provider credential'ını döner |
| `getir_tum(email)` | Tüm bağlı provider'ların credential'larını döner |
| `sil(email, source=None)` | Bir veya tüm provider'ları siler |
| `page_token_kaydet(email, source, token)` | Delta sync başlangıç noktasını saklar |
| `page_token_getir(email, source)` | Kaydedilmiş page token'ı döner |
| `page_token_sil(email, source)` | Sync token'ını siler (entegrasyon iptalinde) |

**⚠️ Uyarı:** Sunucu restart olursa tüm credentials ve page token'lar kaybolur. Kullanıcı yeniden login olmak ve `/index` çalıştırmak zorunda kalır. Phase 5B'de Redis'e taşınacak.

---

### `jwt_handler.py`

`python-jose` kütüphanesi, HS256 algoritması, 24 saatlik expire.

```python
jwt_olustur({"email": "...", "name": "...", "picture": "..."}) → "eyJ..."
jwt_dogrula("eyJ...") → {"email": "...", "name": "...", "exp": ...} | None
```

JWT sadece kullanıcı kimliğini taşır — cloud credentials asla JWT içine konulmaz.

---

### `embedding.py`

Uygulama başlarken model RAM'e yüklenir (~500MB, 3–5 saniye).

```python
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

foto_vektore_cevir(pil_image) → List[float]  # 512 boyutlu, normalize
metin_vektore_cevir(text)     → List[float]  # 512 boyutlu, normalize
```

Her iki fonksiyon da `F.normalize` uygular; cosine similarity için birim uzunluk şarttır.

---

### `qdrant_db.py`

**Bağlantı:** `QDRANT_URL` ve `QDRANT_API_KEY` env var'larından.

**Deterministik ID sistemi:**
```python
def file_id_to_point_id(file_id: str) -> int:
    hash_bytes = hashlib.md5(file_id.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder="big")
```
Aynı file_id her zaman aynı Qdrant point ID'sini verir. Bu sayede sync sırasında "bu fotoğrafın Qdrant ID'si neydi?" sorusu cevapsız kalmaz.

**Per-user collection izolasyonu:**
```python
def collection_adi(email: str) -> str:
    return f"photos_{hashlib.md5(email.encode()).hexdigest()[:12]}"
# umut@gmail.com → photos_a1b2c3d4e5f6
```

**Payload formatı (her fotoğraf için):**
```json
{
  "filename":     "IMG_2847.jpg",
  "file_id":      "provider-özgü-id",
  "drive_url":    "https://...",
  "source":       "gdrive | dropbox | onedrive | pcloud",
  "folder_path":  "/Tatil/2024",
  "file_size":    2048000,
  "date_taken":   "2024-07-15T14:30:00",
  "year":         2024,
  "month":        7,
  "lat":          41.0082,
  "lon":          28.9784,
  "camera_make":  "Apple",
  "camera_model": "iPhone 15 Pro"
}
```
EXIF alanları (year, month, lat, lon, camera_make, camera_model) sadece varsa payload'a eklenir — `None` değerler atlanır.

**Duplikat tespiti:** `duplikatlari_bul()` tüm koleksiyonu scroll eder, her kayıt için `query_points` yaparak threshold üzerindeki hit'leri gruplar. Cosine similarity default 0.95.

---

### `sync.py`

**`index_all()`:** Tüm bağlı provider'ları sıralı olarak tam indexler. Her provider için:
1. Fotoğrafları listele (`fotograflari_listele`)
2. Hayalet kayıtları temizle — Qdrant'ta var ama provider'da olmayan kayıtları sil
3. Her fotoğrafı indir → CLIP → Qdrant upsert
4. Tüm download'lar tamamlandıktan **sonra** `baslangic_token_al()` çağır
5. T_start token'ını hemen `degisiklikleri_getir(T_start)` ile tüket → T1 token'ını kaydet

> **Önemli:** Token, download'lardan *sonra* alınır; böylece `foto_indir` çağrılarının tetiklediği cTag güncellemeleri delta'ya girmez. T_start hemen tüketilerek T1 (gerçek fark noktası) kaydedilir.

**`delta_sync()`:** Kaydedilmiş page token'ı olan her provider için `degisiklikleri_getir()` çağırır, eklenen/silinenleri işler, yeni token'ı kaydeder. Hiçbir provider için token yoksa `None` döner (henüz index yapılmamış).

Delta sync iki güvenlik katmanı içerir:
- **Qdrant existence check:** Eklenenler listesindeki her fotoğraf için `qdrant_client.retrieve()` ile Qdrant'ta var mı kontrol edilir — varsa re-embedding atlanır.
- **Reconciliation pass:** Provider'ın güncel dosya listesi ile Qdrant karşılaştırılır; delta'nın kaçırdığı silmeler bu şekilde yakalanır.

---

### `album_store.py`

SQLite tabanlı, cross-cloud sanal albüm sistemi. Fotoğraflar cloud'da kalır; sadece `source + file_id` referansları saklanır.

**Şema:**
```sql
albums (album_id, owner, name, created_at)
album_photos (album_id, source, file_id, filename, drive_url, folder_path, file_size, added_at)
-- FOREIGN KEY: album_photos.album_id → albums.album_id ON DELETE CASCADE
```

---

### `dependencies.py`

```python
aktif_kullanici()          # JWT → kullanıcı dict veya 401
kullanici_tum_credentials()  # aktif_kullanici + token_store.getir_tum
```

`kullanici_tum_credentials()` hiçbir provider bağlı değilse 401 döner; `/index` ve `/sync` bunu kullanır.

---

## 6. Provider Sistemi

### `BaseProvider` (ABC)

Tüm provider'lar bu 5 abstract metodunu uygulamak zorundadır:

```python
fotograflari_listele(klasor_id=None, limit=100) → list[dict]
foto_indir(file_id: str) → PIL.Image.Image
degisiklikleri_getir(page_token: str) → (eklenenler, silinenler, yeni_token)
foto_sil(file_id: str) → bool
baslangic_token_al() → str
```

Her dict şu alanları içermeli: `id`, `name`, `size`, `folder_path`, `drive_url`, `exif`.

---

### `GoogleDriveProvider`

- **API:** Google Drive v3 (`googleapiclient`)
- **Kimlik:** `google.oauth2.credentials.Credentials` nesnesi
- **Fotoğraf listeleme:** `files().list()` — `mimeType contains 'image/'` sorgusu
- **İndirme:** `files().get_media()` + `MediaIoBaseDownload` (streaming)
- **EXIF:** `imageMediaMetadata` alanından — date, GPS, camera_make, camera_model
- **Delta:** Google Drive Changes API — `changes().list(pageToken=...)`, `newStartPageToken` yeni token
- **Silme:** `files().delete(fileId=...)`

---

### `DropboxProvider`

- **API:** Dropbox Python SDK (`dropbox` paketi)
- **Kimlik:** `{"access_token": "...", "refresh_token": "..."}` dict
- **Token yenileme:** SDK otomatik yapar — refresh_token + app_key + app_secret ile
- **Fotoğraf listeleme:** `files_list_folder("", recursive=True)` — `.jpg/.jpeg/.png/.heic` filtreli
- **İndirme:** `files_download(path_lower)` — `path_lower` file ID olarak kullanılır
- **EXIF:** Dropbox API EXIF döndürmez, `"exif": {}` boş bırakılır
- **Delta:** `files_list_folder_continue(cursor)` — cursor tabanlı
- **Silme:** `files_delete_v2(path_lower)`

---

### `OneDriveProvider`

- **API:** Microsoft Graph REST API (`https://graph.microsoft.com/v1.0`)
- **Kimlik:** `{"access_token": "...", "refresh_token": "..."}` dict — factory sadece `access_token`'ı provider'a iletir
- **Fotoğraf listeleme:** BFS (breadth-first) `/me/drive/root/children` traversali — kök klasörden başlayıp alt klasörleri sıraya ekleyerek recursive tarar. `photo` alanı veya `mimeType: image/*` kontrolü ile sadece görseller alınır. **Not:** Delta endpoint (`/me/drive/root/delta`) bilinçli olarak kullanılmaz — delta token durumunu bozmamak için.
- **İndirme:** `GET /me/drive/items/{file_id}/content` (follow_redirects=True)
- **EXIF:** `photo.takenDateTime`, `location.latitude/longitude`
- **Delta:** `degisiklikleri_getir(deltaLink)` — deltaLink bir URL'dir, kendisi doğrudan istek atılır; `@odata.deltaLink` yeni token. `deleted` objeleri silinmiş dosyaları bildirir.
- **Başlangıç token:** `baslangic_token_al()` → `GET /me/drive/root/delta` tüm sayfaları `$top=500` ile hızlıca tüketir, son `deltaLink`'i döner. `index_all` tüm download'lardan sonra bu fonksiyonu çağırır, ardından T_start'ı `degisiklikleri_getir` ile tüketip T1'i kaydeder (cTag kirlenmesi önlemi).
- **Silme:** `DELETE /me/drive/items/{file_id}`

**cTag Kirlenmesi Sorunu ve Çözümü:** `foto_indir` (`/content` endpoint) OneDrive'ın cTag'ini günceller. Delta API bu güncellemeyi "değişiklik" olarak raporlar — bu da silinmemiş dosyaların sürekli re-embed edilmesine yol açar. Üç katmanlı çözüm uygulandı:
1. `baslangic_token_al` tüm download'lardan **sonra** çağrılır
2. Elde edilen T_start hemen tüketilir (T1 kaydedilir), böylece cTag değişiklikleri delta'ya girmez
3. `delta_sync` içinde Qdrant existence check: Qdrant'ta zaten olan fotoğraflar re-embed edilmez

**Token Yenileme:** OneDrive access token ~1 saat sonra sona erer. `refresh_token` token_store'da saklanıyor ancak otomatik yenileme implement edilmedi. Expire olunca kullanıcı yeniden OAuth yapmalıdır. **Faz 5B'de** Redis ile birlikte token refresh middleware'i eklenecek.

---

### `PCloudProvider`

- **API:** pCloud REST API (`https://api.pcloud.com`)
- **Kimlik:** `{"access_token": "..."}` dict
- **Tüm istekler:** `GET {endpoint}?access_token=TOKEN&...` — Bearer header değil, query param
- **Fotoğraf listeleme:** `GET /listfolder?folderid=0&recursive=1` — klasör ağacını recursive gezer
- **İndirme:** `GET /getfilelink?fileid=...` → `hosts[0]` + `path` ile CDN URL; sonra o URL'den binary indir
- **EXIF:** pCloud metadata'sı EXIF döndürmez, `"exif": {}` boş bırakılır
- **Delta:** `GET /diff?diffid=...` — events: `create`, `modify`, `delete`
- **Başlangıç token:** `GET /diff?last=1&limit=0` → `diffid`
- **Silme:** `GET /deletefile?fileid=...`
- **Thumbnail:** `GET /getthumb?fileid=...&size=256x256` → `hosts[0]` + `path` ile redirect

**EU Bölgesi Notu:** EU hesapları için `PCLOUD_URL = "https://eapi.pcloud.com"` olarak değiştirilmeli.

---

### `factory.py`

```python
def provider_getir(source: str, credentials) -> BaseProvider:
    match source:
        case "gdrive":   return GoogleDriveProvider(credentials)
        case "dropbox":  return DropboxProvider(credentials)
        case "onedrive": return OneDriveProvider(credentials["access_token"])
        case "pcloud":   return PCloudProvider(credentials["access_token"])
```

`sync.py` ve `main.py` sadece bu fonksiyonu çağırır — provider implementasyonunu bilmez. Yeni provider eklemek için bu dosyaya bir `case` + yeni provider dosyası yeterli.

---

## 7. Auth Akışları

### Google Drive (Giriş + Drive)

```
Frontend: GET /auth/login
  ← {"auth_url": "https://accounts.google.com/o/oauth2/auth?..."}

Kullanıcı Google consent ekranını tamamlar
  → GET /auth/callback?code=ABC&state=...

Backend:
  oauth_flow_fetch_token(full_url)          # google-auth-oauthlib
  credentials = Credentials(access, refresh)
  user_info = build("oauth2").userinfo().get()
  credentials_kaydet(email, "gdrive", credentials)
  jwt_token = jwt_olustur({email, name, picture})
  RedirectResponse → http://localhost:3000/auth/callback?access_token=JWT&...

Frontend: localStorage'a JWT yazar
```

**Scope'lar:** `openid`, `drive` (okuma + silme), `userinfo.email`, `userinfo.profile`

---

### Dropbox

```
Frontend: GET /auth/dropbox/login  (Bearer JWT gerekli)
  ← {"auth_url": "https://www.dropbox.com/oauth2/authorize?...&state=XYZ"}
  (state XYZ → _dropbox_states dict'e email ile eşlenir)

Kullanıcı Dropbox consent ekranını tamamlar
  → GET /auth/dropbox/callback?code=CODE&state=XYZ

Backend:
  email = _dropbox_states.pop(state)
  httpx.post("https://api.dropboxapi.com/oauth2/token", auth=(key, secret))
  credentials_kaydet(email, "dropbox", {access_token, refresh_token})
  RedirectResponse → /settings/integrations?connected=dropbox
```

**Scope'lar:** `files.content.read`, `files.content.write`, `files.metadata.read`, `offline` (token_access_type=offline)

---

### OneDrive (Microsoft)

```
Frontend: GET /auth/onedrive/login  (Bearer JWT gerekli)
  ← {"auth_url": "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?..."}
  (state → _onedrive_states dict'e email ile eşlenir)

Kullanıcı Microsoft consent ekranını tamamlar
  → GET /auth/onedrive/callback?code=CODE&state=XYZ

Backend:
  email = _onedrive_states.pop(state)
  httpx.post(".../oauth2/v2.0/token", data={code, client_id, secret, redirect_uri, ...})
  data = {access_token, refresh_token}
  credentials_kaydet(email, "onedrive", data)
  RedirectResponse → /settings/integrations?connected=onedrive
```

**Scope'lar:** `Files.ReadWrite.All`, `User.Read`, `offline_access`
**TENANT:** `consumers` (kişisel Microsoft hesapları; kurumsal için değiştirilmeli)

---

### pCloud

```
Frontend: GET /auth/pcloud/login  (Bearer JWT gerekli)
  ← {"auth_url": "https://my.pcloud.com/oauth2/authorize?..."}

Kullanıcı pCloud consent ekranını tamamlar
  → GET /auth/pcloud/callback?code=CODE&state=XYZ

Backend:
  email = _pcloud_states.pop(state)
  httpx.post("https://api.pcloud.com/oauth2_token", data={code, client_id, secret, ...})
  data = {access_token}
  credentials_kaydet(email, "pcloud", data)
  RedirectResponse → /settings/integrations?connected=pcloud
```

---

## 8. API Endpoint Referansı

### Auth

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| GET | `/auth/login` | - | Google OAuth URL döner |
| GET | `/auth/callback` | - | Google callback → JWT üretir → frontend'e redirect |
| GET | `/auth/me` | JWT | Giriş yapan kullanıcı bilgisi |
| GET | `/auth/dropbox/login` | JWT | Dropbox auth URL döner |
| GET | `/auth/dropbox/callback` | - | Dropbox callback → token kaydeder |
| GET | `/auth/pcloud/login` | JWT | pCloud auth URL döner |
| GET | `/auth/pcloud/callback` | - | pCloud callback → token kaydeder |
| GET | `/auth/onedrive/login` | JWT | OneDrive auth URL döner |
| GET | `/auth/onedrive/callback` | - | OneDrive callback → token kaydeder |

### Indexleme & Sync

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| POST | `/index` | JWT | Tüm bağlı provider'ları tam indexler |
| POST | `/sync` | JWT | Delta senkronizasyon |

**`/index` request body:**
```json
{ "folder_id": "opsiyonel", "limit": 500 }
```

**`/index` response:**
```json
{ "message": "...", "collection": "photos_abc123", "indexed": 47, "total_found": 47, "errors": null }
```

### Arama

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| GET | `/search` | JWT | Doğal dil ile fotoğraf arama |
| GET | `/stats` | JWT | EXIF kapsam istatistikleri |

**`/search` query parametreleri:**

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `q` | string | zorunlu | Arama metni |
| `limit` | int | 10 | Sayfa başına sonuç (1–50) |
| `offset` | int | 0 | Sayfalama offseti |
| `source` | string | - | Provider filtresi: `gdrive`, `dropbox`, `onedrive`, `pcloud` |
| `year_from` | int | - | EXIF yıl başlangıcı |
| `year_to` | int | - | EXIF yıl bitişi |
| `camera_make` | string | - | Kamera markası filtresi |

### Entegrasyonlar

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| GET | `/integrations` | JWT | Bağlı provider durumlarını döner |
| DELETE | `/integrations/{source}` | JWT | Provider bağlantısını keser |

**`/integrations` response:**
```json
{
  "gdrive":   { "connected": true,  "label": "Google Drive", "disabled": false },
  "dropbox":  { "connected": true,  "label": "Dropbox",      "disabled": false },
  "onedrive": { "connected": false, "label": "OneDrive",     "disabled": false },
  "pcloud":   { "connected": false, "label": "pCloud",       "disabled": false }
}
```

### Fotoğraf İşlemleri

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| DELETE | `/photos/{source}/{file_id}` | JWT | Cloud'dan + Qdrant'tan siler |
| GET | `/photos/duplicates` | JWT | Yüksek benzerlikli fotoğraf grupları |
| POST | `/photos/duplicates/resolve` | JWT | Seçilen kopyaları siler, birini korur |
| GET | `/thumbnail` | `?token=JWT` | Thumbnail proxy (tüm provider'lar) |

**`/thumbnail` query parametreleri:** `file_id`, `source`, `token` (JWT — header yerine param, `<img src>` uyumluluğu için)

**Provider thumbnail davranışı:**
- `gdrive`: Direkt binary stream (MediaIoBaseDownload)
- `dropbox`: `files_get_temporary_link` → 302 redirect
- `pcloud`: `/getthumb` CDN link → 302 redirect
- `onedrive`: Graph API `/thumbnails/0/medium` → URL alır → 302 redirect

### Albümler

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| GET | `/albums` | JWT | Kullanıcının tüm albümleri |
| POST | `/albums` | JWT | Yeni albüm oluştur |
| GET | `/albums/{id}` | JWT | Albüm detayı + fotoğraflar |
| PATCH | `/albums/{id}` | JWT | Albümü yeniden adlandır |
| DELETE | `/albums/{id}` | JWT | Albümü sil |
| POST | `/albums/{id}/photos` | JWT | Albüme fotoğraf ekle |
| DELETE | `/albums/{id}/photos` | JWT | Albümden fotoğraf çıkar |

### Debug (Dev Only)

| Metot | Yol | Auth | Açıklama |
|-------|-----|------|----------|
| GET | `/debug/collection?email=...` | - | Qdrant'taki tüm kayıtlar |
| GET | `/debug/providers?email=...` | - | Provider başına fotoğraf sayısı |

---

## 9. Frontend — Sayfa Yapısı

```
frontend/src/
├── app/
│   ├── page.tsx                    # Landing — PhotoMind giriş sayfası (Google OAuth)
│   ├── auth/callback/page.tsx      # OAuth callback işleyici
│   ├── dashboard/page.tsx          # Index / Sync kontrol paneli
│   ├── search/page.tsx             # Ana arama ekranı
│   ├── duplicates/page.tsx         # Duplikat yönetimi
│   ├── albums/
│   │   ├── page.tsx                # Albüm listesi
│   │   └── [id]/page.tsx           # Albüm detay
│   └── settings/
│       └── integrations/page.tsx   # Provider bağlantı yönetimi
├── components/
│   └── common/
│       ├── Sidebar.tsx             # Sol sidebar navigasyon (Panel, Ara, Albümler, Yinelenenler, Entegrasyonlar + kullanıcı dropdown)
│       └── Navbar.tsx              # (Eski horizontal navbar — artık kullanılmıyor, Sidebar.tsx ile değiştirildi)
├── hooks/
│   └── useAuth.ts                  # JWT + user state yönetimi
└── lib/
    └── api.ts                      # Tüm backend API çağrıları
```

### `page.tsx` — Landing

Sade PhotoMind giriş ekranı: uygulama adı, "Cross-Cloud Image Manager" alt başlığı ve Google OAuth login butonu. `/auth/login` → `auth_url` → `window.location.href` ile Google'a yönlendirir.

### `auth/callback/page.tsx`

Backend'in redirect'inden dönen `access_token`, `email`, `name`, `picture` parametrelerini URL'den alır, `localStorage`'a yazar, dashboard'a yönlendirir.

### `dashboard/page.tsx`

`POST /index` ve `POST /sync` için kontrol paneli. İndexleme için `folder_id` ve `limit` input'ları var. Sync hataları varsa localStorage'a yazar; search sayfasında toast olarak gösterilir.

### `search/page.tsx`

- CLIP tabanlı arama kutusu — metin gir, Enter veya buton
- Source filtre pill'leri: **Tümü / Google Drive / Dropbox / OneDrive / pCloud**
- EXIF filtre panel'i (yıl aralığı, kamera markası) — `/stats` endpoint'inden kamera listesi
- 12'li sayfalama — "Daha fazla getir" butonu, append (replace değil)
- PhotoModal — büyük görsel, EXIF bilgileri (tarih, GPS, kamera), albüme ekle, sil
- `<img src={thumbnailUrl(file_id, source)}>` — `/thumbnail` proxy üzerinden

### `duplicates/page.tsx`

`/photos/duplicates` çağırır, grupları gösterir. Her gruptan hangisini saklayacağını kullanıcı seçer, `/photos/duplicates/resolve` ile diğerleri silinir. Tasarruf edilecek disk alanı gösterilir.

### `albums/page.tsx` + `[id]/page.tsx`

Sanal albüm listesi ve detay sayfası. Fotoğraflar cloud'da kalır, sadece referanslar saklanır.

### `settings/integrations/page.tsx`

Dört provider kartı (Google Drive, Dropbox, pCloud, OneDrive). Her kart:
- Bağlı / Bağlı değil badge
- Scope bilgisi (mevcut vs. gerekli)
- "OAuth ile Bağlan" butonu → ilgili login endpoint'i → `auth_url` → `window.location.href`
- "Bağlantıyı Kes" butonu → `DELETE /integrations/{source}`
- OAuth callback toast: URL'deki `?connected=` veya `?error=` parametresinden okur

---

## 10. Frontend API Katmanı

`src/lib/api.ts` tüm backend çağrılarını kapsüller. `getToken()` localStorage'dan JWT okur, her istekte `Authorization: Bearer` header'ı ekler. 401 gelirse token silinir, kullanıcı `/`'e yönlendirilir.

**`authApi`:**
```typescript
login()         → GET /auth/login              → {auth_url}
me()            → GET /auth/me                 → {logged_in_user}
dropboxLogin()  → GET /auth/dropbox/login      → {auth_url}
pcloudLogin()   → GET /auth/pcloud/login       → {auth_url}
onedriveLogin() → GET /auth/onedrive/login     → {auth_url}
```

**`thumbnailUrl(file_id, source)`:** Backend URL + query params üretir — `<img src>` ile kullanılır.

**`SOURCE_CONFIG`:** Her provider için `label`, `color`, `bg` renk değerleri. UI'da tutarlılık için.

**`SourceKey` tipi:** `"gdrive" | "dropbox" | "pcloud" | "onedrive"` — tüm provider referansları için kullanılır.

---

## 11. Geliştirme Fazları

| Faz | İçerik | Durum |
|-----|--------|-------|
| **Faz 1** | Proje prototip — tek dosya Google Drive + Qdrant | ✅ |
| **Faz 2** | FastAPI backend, Google OAuth, JWT, CLIP, tam indexleme | ✅ |
| **Faz 3** | Delta sync, EXIF filtresi, Next.js frontend | ✅ |
| **Faz 4** | Dropbox entegrasyonu, provider factory pattern, album sistemi | ✅ |
| **Faz 5A** | OneDrive + pCloud entegrasyonu | ✅ (pCloud test bekliyor) |
| **Faz 5A+** | OneDrive delta sync düzeltmeleri (cTag kirlenmesi, BFS listing, reconciliation, T_start tüketimi) | ✅ |
| **Faz 5B** | Redis geçişi, OneDrive/Dropbox token otomatik yenileme | 🔜 Planlandı |
| **Faz 6** | PhotoMind UI yeniden tasarımı — sidebar layout, PhotoMind branding | ✅ |

---

## 12. Ortam Değişkenleri

`.env` dosyası `backend/` dizininde olmalıdır.

```env
# Qdrant
QDRANT_URL=https://xxxx.qdrant.io
QDRANT_API_KEY=...

# JWT
JWT_SECRET=uzun-rastgele-gizli-anahtar

# Dropbox
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REDIRECT_URI=http://localhost:8000/auth/dropbox/callback

# pCloud
PCLOUD_CLIENT_ID=...
PCLOUD_CLIENT_SECRET=...

# OneDrive (Microsoft Azure App Registration)
ONEDRIVE_CLIENT_ID=...
ONEDRIVE_CLIENT_SECRET=...
ONEDRIVE_TENANT_ID=consumers   # kişisel MS hesapları için
```

Google için `.env` değil, `backend/credentials.json` kullanılır (Google Cloud Console'dan indirilir).

---

## 13. Bilinen Sınırlılıklar

### In-Memory Credential Saklama

`token_store.py` Python dict kullanır. Sunucu restart olduğunda tüm credentials ve page token'lar kaybolur. Kullanıcıların yeniden OAuth yapması ve `/index` çalıştırması gerekir. **Çözüm planı:** Faz 5B'de Redis geçişi.

### OneDrive Token Otomatik Yenileme Yok

OneDrive access token ~1 saat sonra sona erer. `refresh_token` token_store'da saklanıyor fakat `OneDriveProvider` sadece `access_token` ile başlatılır; otomatik yenileme implement edilmedi. Expire olduğunda Graph API `401` döner. **Çözüm planı:** Faz 5B'de Redis geçişi ile birlikte token refresh middleware'i.

### pCloud Test Edilmedi

OAuth flow ve provider implementasyonu yazıldı. pCloud API credentials mevcut olmadığı için uçtan uca test yapılamadı. EU hesapları için `PCLOUD_URL = "https://eapi.pcloud.com"` değiştirilmeli.

### Dropbox EXIF Yok

Dropbox API, dosya metadata'sında EXIF bilgisi döndürmez. Dropbox'tan indexlenen fotoğraflar için tarih, GPS ve kamera bilgisi olmaz; bu fotoğraflar EXIF filtresinde görünmez.

### Tek Sunucu Sınırlılığı


`_dropbox_states`, `_pcloud_states`, `_onedrive_states` ve `_flow` (Google) tüm global Python değişkenleridir. Birden fazla gunicorn worker veya load balancer durumunda state paylaşılmaz — OAuth akışları çakışır. **Çözüm planı:** Redis session store.

### Thumbnail Proxy Bant Genişliği

`gdrive` thumbnail'ları backend üzerinden stream edilir (binary). Dropbox, pCloud ve OneDrive için CDN redirect kullanılır (302) — bu daha verimlidir. Büyük kullanıcı tabanında Google Drive thumbnail'larının da redirect'e alınması gerekebilir.
