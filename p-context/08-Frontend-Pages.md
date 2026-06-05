# 08 — Frontend Sayfaları

## Genel Yapı
Next.js 15 App Router kullanılır. Tüm sayfalar `src/app/` dizinindedir. Korumalı sayfalar `useAuth()` hook'u ile kontrol edilir.

---

## `frontend/src/app/layout.tsx` — Kök Layout
- Tüm uygulama için HTML wrapper
- Google Fonts yüklenir: **Syne** (başlıklar), **DM Sans** (gövde), **JetBrains Mono** (mono)
- CSS değişkenleri `<html>` elementine atanır
- Meta: "PhotoMind — Cross-Cloud Image Manager"

## `frontend/src/app/globals.css` — Global Stiller
- Dark theme CSS değişkenleri: `--bg`, `--surface`, `--border`, `--accent` (#7c6dfa)
- Text değişkenleri: `--text`, `--dim`, `--dimmer`
- Custom scrollbar (accent renk hover'da)
- Noise overlay efekti (görsel doku)
- Animasyonlar: `fadeIn`, `pulse-glow`, `spin-slow`, `toast-in`
- Tailwind direktifleri: `@tailwind base/components/utilities`

---

## Sayfa Dizini

### `app/page.tsx` — Ana Sayfa / Giriş
- Giriş yapılmışsa `/dashboard`'a yönlendirir
- "PhotoMind" markası + Google giriş butonu
- `authApi.login()` → auth_url'e redirect
- Giriş hatası inline gösterilir

### `app/auth/callback/page.tsx` — OAuth Callback
- URL'den `access_token, name, email, picture` parametrelerini okur
- localStorage'a JWT ve user bilgisini yazar
- `/dashboard`'a yönlendirir
- Hata durumunda: REDIRECT_URI güncelleme talimatı gösterir

### `app/dashboard/page.tsx` — Kontrol Paneli
- Hızlı arama kısayolu
- Tam indeksleme formu (folder ID + limit)
- Delta senkronizasyon butonu
- Her ikisi de durum kartları gösterir (yükleniyor / başarı / hata)

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

### `app/settings/integrations/page.tsx` — Entegrasyonlar
Bkz. `01-Auth.md` — detaylı açıklama orada.

---

## Ortak Sayfa Özellikleri

**Koruma:** Her korumalı sayfa:
```typescript
const { user, loading } = useAuth();
if (!loading && !user) router.push("/");
```

**Layout düzeni:** `Sidebar` (solda sabit) + ana içerik alanı (sağda)

**Inline CSS:** Tüm sayfalar `style={{}}` objesi kullanır, Tailwind minimal

**Türkçe UI:** Tüm etiket, buton ve placeholder metinleri Türkçe

**Hata yönetimi:** Try-catch blokları, error state → UI'da gösterim

**API çağrıları:** Tümü `src/lib/api.ts` üzerinden, Bearer token otomatik eklenir

---

## Rota Haritası

```
/                     → Giriş
/auth/callback        → OAuth geri dönüş
/dashboard            → İndeks + senkronizasyon
/search               → Fotoğraf arama
/edit                 → AI görüntü düzenleme
/albums               → Albüm listesi
/albums/[id]          → Albüm detayı
/duplicates           → Yinelenen tespit
/settings/integrations → Bulut hesap yönetimi
```
