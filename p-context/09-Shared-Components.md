# 09 — Paylaşılan Bileşenler, Hook'lar ve API Katmanı

## Genel Bakış
Uygulamada tekrar kullanılan bileşenler, hook'lar ve merkezi API istemcisi bu bölümde açıklanmaktadır.

---

## Bileşenler (`frontend/src/components/common/`)

### `Sidebar.tsx`
Uygulamanın ana navigasyon çubuğu (sol taraf, sabit).

**Export'lar:**
- `default Sidebar` — bileşen
- `SIDEBAR_WIDTH = 288` — genişletilmiş genişlik (px)
- `SIDEBAR_COLLAPSED_WIDTH = 77` — daraltılmış genişlik (px)

**Nav Öğeleri (4 adet):**

| Etiket | Yol |
|--------|-----|
| Ara | `/search` |
| AI Düzenle | `/edit` |
| Albümler | `/albums` |
| Yinelenenler | `/duplicates` |

**Menü Öğeleri** (hesap butonuna tıklanınca açılan dropdown):

| Etiket | Yol / Aksiyon |
|--------|---------------|
| Hesabım | `/account` |
| Yardım al | `/help` |
| — (divider) | — |
| Çıkış yap | `logout()` (kırmızı, danger) |

**Özellikler:**
- Daraltılabilir sidebar; durum `localStorage["sidebar-collapsed"]` (`"0"` veya `"1"`) ile kalıcı
- CSS değişkeni `--sidebar-w` her toggle'da güncellenir → diğer sayfalar `margin-left: var(--sidebar-w)` ile layout yapar
- Geçiş animasyonu: `transition: "width 0.2s ease"` (sidebar) + `transition: "margin-left 0.2s ease"` (sayfa içeriği)
- Aktif sayfa tespiti: `usePathname()` ile
- Alt hesap butonu: kullanıcı avatarı (Google fotoğrafı veya baş harf fallback) + isim + email + yukarı ok
- Hover efektleri, yumuşak geçişler
- Tüm ikonlar inline SVG

**Hydration notu:** `collapsed` state client'ta `useEffect` içinde localStorage'dan yüklenir. İlk SSR render'ında sidebar genişletilmiş görünür (cumulative layout shift riski).

**Navbar.tsx yok:** Eski dokümantasyon `Navbar.tsx`'ten bahseder. Bu bileşen artık mevcut değildir; yerine `Sidebar.tsx` kullanılır.

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
{ user: User | null, logout: () => void }
```

**Davranış:**
- Mount'ta: localStorage'dan `user` (JSON) okur
- `logout()`: `access_token` + `user` localStorage'dan silinir, `"/"` adresine yönlendirir
- Server validation yapılmaz — sadece localStorage'dan okunur
- JWT expire kontrolü yoktur; token expire olduğunda backend 401 döner

**Kullanım pattern'i:**
```typescript
const { user } = useAuth();
useEffect(() => {
  if (!user) router.push("/");
}, [user]);
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

**`userApi`**
- `me()` → `GET /users/me`
- `update(data)` → `PATCH /users/me`
- `delete(confirmText)` → `DELETE /users/me`

**`indexApi`**
- `start({ folder_id?, limit })` → `POST /index`

**`syncApi`**
- `run()` → `POST /sync`

**`searchApi`**
- `search(q, limit, offset, filters)` → `GET /search` (query params)
- `stats()` → `GET /stats`

**`integrationApi`**
- `list()` → `GET /integrations`
- `disconnect(source)` → `DELETE /integrations/{source}`

**`photoApi`**
- `delete(source, file_id)` → `DELETE /photos/{source}/{file_id}`

**`duplicatesApi`**
- `find({ threshold, limit })` → `GET /photos/duplicates`
- `resolve({ keep, delete })` → `POST /photos/duplicates/resolve`

**`albumApi`**
- `list()` → `GET /albums`
- `get(id)` → `GET /albums/{id}`
- `create(name)` → `POST /albums`
- `rename(id, name)` → `PATCH /albums/{id}`
- `delete(id)` → `DELETE /albums/{id}`
- `addPhoto(album_id, photo)` → `POST /albums/{id}/photos`
- `removePhoto(album_id, source, file_id)` → `DELETE /albums/{id}/photos?source=X&file_id=Y`

**`editApi`**
- `providers()` → `GET /edit/providers`
- `edit(body: NewEditRequest)` → `POST /edit`
- `saveOnCloud(body)` → `POST /saveOnCloud`

**Yardımcı:**
- `thumbnailUrl(file_id, source, token)` → `GET /thumbnail?file_id=...&source=...&token=...` URL'i üretir (JWT query param olarak geçirilir — `<img src>` uyumluluğu için)

### SOURCE_CONFIG

Her `SourceKey` için UI renk ve etiket bilgisi:

| Source | Label | srcBg | Light |
|--------|-------|-------|-------|
| `gdrive` | Google Drive | `#F5F5DC` (krem) | true (koyu metin) |
| `dropbox` | Dropbox | `#0049C2` (koyu mavi) | false (beyaz metin) |
| `pcloud` | pCloud | `#20BFFF` (açık mavi) | true (koyu metin) |
| `onedrive` | OneDrive | `#3A3A3A` (koyu gri) | false (beyaz metin) |
