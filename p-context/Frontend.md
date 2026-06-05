# Frontend — Mimari Referans

## Genel Mimari

**Çerçeve:** Next.js 15 (App Router), React 19  
**Dil:** TypeScript  
**Stil:** Inline CSS (`style={{}}`) öncelikli, Tailwind minimal kullanım  
**Font:** Sadece **Epilogue** (Google Fonts) — `var(--font-epilogue)`. Başka font yok.  
**State Yönetimi:** Yok — Redux, Zustand, Context kullanılmaz. Her sayfa kendi state'ini yönetir.  
**Auth State:** `localStorage` tabanlı (`access_token` + `user` JSON)  
**API Katmanı:** `/frontend/src/lib/api.ts` — tüm backend iletişimi buradan  

Tüm sayfa bileşenleri `"use client"` direktifi ile başlar. Next.js SSR kullanılmaz.

---

## Sayfa Listesi

| Yol | Dosya | Auth Gerekli | Açıklama |
|-----|-------|--------------|----------|
| `/` | `app/page.tsx` | Hayır | Landing; giriş yapılmışsa `/account`'a yönlendirir |
| `/auth/callback` | `app/auth/callback/page.tsx` | Hayır | JWT alır, localStorage'a kaydeder, `/account`'a yönlendirir |
| `/search` | `app/search/page.tsx` | Evet | AI fotoğraf araması + filtreler + modal |
| `/edit` | `app/edit/page.tsx` | Evet | AI görüntü düzenleme studio |
| `/albums` | `app/albums/page.tsx` | Evet | Albüm listesi (grid) |
| `/albums/[id]` | `app/albums/[id]/page.tsx` | Evet | Albüm detay + lightbox |
| `/duplicates` | `app/duplicates/page.tsx` | Evet | Duplikat tespit ve yönetim |
| `/account` | `app/account/page.tsx` | Evet | Profil + bulut bağlantılar + indeksleme + sync |
| `/help` | `app/help/page.tsx` | Hayır | Statik yardım sayfası |

**Var olmayan yollar (eski dokümantasyon hatası):**
- `/dashboard` — yok, `/account` kullanılıyor
- `/settings/integrations` — yok, `/account` içinde entegre

---

## API Katmanı (`lib/api.ts`)

### Temel Yapılandırma

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
```

Her istek `Authorization: Bearer <token>` header'ı ile gönderilir. Token `localStorage.getItem("access_token")` ile alınır.

### Kaynak Renk Konfigürasyonu

```typescript
const SOURCE_CONFIG = {
  gdrive:   { label: "Google Drive", srcBg: "#F5F5DC", light: true  },
  dropbox:  { label: "Dropbox",      srcBg: "#0049C2", light: false },
  pcloud:   { label: "pCloud",       srcBg: "#20BFFF", light: true  },
  onedrive: { label: "OneDrive",     srcBg: "#3A3A3A", light: false },
}
```

`light: true` → etiket metni koyu renk. `light: false` → etiket metni beyaz.

### thumbnailUrl()

```typescript
thumbnailUrl(file_id, source, token) → `${BASE_URL}/thumbnail?file_id=...&source=...&token=...`
```

JWT query param olarak geçirilir (header değil, `<img src>` uyumluluğu için).

### API Grupları

| Grup | Fonksiyonlar |
|------|--------------|
| `authApi` | `login()` — auth URL alır, `window.location.href = auth_url` |
| `userApi` | `me()`, `update(data)`, `delete(confirmText)` |
| `searchApi` | `search({ q, limit, offset, source?, year_from?, year_to?, camera_make? })` |
| `indexApi` | `start({ limit? })` |
| `syncApi` | `run()` |
| `photoApi` | `delete(source, file_id)` |
| `duplicatesApi` | `find({ threshold, limit })`, `resolve({ keep, delete })` |
| `albumApi` | `list()`, `get(id)`, `create(name)`, `rename(id, name)`, `delete(id)`, `addPhoto(albumId, photo)`, `removePhoto(albumId, source, file_id)` |
| `editApi` | `providers()`, `edit(payload)`, `saveOnCloud(payload)` |
| `integrationApi` | `list()`, `disconnect(source)` |

---

## useAuth Hook (`hooks/useAuth.ts`)

```typescript
type User = { email: string; name: string; picture: string }

function useAuth() {
  user: User | null       // localStorage'dan
  isLoggedIn: boolean
  logout: () => void      // localStorage temizle + "/" yönlendir
}
```

**Önemli:** Server validation yapılmaz. JWT'nin geçerliliği kontrol edilmez. Sadece localStorage okunur. Token expire olduğunda backend 401 döner — bu durumda her sayfanın kendi 401 işleme mantığı var.

---

## Sidebar (`components/common/Sidebar.tsx`)

### Boyutlar

```typescript
export const SIDEBAR_WIDTH           = 288;  // genişletilmiş
export const SIDEBAR_COLLAPSED_WIDTH = 77;   // daraltılmış
```

`--sidebar-w` CSS değişkeni dinamik güncellenir: her sayfa `margin-left: var(--sidebar-w)` kullanır.

### Nav Öğeleri (4 adet)

| Etiket | Yol | İkon |
|--------|-----|------|
| Ara | `/search` | Büyüteç |
| AI Düzenle | `/edit` | Yıldız/spark |
| Albümler | `/albums` | Grid |
| Yinelenenler | `/duplicates` | Kopyala |

### Menü Öğeleri (collapsed state düğmesine tıklanınca açılır)

| Etiket | Yol / Aksiyon |
|--------|---------------|
| Hesabım | `/account` |
| Yardım al | `/help` |
| — (divider) | — |
| Çıkış yap | `logout()` |

### State & Persistence

- `collapsed` state: `localStorage["sidebar-collapsed"]` ile persist edilir (`"0"` veya `"1"`)
- Logo butonuna tıklamak daralt/genişlet toggle'lar
- Menu açma: avatar/isim alanına tıklamak
- Menu dışına tıklamak kapatır (document `mousedown` listener)

### Hydration

SSR/CSR uyumsuzluğu: `collapsed` state client'ta `useEffect` içinde localStorage'dan set edilir. İlk render'da sidebar genişletilmiş görünür.

---

## Sayfa Özetleri

### `/` (Landing)

- `useAuth` ile giriş kontrolü; giriş yapılmışsa `router.replace("/account")`
- Giriş butonu: `authApi.login()` → `{ auth_url }` → `window.location.href = auth_url`
- Giriş yapılmamışsa landing tasarımı gösterilir

### `/auth/callback`

```
URL parametreleri: ?access_token=...&email=...&name=...&picture=...
  ↓
localStorage.setItem("access_token", access_token)
localStorage.setItem("user", JSON.stringify({ email, name, picture }))
  ↓
router.replace("/account")
```

Backend'den gelen `RedirectResponse` ile parameters URL'e eklenir.

### `/search`

- `LIMIT = 12` (sayfa başı sonuç)
- `offset` state ile sayfalama
- Filtre pilleri: Tümü | Google Drive | Dropbox | pCloud | OneDrive
- **SyncWarningToast:** `localStorage.last_sync_warning` varsa uyarı banner'ı gösterir
- **PhotoModal:** Büyütülmüş fotoğraf görünümü + "AI Düzenle" butonu (`/edit?file_id=...&source=...` yönlendirir) + "Albüme Ekle" butonu
- **AddToAlbumButton:** Mevcut albümleri listeler + inline albüm oluşturma formu

### `/edit`

- URL params `file_id` ve `source` ile cloud'dan fotoğraf yükler; yoksa dosya yükleme alanı gösterilir
- `AIEditPanel`: **460px** genişlik (sağ kenar)
- **`beforeFullImage` state:** Edit tamamlandığında response'daki `gorsel_b64` önce görseli tam çözünürlüklü hale getirir
- **Slider sıfırlama:** Yeni `resultImage` geldiğinde `useEffect` ile `setPos(0)` — slider her zaman soldan başlar
- **`isGenerating` durumu:** Tam görsel gösterilir (orijinal veya önceki sonuç), üstüne blur + tarama animasyonu overlay'i eklenir. Maske ve diğer UI elemanları gizlenir.
- **Hotkey:** `Cmd+Enter` (macOS) / `Ctrl+Enter` (Windows) ile `handleSubmit` tetiklenir
- Sonuç gelince: indir butonu + "Buluta Kaydet" butonu aktif olur

### `/albums`

- Grid: `auto-fill, minmax(240px, 1fr)`
- Her kart: albüm adı + fotoğraf sayısı + ilk 4 fotoğrafın thumbnail'ı
- Yeni albüm oluşturma modal'ı

### `/albums/[id]`

- Albüm fotoğraflarını grid olarak listeler
- **Lightbox:** tam ekran görüntüleme, sol/sağ ok geçiş, thumbnail strip (auto-scroll)
- Lightbox içinde "Buluttan Sil" butonu: `photoApi.delete()` + sayfa yenileme
- Fotoğrafı albümden çıkarma butonu

### `/duplicates`

- Benzerlik eşiği slider: **%80 - %99**, varsayılan **%95**
- Gruplar halinde duplikat fotoğraflar
- Her grup: "Sakla" seçimi (radio) + "Sil" işaretleme (checkbox)
- Toplu çözüm: `duplicatesApi.resolve({ keep, delete })` → seçilenler buluttan silinir

### `/account`

- **Tek sayfa:** hem profil hem entegrasyon hem indeksleme işlemleri
- Bölümler: Profil bilgileri | Bulut Hesapları | İndeksleme | Senkronizasyon
- **OAuth callback işleme:** `searchParams.get("connected")` → "Dropbox başarıyla bağlandı" toast'u; `searchParams.get("error")` → hata mesajı
- Provider bağlantı kartları: bağlı/bağlı değil durumu, bağla/bağlantıyı kes butonları
- `indexApi.start({ limit })` → tam indeksleme başlatır
- `syncApi.run()` → delta sync çalıştırır
- Hesap silme: `DELETE /users/me` — onay metni `DELETE {email}` ile doğrulama

### `/help`

- Auth gerektirmez (Sidebar mevcut ama giriş kontrolü yok)
- Statik içerik, `SECTIONS` array'i:
  - Arama (`/search`)
  - AI Düzenle (`/edit`) — ops grid (7 işlem, 2 sütun)
  - Albümler (`/albums`)
  - Yinelenenler (`/duplicates`)
  - Hesabım (`/account`)
- "Hızlı Başlangıç" bölümü: 4 adım

---

## CSS Değişkenleri & Tasarım Sistemi

`layout.tsx` veya global CSS'de tanımlanan değişkenler (tüm bileşenler kullanır):

| Değişken | Kullanım |
|----------|----------|
| `--font-display` | Başlıklar, kalın yazılar |
| `--font-body` | Gövde metni, UI elemanları |
| `--font-epilogue` | Epilogue font CSS değişkeni |
| `--sidebar-w` | Sidebar genişliği (JS tarafından güncellenir) |
| `--accent` | Ana vurgu rengi |
| `--accent-grad` | Gradient vurgu |
| `--text` | Ana metin rengi |
| `--text-muted` | Soluk/ikincil metin |
| `--dimmer` | Çok soluk metin/ikon |
| `--surface` | Yüzey arka planı (sidebar, kartlar) |
| `--surface-2` | İkincil yüzey (dropdown menü) |
| `--bg` | Sayfa arka planı |
| `--border` | Kenarlık rengi |
| `--error` | Hata rengi (logout gibi tehlikeli eylemler) |

Tasarım dark mode odaklıdır. Açık tema için ayrı CSS class yoktur.

---

## Önemli Tasarım Notları

### Inline CSS Kullanımı

Tüm bileşenler `style={{}}` ile stil alır. Tailwind `className` kullanımı nadirdir ve genellikle utility amaçlı (`flex`, `items-center` gibi). Tüm karmaşık stil inline'dır.

### Hydration ve localStorage

SSR/client uyumsuzlukları:
- Sidebar `collapsed` state: `useEffect` ile set edilir — ilk render'da genişletilmiş görünür
- Auth state: `useEffect` ile localStorage'dan okunur — ilk render'da `user === null`
- Tüm `localStorage` erişimi `useEffect` veya event handler içinde olmalı

### Sayfa Layout Paterni

Tüm sayfalar aynı layout pattern'ini izler:
```jsx
<div style={{ display: "flex", minHeight: "100vh" }}>
  <Sidebar />
  <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, ... }}>
    {/* içerik */}
  </main>
</div>
```

### Fotoğraf Gösterimi

Tüm fotoğraflar `<img src={thumbnailUrl(file_id, source, token)}>` ile gösterilir — doğrudan cloud URL değil. Thumbnail proxy JWT ile cloud'a erişir.

---

## Paket Bağımlılıkları (`package.json`)

| Paket | Versiyon | Kullanım |
|-------|----------|----------|
| `next` | 15.3.1 | Framework |
| `react` | ^19.0.0 | UI kütüphanesi |
| `react-dom` | ^19.0.0 | DOM rendering |

**State yönetim kütüphanesi yok.** Redux, Zustand, Jotai, MobX kullanılmaz.  
**Stil kütüphanesi yok.** styled-components, emotion kullanılmaz. Sadece inline CSS + minimal Tailwind.
