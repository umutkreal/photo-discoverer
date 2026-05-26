# 04 — Bulut Sağlayıcılar

## Genel Bakış
Tüm bulut depolama işlemleri `BaseProvider` abstract sınıfından türeyen provider'lar üzerinden yürütülür. Factory pattern ile provider seçimi yapılır.

---

## `backend/providers/base.py` — Abstract Sınıf

Her provider'ın implement etmesi gereken 6 metot:

| Metot | Açıklama |
|-------|----------|
| `fotograflari_listele(klasor_id, limit)` | Provider'daki tüm görüntüleri listeler |
| `foto_indir(file_id) → PIL.Image` | Fotoğrafı belleğe indirir |
| `degisiklikleri_getir(page_token)` | `(eklenen, silinen, yeni_token)` döner |
| `foto_sil(file_id) → bool` | Fotoğrafı cloud'dan siler |
| `baslangic_token_al() → str` | Delta sync başlangıç token'ı |
| `foto_yukle(bytes, filename, folder)` | Editlenmiş görseli yükler |

**Fotoğraf dict formatı** (tüm provider'lar bu standartı döner):
```python
{
  "id": str,           # provider-özel ID
  "name": str,         # dosya adı
  "size": int,         # byte cinsinden
  "folder_path": str,  # "/Tatil/Yaz2024"
  "drive_url": str,    # paylaşım/önizleme linki
  "exif": {
    "date_taken": "2024-07-15T14:30:00",
    "year": 2024, "month": 7,
    "lat": 41.0082, "lon": 28.9784,
    "camera_make": "Apple",
    "camera_model": "iPhone 15 Pro"
  }
}
```

---

## Provider Implementasyonları

### `backend/providers/gdrive.py` — Google Drive
**Kütüphane:** `googleapiclient` (Drive v3)

- **Listeleme:** `mimeType contains 'image/' and trashed = false` sorgusu
- **İndirme:** `MediaIoBaseDownload` ile stream → BytesIO
- **Delta:** Changes API, `newStartPageToken` döner
- **Silme:** `files().delete(fileId=...)`
- **Yükleme:** Gerekirse klasör oluştur → `files().create()` ile `MediaIoBaseUpload`
- **EXIF:** `imageMediaMetadata` alanından (tarih, GPS, kamera)
- **Durum:** ✅ Tam çalışır

### `backend/providers/dropbox.py` — Dropbox
**Kütüphane:** Dropbox Python SDK

- **Listeleme:** `files_list_folder("", recursive=True)` + uzantı filtresi
- **İndirme:** `files_download(path_lower)`
- **Delta:** `files_list_folder_continue(cursor)` → `DeletedMetadata` + `FileMetadata`
- **Silme:** `files_delete_v2(path_lower)`
- **Token Yenileme:** SDK `refresh_token` varsa otomatik yeniler
- **EXIF:** Dropbox API'de yok → `exif: {}`
- **Durum:** ✅ Çalışır

### `backend/providers/onedrive.py` — OneDrive (Microsoft Graph)
**Kütüphane:** `httpx` (SDK yok, sync uyumluluğu için)

- **Listeleme:** BFS traversal; `/children` endpoint'i `$top: 200` ile; `photo` alanı veya `mimeType: image/*` filtresi
- **İndirme:** `GET /me/drive/items/{file_id}/content` + redirect takibi
- **Delta:** deltaLink URL olarak saklanır; `@odata.deltaLink` yeni token; `deleted` objeleri silmeleri işaret eder
- **Silme:** `DELETE /me/drive/items/{file_id}`
- **EXIF:** `photo.takenDateTime`, `location.latitude/longitude`
- **cTag sorunu:** Yukarı bakınız (03-Sync.md)
- **Durum:** ✅ Çalışır (token refresh yok → expire = 401)

### `backend/providers/pcloud.py` — pCloud
**API:** pCloud REST (Bearer yerine `access_token` query param)

- **Listeleme:** `GET /listfolder?folderid=0&recursive=1` → recursive tree walk
- **İndirme:** `GET /getfilelink?fileid=...` → CDN URL → download
- **Delta:** `GET /diff?diffid=...` → create/modify/delete olayları
- **Silme:** `GET /deletefile?fileid=...`
- **EXIF:** Yok → `exif: {}`
- **Not:** AB hesapları için `PCLOUD_URL = "https://eapi.pcloud.com"`
- **Durum:** ⏳ Test edilmedi (credentials yok)

---

## `backend/providers/factory.py`
```python
def provider_getir(source: str, credentials) → BaseProvider
```
`source` string'ine göre ilgili provider sınıfını instantiate eder. Yeni provider eklemek için sadece bu dosyaya case eklenir.

---

## Thumbnail Proxy (`backend/main.py`)
`GET /thumbnail?file_id=X&source=Y`
- Provider'ı belirler, `foto_indir()` ile küçük resmi stream eder
- Frontend doğrudan cloud URL'lerine bağlanmak yerine bu proxy'yi kullanır (yetkilendirme gereksinimi nedeniyle)

---

## Karşılaştırma Tablosu

| Özellik | GDrive | Dropbox | OneDrive | pCloud |
|---------|--------|---------|----------|--------|
| EXIF | ✅ | ❌ | Kısmi | ❌ |
| Delta sync | ✅ | ✅ | ✅ | ✅ |
| Token refresh | ✅ Otomatik | ✅ SDK | ❌ Manuel | ❌ |
| Yükleme | ✅ | ✅ | ✅ | ✅ |
| Durum | ✅ | ✅ | ✅ | ⏳ |
