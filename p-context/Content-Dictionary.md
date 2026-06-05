# Content-Dictionary — PhotoMind Dokümantasyon Rehberi

**PhotoMind:** AI destekli, çok bulutlu fotoğraf yönetim sistemi.  
**Stack:** FastAPI + Next.js 15 + SigLIP + Qdrant + Replicate.com

---

## Dosya Dizini

| Dosya | Kapsam | Anahtar Dosyalar |
|-------|--------|-----------------|
| [01-Auth.md](01-Auth.md) | Kimlik doğrulama, OAuth akışları, JWT | `auth.py`, `jwt_handler.py`, `token_store.py`, `dependencies.py`, `useAuth.ts`, `account/page.tsx` |
| [02-Search.md](02-Search.md) | SigLIP vektör arama, Qdrant sorguları | `embedding.py`, `qdrant_db.py`, `main.py (/search)`, `search/page.tsx` |
| [03-Sync.md](03-Sync.md) | Tam indeksleme ve delta senkronizasyon | `sync.py`, `main.py (/index, /sync)`, `account/page.tsx` |
| [04-Cloud-Providers.md](04-Cloud-Providers.md) | Bulut sağlayıcı abstraction katmanı | `providers/base.py`, `gdrive.py`, `dropbox.py`, `onedrive.py`, `pcloud.py`, `factory.py` |
| [05-AI-Edit.md](05-AI-Edit.md) | AI görüntü düzenleme (7 işlem) | `edit_providers/base.py`, `replicate.py`, `edit/page.tsx` |
| [06-Albums.md](06-Albums.md) | Sanal albüm sistemi (SQLite) | `album_store.py`, `albums/page.tsx`, `albums/[id]/page.tsx` |
| [07-Duplicates.md](07-Duplicates.md) | Yinelenen fotoğraf tespiti ve silme | `qdrant_db.py (duplikatlari_bul)`, `main.py (/photos/duplicates)`, `duplicates/page.tsx` |
| [08-Frontend-Pages.md](08-Frontend-Pages.md) | Tüm Next.js sayfaları genel bakış | `app/` dizinindeki tüm `page.tsx` dosyaları |
| [09-Shared-Components.md](09-Shared-Components.md) | Paylaşılan bileşenler, hook'lar, API katmanı | `Sidebar.tsx`, `useAuth.ts`, `lib/api.ts` |
| [Backend.md](Backend.md) | Tam backend mimari referansı | Tüm backend dosyaları |
| [Frontend.md](Frontend.md) | Tam frontend mimari referansı | Tüm frontend dosyaları |

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
  │    ├─ /account → profil + bulut entegrasyonlar + indeks + sync
  │    └─ /help → yardım ve kullanım kılavuzu
  │
  └─ FastAPI Backend (port 8000)
       ├─ Google OAuth / cloud OAuth → JWT
       ├─ SigLIP (google/siglip-base-patch16-224) → 768d vektörler
       ├─ Qdrant Cloud → vektör depolama + cosine similarity
       ├─ Cloud Providers → GDrive / Dropbox / OneDrive / pCloud
       ├─ Replicate.com → AI model çalıştırma
       └─ SQLite (app.db) → kullanıcılar, tokenlar, albümler
```

---

## Önemli Bileşen Listesi

### Backend
| Bileşen | Dosya | Ne Yapar |
|---------|-------|----------|
| SigLIP Wrapper | `embedding.py` | Metin ve görüntüyü 768d vektöre çevirir |
| Qdrant Ops | `qdrant_db.py` | Vektör kaydetme, arama, silme, duplikat tespiti |
| Full Indexer | `sync.py:index_all` | Tüm providerları tarar, SigLIP ile embed eder |
| Delta Syncer | `sync.py:delta_sync` | Yalnızca değişiklikleri günceller |
| Provider Factory | `providers/factory.py` | source string → Provider nesnesi |
| Edit Factory | `edit_providers/factory.py` | provider_adi → EditProvider nesnesi |
| Album Store | `album_store.py` | SQLite CRUD (albüm + fotoğraf referansları) |
| Token Store | `token_store.py` | **SQLite** tabanlı OAuth token deposu (`tokens` tablosu) |
| OneDrive Refresh | `token_refresh.py` | OneDrive access token'ını yeniler, SQLite'a kaydeder |
| JWT | `jwt_handler.py` | HS256 token üret / doğrula; `jwt_dogrula()` → user_id string veya None |
| Auth Deps | `dependencies.py` | FastAPI dependency: kullanıcı + credentials kontrolü |
| OAuth State Store | `oauth_state_store.py` | InMemory state store (CSRF koruması, 600s TTL) |

### Frontend
| Bileşen | Dosya | Ne Yapar |
|---------|-------|----------|
| Sidebar | `components/common/Sidebar.tsx` | Ana navigasyon, daraltılabilir (288px / 77px) |
| useAuth | `hooks/useAuth.ts` | localStorage'dan user/token yönetimi (server validation yok) |
| API Client | `lib/api.ts` | Tüm backend çağrıları, token injection |
| CompareCanvas | `app/edit/page.tsx` | Before/after karşılaştırma + slider (sıfırlanır yeni sonuçta) |
| MaskCanvasModal | `app/edit/page.tsx` | Inpainting maske çizimi |
| AIEditPanel | `app/edit/page.tsx` | İşlem seçici + dinamik parametreler (**460px** genişlik) |
| ImagePicker | `app/edit/page.tsx` | Cloud arama veya yerel yükleme ile görsel seçimi |
| PhotoModal | `app/search/page.tsx` | Tam ekran fotoğraf + EXIF + aksiyonlar |
| Lightbox | `app/albums/[id]/page.tsx` | Albüm içi gezinme + metadata + thumbnail strip |
| DuplicateGroup | `app/duplicates/page.tsx` | Grup kartı + seçim + onay modalı |
| HelpPage | `app/help/page.tsx` | Statik yardım — bölümler + ops grid + hızlı başlangıç |

---

## Veri Akışları

### Arama
`Kullanıcı metni → SigLIP → 768d vektör → Qdrant cosine similarity → filtreleme → sayfalama → thumbnail proxy`

### İndeksleme
`Provider listesi → download → SigLIP embed → Qdrant upsert → delta token kaydı (indekslemeden SONRA)`

### AI Düzenleme
`Görüntü (cloud/local) → base64 → Replicate API → model çalışır → base64 sonuç → beforeFullImage güncellenir → slider sıfırlanır (pos=0) → before/after gösterim`

### Duplikat Tespiti
`Tüm vektörler → çiftli cosine similarity → eşik filtresi → gruplar → kullanıcı seçimi → cloud sil + Qdrant sil`

---

## Bilinen Kısıtlar

| Kısıt | Etki | Plan |
|-------|------|------|
| OAuth state store in-memory | Sunucu restart = state kaybı (login esnasında) | Redis (Phase 5B) |
| pCloud test edilmedi | Credentials yok | — |
| Dropbox EXIF yok | Yıl/kamera filtreleri çalışmaz | — |
| Tek sunucu state | Çoklu worker desteksiz | Redis ile çözülecek |

---

## Terimler Sözlüğü

| Terim | Açıklama |
|-------|----------|
| `source_key` | Provider kimliği: `"gdrive"`, `"dropbox"`, `"pcloud"`, `"onedrive"` |
| `file_id` | Provider'dan gelen dosya ID (GDrive: Google file ID, Dropbox: path_lower, pCloud: fileid int, OneDrive: item ID) |
| `page_token` | Delta sync checkpoint: GDrive startPageToken, Dropbox cursor, pCloud diffid |
| `point_id` | Qdrant integer ID = `file_id`'nin MD5 hash'inin ilk 8 byte'ı |
| `qdrant_collection` | `"user_" + UUID (dash'siz)` — her kullanıcı için ayrı |
| `beforeFullImage` | Edit tamamlandığında önceki görüntünün tam çözünürlüklü halini tutan state |
| `isGenerating` | AI işlemi sürüyor; tam görsel gösterilir, üstüne blur + tarama animasyonu overlay'i |
| Slider sıfırlama | Yeni `resultImage` geldiğinde slider pozisyonu `pos=0`'a sıfırlanır |
| `SIDEBAR_WIDTH` | `288` px (genişletilmiş sidebar) |
| `SIDEBAR_COLLAPSED_WIDTH` | `77` px (daraltılmış sidebar) |
| `--sidebar-w` | Dinamik CSS değişkeni; JS tarafından güncellenir, sayfalar `margin-left` için kullanır |
| Hydration | SSR/CSR uyumsuzluğu riski: `collapsed` state ve auth state `useEffect` ile client'ta yüklenir |
| Epilogue | Uygulamada kullanılan tek font ailesi (Google Fonts) |
| `SqliteTokenStore` | OAuth credential'larını SQLite `tokens` tablosuna yazan/okuyan sınıf |
| `InMemoryOAuthStateStore` | CSRF koruması için state → payload eşleştirmesi tutan in-memory dict (600s TTL) |
| `onedrive_token_yenile` | `token_refresh.py`'deki fonksiyon; OneDrive refresh token ile yeni access token alır |
