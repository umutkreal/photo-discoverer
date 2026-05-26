# 09 — Paylaşılan Bileşenler, Hook'lar ve API Katmanı

## Genel Bakış
Uygulamada tekrar kullanılan bileşenler, hook'lar ve merkezi API istemcisi bu bölümde açıklanmaktadır.

---

## Bileşenler (`frontend/src/components/common/`)

### `Sidebar.tsx`
Uygulamanın ana navigasyon çubuğu (sol taraf, sabit).

**Export'lar:**
- `default Sidebar` — bileşen
- `SIDEBAR_WIDTH = 240` — genişletilmiş genişlik (px)
- `SIDEBAR_COLLAPSED_WIDTH = 64` — daraltılmış genişlik (px)

**Özellikler:**
- Daraltılabilir sidebar; durum localStorage'da kalıcı
- CSS değişkeni `--sidebar-w` güncellenir → diğer sayfalar buna göre layout yapar
- 6 navigasyon öğesi (ikona + etikete sahip):
  - Panel, Ara, AI Düzenle, Albümler, Yinelenenler, Entegrasyonlar
- Aktif sayfa tespiti: `usePathname()` ile
- Alt hesap dropdown'u: kullanıcı avatarı (resim veya baş harfler), email, Entegrasyonlar/Ayarlar/Yardım/Çıkış seçenekleri
- Hover efektleri, yumuşak geçişler
- Tüm ikonlar inline SVG

### `Navbar.tsx`
Üst navigasyon çubuğu. Sidebar'a geçildiğinden beri kullanılmıyor.

**Özellikler:**
- 64px yükseklik, blur backdrop, sabit üst
- Logo + 5 nav linki + kullanıcı bilgisi + çıkış butonu
- Aktif link altı çizgisi, küçük ekranda kullanıcı bilgisi gizlenir

---

## Hook'lar (`frontend/src/hooks/`)

### `useAuth.ts`
Uygulama genelinde kimlik doğrulama state yönetimi.

**`User` interface:**
```typescript
{ email: string; name: string; picture: string }
```

**Hook döndürdükleri:**
```typescript
{ user: User | null, loading: boolean, logout: () => void, setUser: (u) => void }
```

**Davranış:**
- Mount'ta: localStorage'dan `user` (JSON) okur, `loading: false` set eder
- `logout()`: `access_token` + `user` localStorage'dan silinir, `"/"` adresine yönlendirir
- `setUser()`: Auth callback sonrası user state'i günceller

**Kullanım pattern'i:**
```typescript
const { user, loading } = useAuth();
if (!loading && !user) { router.push("/"); return null; }
```

---

## API Katmanı — `frontend/src/lib/api.ts`

### Temel Yapı
```
BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
```

`request<T>(path, options)` — tüm endpoint'lerin kullandığı ortak istek fonksiyonu:
- localStorage'dan `access_token` ekler (Bearer)
- 401 yanıtı → localStorage temizle + `"/"` yönlendirme
- JSON parse + T tipiyle döner

### Type Export'ları

| Tip | Açıklama |
|-----|----------|
| `SourceKey` | `"gdrive" \| "dropbox" \| "pcloud" \| "onedrive"` |
| `PhotoResult` | filename, file_id, drive_url, thumbnail_url, source, score, EXIF alanları |
| `SearchFilters` | source, year_from, year_to, camera_make |
| `StatsResponse` | total, with_exif, with_gps, camera_makes[] |
| `Album` | album_id, owner, name, created_at, photo_count, photos? |
| `AlbumPhoto` | source, file_id, filename, drive_url, folder_path, file_size, added_at |
| `DuplicatePhoto` | file_id, filename, source, drive_url, file_size, folder_path, score |
| `NewEditRequest` | AI edit isteği body |
| `NewEditResult` | sonuc_b64, mime_type, islem, model, boyut, hata? |
| `IntegrationsResponse` | Her sağlayıcı için bağlantı durumu |

### API Namespace'leri

**`authApi`**
- `login()` → `GET /auth/login` → `{ auth_url }`
- `me()` → `GET /auth/me`
- `dropboxLogin()`, `pcloudLogin()`, `onedriveLogin()` → ilgili login URL'leri

**`indexApi`**
- `start({ folder_id?, limit })` → `POST /index`

**`syncApi`**
- `run()` → `POST /sync`

**`searchApi`**
- `search(q, limit, offset, filters)` → `GET /search` (query params)
- `stats()` → `GET /stats`

**`integrationApi`**
- `status()` → `GET /integrations`
- `revoke(source)` → `DELETE /integrations/{source}`

**`photoApi`**
- `delete(source, file_id)` → `DELETE /photos/{source}/{file_id}`
- `duplicates(threshold, limit)` → `GET /photos/duplicates`
- `resolve(keep, del)` → `POST /photos/duplicates/resolve`

**`albumApi`**
- `list()` → `GET /albums`
- `get(id)` → `GET /albums/{id}`
- `create(name)` → `POST /albums`
- `rename(id, name)` → `PATCH /albums/{id}`
- `delete(id)` → `DELETE /albums/{id}`
- `addPhoto(album_id, photo)` → `POST /albums/{id}/photos`
- `removePhoto(album_id, source, file_id)` → `DELETE /albums/{id}/photos/{source}/{file_id}`

**`editApi`**
- `edit(body: NewEditRequest)` → `POST /edit`
- `saveOnCloud(body)` → `POST /saveOnCloud`

**Yardımcı:**
- `thumbnailUrl(file_id, source)` → `GET /thumbnail?file_id=...&source=...` URL'i üretir

**`SOURCE_CONFIG`**
Her `SourceKey` için `{ label, color, bg }` bilgisi — UI'da kaynak rozetleri için kullanılır.
