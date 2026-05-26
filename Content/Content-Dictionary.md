# Content-Dictionary — PhotoMind Dokümantasyon Rehberi

**PhotoMind:** AI destekli, çok bulutlu fotoğraf yönetim sistemi.  
**Stack:** FastAPI + Next.js 15 + CLIP + Qdrant + Replicate.com

---

## Dosya Dizini

| Dosya | Kapsam | Anahtar Dosyalar |
|-------|--------|-----------------|
| [01-Auth.md](01-Auth.md) | Kimlik doğrulama, OAuth akışları, JWT | `auth.py`, `jwt_handler.py`, `token_store.py`, `dependencies.py`, `useAuth.ts`, `integrations/page.tsx` |
| [02-Search.md](02-Search.md) | CLIP vektör arama, Qdrant sorguları | `embedding.py`, `qdrant_db.py`, `main.py (/search)`, `search/page.tsx` |
| [03-Sync.md](03-Sync.md) | Tam indeksleme ve delta senkronizasyon | `sync.py`, `main.py (/index, /sync)`, `dashboard/page.tsx` |
| [04-Cloud-Providers.md](04-Cloud-Providers.md) | Bulut sağlayıcı abstraction katmanı | `providers/base.py`, `gdrive.py`, `dropbox.py`, `onedrive.py`, `pcloud.py`, `factory.py` |
| [05-AI-Edit.md](05-AI-Edit.md) | AI görüntü düzenleme (7 işlem) | `edit_providers/base.py`, `replicate.py`, `edit/page.tsx` |
| [06-Albums.md](06-Albums.md) | Sanal albüm sistemi (SQLite) | `album_store.py`, `albums/page.tsx`, `albums/[id]/page.tsx` |
| [07-Duplicates.md](07-Duplicates.md) | Yinelenen fotoğraf tespiti ve silme | `qdrant_db.py (duplikatlari_bul)`, `main.py (/photos/duplicates)`, `duplicates/page.tsx` |
| [08-Frontend-Pages.md](08-Frontend-Pages.md) | Tüm Next.js sayfaları genel bakış | `app/` dizinindeki tüm `page.tsx` dosyaları |
| [09-Shared-Components.md](09-Shared-Components.md) | Paylaşılan bileşenler, hook'lar, API katmanı | `Sidebar.tsx`, `Navbar.tsx`, `useAuth.ts`, `lib/api.ts` |

---

## Sistem Mimarisi Özeti

```
Kullanıcı
  │
  ├─ Next.js Frontend (port 3000)
  │    ├─ /search → doğal dil fotoğraf arama
  │    ├─ /edit → AI görüntü düzenleme
  │    ├─ /albums → sanal albüm yönetimi
  │    ├─ /duplicates → yinelenen tespit + silme
  │    ├─ /dashboard → indeks + sync kontrolü
  │    └─ /settings/integrations → bulut hesap bağlama
  │
  └─ FastAPI Backend (port 8000)
       ├─ Google OAuth / cloud OAuth → JWT
       ├─ CLIP (openai/clip-vit-base-patch32) → 512d vektörler
       ├─ Qdrant Cloud → vektör depolama + cosine similarity
       ├─ Cloud Providers → GDrive / Dropbox / OneDrive / pCloud
       ├─ Replicate.com → AI model çalıştırma
       └─ SQLite (album_store.db) → albüm referansları
```

---

## Önemli Bileşen Listesi

### Backend
| Bileşen | Dosya | Ne Yapar |
|---------|-------|----------|
| CLIP Wrapper | `embedding.py` | Metin ve görüntüyü 512d vektöre çevirir |
| Qdrant Ops | `qdrant_db.py` | Vektör kaydetme, arama, silme, duplikat tespiti |
| Full Indexer | `sync.py:index_all` | Tüm providerları tarar, CLIP ile embed eder |
| Delta Syncer | `sync.py:delta_sync` | Yalnızca değişiklikleri günceller |
| Provider Factory | `providers/factory.py` | source string → Provider nesnesi |
| Edit Factory | `edit_providers/factory.py` | provider_adi → EditProvider nesnesi |
| Album Store | `album_store.py` | SQLite CRUD (albüm + fotoğraf referansları) |
| Token Store | `token_store.py` | Bellek içi OAuth token deposu |
| JWT | `jwt_handler.py` | HS256 token üret / doğrula |
| Auth Deps | `dependencies.py` | FastAPI dependency: kullanıcı + credentials kontrolü |

### Frontend
| Bileşen | Dosya | Ne Yapar |
|---------|-------|----------|
| Sidebar | `components/common/Sidebar.tsx` | Ana navigasyon, daraltılabilir |
| useAuth | `hooks/useAuth.ts` | localStorage'dan user/token yönetimi |
| API Client | `lib/api.ts` | Tüm backend çağrıları, token injection |
| CompareCanvas | `app/edit/page.tsx` | Before/after karşılaştırma + slider |
| MaskCanvasModal | `app/edit/page.tsx` | Inpainting maske çizimi |
| AIEditPanel | `app/edit/page.tsx` | İşlem seçici + dinamik parametreler |
| ImagePicker | `app/edit/page.tsx` | Cloud arama veya yerel yükleme ile görsel seçimi |
| PhotoModal | `app/search/page.tsx` | Tam ekran fotoğraf + EXIF + aksiyonlar |
| Lightbox | `app/albums/[id]/page.tsx` | Albüm içi gezinme + metadata |
| DuplicateGroup | `app/duplicates/page.tsx` | Grup kartı + seçim + onay modalı |

---

## Veri Akışları

### Arama
`Kullanıcı metni → CLIP → 512d vektör → Qdrant cosine similarity → filtreleme → sayfalama → thumbnail proxy`

### İndeksleme
`Provider listesi → download → CLIP embed → Qdrant upsert → delta token kaydı`

### AI Düzenleme
`Görüntü (cloud/local) → base64 → Replicate API → model çalışır → base64 sonuç → before/after gösterim`

### Duplikat Tespiti
`Tüm vektörler → çiftli cosine similarity → eşik filtresi → gruplar → kullanıcı seçimi → cloud sil + Qdrant sil`

---

## Bilinen Kısıtlar

| Kısıt | Etki | Plan |
|-------|------|------|
| In-memory token store | Sunucu restart = logout | Redis (Phase 5B) |
| OneDrive token refresh yok | Token expire = 401 | Refresh middleware (Phase 5B) |
| pCloud test edilmedi | Credentials yok | — |
| Dropbox EXIF yok | Yıl/kamera filtreleri çalışmaz | — |
| Tek sunucu state | Çoklu worker desteksiz | Redis ile çözülecek |
