# 08 — Frontend Sayfaları

## Genel Yapı
Next.js 15 App Router kullanılır. Tüm sayfalar `src/app/` dizinindedir. Korumalı sayfalar `useAuth()` hook'u ile kontrol edilir.

---

## `frontend/src/app/layout.tsx` — Kök Layout
- Tüm uygulama için HTML wrapper
- Google Fonts: yalnızca **Epilogue** — `var(--font-epilogue)`. Başka font yoktur (Syne, DM Sans, JetBrains Mono kullanılmaz).
- CSS değişkenleri `<html>` elementine atanır
- Meta: `"PhotoMind — Cross-Cloud Image Manager"`

## `frontend/src/app/globals.css` — Global Stiller
- Dark theme CSS değişkenleri: `--bg`, `--surface`, `--border`, `--accent` (#7c6dfa)
- Text değişkenleri: `--text`, `--text-muted`, `--dimmer`
- Custom scrollbar (accent renk hover'da)
- Noise overlay efekti (görsel doku)
- Animasyonlar: `fadeIn`, `pulse-glow`, `spin-slow`, `toast-in`
- Tailwind direktifleri: `@tailwind base/components/utilities`

---

## Sayfa Dizini

### `app/page.tsx` — Ana Sayfa / Giriş
- Giriş yapılmışsa `/account`'a yönlendirir (`router.replace("/account")`)
- "PhotoMind" markası + Google giriş butonu
- `authApi.login()` → `{ auth_url }` → `window.location.href = auth_url`
- Giriş hatası inline gösterilir

### `app/auth/callback/page.tsx` — OAuth Callback
- URL'den `access_token, name, email, picture` parametrelerini okur
- `localStorage.setItem("access_token", access_token)`
- `localStorage.setItem("user", JSON.stringify({ email, name, picture }))`
- `/account`'a yönlendirir (`router.replace("/account")`)
- Bu parametreler backend'deki `RedirectResponse`'tan gelir (GET `/auth/callback` → frontend `/auth/callback?...`)

### `app/account/page.tsx` — Hesabım (Profil + Entegrasyonlar + İndeksleme)
- Tek sayfa: profil bilgileri, bulut hesap bağlama, indeksleme ve senkronizasyon
- **OAuth callback işleme:** `searchParams.get("connected")` → başarı toast'u; `searchParams.get("error")` → hata mesajı (entegrasyon callback'leri buraya yönlendirir)
- Bölümler: Profil kartı | Bulut Hesapları (4 provider) | İndeksleme başlat | Senkronizasyon
- `indexApi.start({ limit })` → tam indeksleme, `syncApi.run()` → delta sync
- Hesap silme: onay metni `DELETE {email}` ile doğrulama gerektirir

### `app/search/page.tsx` — Fotoğraf Arama
Bkz. `02-Search.md` — detaylı açıklama orada.

### `app/edit/page.tsx` — AI Editör
Bkz. `05-AI-Edit.md` — detaylı açıklama orada.

### `app/albums/page.tsx` — Albüm Listesi
Bkz. `06-Albums.md` — detaylı açıklama orada.

### `app/albums/[id]/page.tsx` — Albüm Detayı
Bkz. `06-Albums.md` — detaylı açıklama orada.

### `app/duplicates/page.tsx` — Yinelenenler
Bkz. `07-Duplicates.md` — detaylı açıklama orada.

### `app/help/page.tsx` — Yardım
- Auth gerektirmez (Sidebar var ama giriş kontrolü yapılmaz)
- Statik içerik, `SECTIONS` array'i ile render edilir:
  - Arama, AI Düzenle (ops grid — 7 işlem, 2 sütun), Albümler, Yinelenenler, Hesabım
- "Hızlı Başlangıç" bölümü: 4 adımlı onboarding rehberi
- Sidebar'dan "Yardım al" menü öğesi ile erişilir

---

## Ortak Sayfa Özellikleri

**Koruma:** Her korumalı sayfa:
```typescript
const { user } = useAuth();
if (!user) router.push("/");
```

**Layout düzeni:**
```jsx
<div style={{ display: "flex", minHeight: "100vh" }}>
  <Sidebar />
  <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0 }}>
    {/* içerik */}
  </main>
</div>
```

**Inline CSS:** Tüm sayfalar `style={{}}` objesi kullanır, Tailwind minimal

**Türkçe UI:** Tüm etiket, buton ve placeholder metinleri Türkçe

**Hata yönetimi:** Try-catch blokları, error state → UI'da gösterim

**API çağrıları:** Tümü `src/lib/api.ts` üzerinden, Bearer token otomatik eklenir

---

## Rota Haritası

```
/                     → Giriş (giriş yapılmışsa /account'a yönlendirir)
/auth/callback        → OAuth geri dönüş (JWT'yi localStorage'a yazar, /account'a yönlendirir)
/account              → Profil + bulut entegrasyonlar + indeksleme + sync
/search               → Fotoğraf arama
/edit                 → AI görüntü düzenleme
/albums               → Albüm listesi
/albums/[id]          → Albüm detayı
/duplicates           → Yinelenen tespit
/help                 → Yardım (statik, auth gereksiz)
```

**Var olmayan rotalar (eski referanslar):**
- `/dashboard` — mevcut değil
- `/settings/integrations` — mevcut değil
