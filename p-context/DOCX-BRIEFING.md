# PhotoMind — 50 Sayfalık Dokümantasyon Briefing'i

> Bu dosya, projeyi açıklayan bir teknik dokümantasyon (bitirme projesi raporu / proje raporu) oluşturacak bir yapay zekaya verilmek üzere hazırlanmıştır. İçerik, projenin tüm bileşenlerini, mimarisini, teknik kararlarını ve kullanım senaryolarını kapsar. Belgeyi Türkçe, akademik/profesyonel bir dil ile yazmanız beklenmektedir.

---

## 1. PROJENİN GENEL TANIMI VE MOTİVASYONU

**Proje Adı:** PhotoMind  
**Tür:** Web tabanlı, çok bulutlu, yapay zeka destekli fotoğraf yönetim sistemi  
**Kullanıcı Kitlesi:** Birden fazla bulut depolama hesabına sahip, fotoğraflarına kolay ve hızlı erişmek isteyen bireysel kullanıcılar

### Problem
Modern kullanıcılar fotoğraflarını birden fazla bulut platformuna (Google Drive, Dropbox, pCloud, OneDrive) dağıtmış durumdadır. Her platformun kendi arama motoru, kendi arayüzü ve kendi organizasyon mantığı vardır. Kullanıcı "2022 yılı yaz tatili fotoğrafları" gibi doğal bir dil ifadesiyle arama yapmak istediğinde ya her platformda ayrı ayrı gezinmek zorunda kalmakta ya da geleneksel etiket/klasör tabanlı aramalarla sınırlı kalmaktadır.

### Çözüm
PhotoMind, tüm bulut hesaplarındaki fotoğrafları tek bir sistemde indeksleyerek doğal dil aramasına olanak tanır. Google Drive, Dropbox, pCloud ve OneDrive eş zamanlı desteklenir. Arama motoru olarak SigLIP (Google'ın vision-language modeli) ve Qdrant vektör veritabanı kullanılır. Kullanıcı "deniz kenarında gün batımı" ya da "2023 doğum günü partisi" gibi cümlelerle arama yapabilir.

Bunun yanı sıra uygulama; AI tabanlı görüntü düzenleme, yinelenen fotoğraf tespiti ve sanal albüm oluşturma özellikleri sunar.

---

## 2. TEKNOLOJİ YIĞINI (TECH STACK)

| Katman | Teknoloji | Açıklama |
|--------|-----------|----------|
| Frontend | Next.js 15 (App Router) + TypeScript | Sunucu tarafı render + istemci bileşenleri |
| Backend | FastAPI (Python 3.13) | Yüksek performanslı REST API |
| Embedding Modeli | SigLIP `google/siglip-base-patch16-224` | 768 boyutlu çok modlu vektörler |
| Vektör Veritabanı | Qdrant Cloud | Cosine similarity ile anlam tabanlı arama |
| Kullanıcı Kimlik Doğrulama | Google OAuth 2.0 + JWT (HS256) | 24 saatlik token ömrü |
| Bulut Entegrasyonları | Google Drive, Dropbox, pCloud, OneDrive | Her biri kendi OAuth akışı |
| AI Görüntü Düzenleme | Replicate.com | 6 farklı Flux ve özel model |
| İlişkisel Veritabanı | SQLite (`app.db`) | Kullanıcılar, tokenlar, albümler |
| Stil | Tailwind CSS + global CSS değişkenleri | Dark theme, özel font (Epilogue) |

---

## 3. SİSTEM MİMARİSİ

### Genel Akış

```
Kullanıcı (Tarayıcı)
      │
      ▼
Next.js Frontend (port 3000)
  - /search       → Fotoğraf arama
  - /edit         → AI görüntü düzenleme
  - /albums       → Sanal albüm yönetimi
  - /duplicates   → Yinelenen fotoğraf tespiti
  - /account      → Hesap + entegrasyonlar + indeksleme
  - /help         → Kullanım kılavuzu
      │ (HTTP / REST)
      ▼
FastAPI Backend (port 8000)
  - Google OAuth + Cloud OAuth → JWT token üretimi
  - SigLIP embedding (768d vektörler)
  - Qdrant Cloud → vektör depolama + cosine similarity
  - Cloud Providers → GDrive / Dropbox / pCloud / OneDrive
  - Replicate.com → AI model çalıştırma
  - SQLite → kullanıcılar, tokenlar, albümler
```

### Katman Mimarisi

**Backend katmanları:**
1. **API Katmanı** (`main.py`): FastAPI endpoint'leri, request doğrulama, dependency injection
2. **Auth Katmanı** (`auth.py`, `jwt_handler.py`, `dependencies.py`): OAuth akışları, JWT yönetimi
3. **Embedding Katmanı** (`embedding.py`): SigLIP model sarmalayıcı
4. **Vektör Katmanı** (`qdrant_db.py`): Qdrant CRUD işlemleri
5. **Sync Katmanı** (`sync.py`): Tam indeksleme ve delta senkronizasyon mantığı
6. **Provider Katmanı** (`providers/`): Bulut depolama abstraction'ı
7. **Edit Katmanı** (`edit_providers/`): AI düzenleme sağlayıcı abstraction'ı
8. **Depolama Katmanı** (`token_store.py`, `album_store.py`, `user_store.py`): SQLite CRUD

**Frontend katmanları:**
1. **Sayfa Katmanı** (`app/*/page.tsx`): Next.js App Router sayfaları
2. **Bileşen Katmanı** (`components/`): Paylaşılan UI bileşenleri
3. **Hook Katmanı** (`hooks/`): React state yönetimi
4. **API Katmanı** (`lib/api.ts`): Backend iletişimi

---

## 4. KİMLİK DOĞRULAMA (AUTH) SİSTEMİ

### İki Katmanlı Auth Yapısı

PhotoMind'da kimlik doğrulama iki bağımsız sorumluluk üstlenir:
- **Kullanıcı girişi:** Google OAuth 2.0 → JWT token (uygulamaya erişim)
- **Provider bağlama:** Her bulut için OAuth (fotoğraflara erişim)

### Google OAuth + JWT Akışı

1. Kullanıcı "Google ile Giriş Yap"a tıklar
2. Frontend → `GET /auth/login` → backend authorization URL üretir
3. Kullanıcı Google sayfasında onay verir
4. Google → `GET /auth/callback?code=...&state=...` ile backend'e döner
5. Backend: kodu access token ile değiştirir, Google'dan kullanıcı bilgilerini alır
6. İlk giriş ise: Qdrant collection oluşturulur → SQLite'a kullanıcı kaydedilir (sıra önemli!)
7. JWT üretilir (`{sub: user_id, exp: şimdiden+24 saat}`, HS256 imzalı)
8. `RedirectResponse` ile frontend `/auth/callback?access_token=...&email=...&name=...&picture=...`'e yönlendirir
9. Frontend parametreleri `localStorage`'a yazar, `/account`'a yönlendirir

**Önemli tasarım kararı:** Qdrant collection oluşturma, SQLite kaydından önce yapılır. Qdrant başarısız olursa eksik kullanıcı DB'de kalmaz.

### CSRF Koruması — `InMemoryOAuthStateStore`

OAuth state saldırılarına karşı:
- Her OAuth başlangıcında rastgele `state` değeri üretilir
- `state → payload` eşleşmesi `InMemoryOAuthStateStore`'da 600 saniye TTL ile saklanır
- Callback'te `tuket(state)` atomik olarak state'i alır ve siler
- Sunucu yeniden başlatılırsa aktif state'ler silinir (gelecekte Redis ile çözülecek)

### Bulut Provider OAuth Akışı

Dropbox, pCloud ve OneDrive için ayrı OAuth akışları:
- Kullanıcı bağlan butonuna tıklar → `/auth/{provider}/login` → provider auth URL
- Kullanıcı provider sayfasında onay verir → `/auth/{provider}/callback`
- Token exchange yapılır → `token_store.kaydet(user_id, source, credentials)` ile SQLite'a yazılır
- `RedirectResponse` → `/account?connected={provider}` ile geri döner

### JWT Yapısı

```json
{
  "sub": "uuid-v4-user-id",
  "exp": 1234567890
}
```
Tüm korumalı endpoint'ler `Authorization: Bearer <token>` header'ı bekler. `jwt_dogrula()` fonksiyonu dict değil string (user_id) döner.

### Token Depolama (`token_store.py`)

SQLite `tokens` tablosunda provider credential'ları saklanır. GDrive için `google-auth` kütüphanesinin `Credentials.to_json()` formatı kullanılır. Diğer providerlar düz JSON olarak serialize edilir.

Delta sync checkpoint'leri ayrı `page_tokens` tablosunda tutulur.

### Frontend Auth Yönetimi (`useAuth.ts`)

- `user` ve `access_token` localStorage'dan okunur
- Server-side validation yapılmaz (hız için)
- 401 geldiğinde `request()` fonksiyonu localStorage'ı temizler ve anasayfaya yönlendirir
- Korumalı sayfalar `useEffect` içinde `if (!user) router.push("/")` ile korunur

---

## 5. EMBEDDING VE VEKTÖR ARAMA

### SigLIP Modeli

**Model:** `google/siglip-base-patch16-224`  
**Çıkış boyutu:** 768 boyutlu L2-normalize float vektörü  
**Çalışma ortamı:** GPU kullanılabiliyorsa CUDA, değilse CPU (uyumluluk kontrolü matmul testi ile yapılır)

SigLIP (Sigmoid Loss for Language-Image Pre-training), CLIP'in geliştirilmiş versiyonudur. Sigmoid bazlı eğitim kaybı, özellikle küçük batch boyutlarında daha iyi vision-language hizalaması sağlar. CLIP'in 512 boyutlu vektörlerine karşı SigLIP'in 768 boyutlu uzayı daha zengin anlam ayrımı yapar.

**`embedding.py` yapısı:**
```python
# Global scope'da model yüklenir (uygulama başlatılırken)
model = SiglipModel.from_pretrained("google/siglip-base-patch16-224").to(device)
processor = AutoProcessor.from_pretrained("google/siglip-base-patch16-224")

def foto_vektore_cevir(pil_image) → List[float]:
    # PIL görüntüyü 768d normalize vektöre çevirir
    
def metin_vektore_cevir(text: str) → List[float]:
    # Metni 768d normalize vektöre çevirir
    # padding="max_length": SigLIP 64 token sabit uzunluk bekler
```

Her iki fonksiyon da `F.normalize()` ile L2 normalleştirme uygular. Bu sayede cosine similarity = dot product olur.

### Qdrant Vektör Veritabanı

Her kullanıcı için ayrı bir Qdrant collection oluşturulur:
- **İsimlendirme:** `user_` + UUID (tire karakterleri kaldırılmış)
- **Vektör yapılandırması:** 768 boyut, Cosine distance
- **Point ID üretimi:** `file_id`'nin MD5 hash'inin ilk 8 byte'ı → deterministic integer. Aynı dosya her zaman aynı ID'ye eşlenir; upsert ve silme işlemleri için kritik.

**Her fotoğraf için saklanan payload:**
```json
{
  "filename": "IMG_2847.jpg",
  "file_id": "provider-özel-id",
  "drive_url": "https://...",
  "source": "gdrive | dropbox | onedrive | pcloud",
  "folder_path": "/Tatil/2024",
  "file_size": 2048000,
  "date_taken": "2024-07-15T14:30:00",
  "year": 2024, "month": 7,
  "lat": 41.0082, "lon": 28.9784,
  "camera_make": "Apple", "camera_model": "iPhone 15 Pro"
}
```
EXIF alanları opsiyonel: `None` olanlar payload'a dahil edilmez. Filtrelemede bu alanların yokluğu hata vermez.

### Arama Akışı

1. Kullanıcı arama kutusuna metin girer
2. `metin_vektore_cevir(q)` → 768d sorgu vektörü
3. `qdrant_client.query_points(collection, query_vector, limit=fetch_limit)`
4. Python tarafında isteğe bağlı filtreler uygulanır (kaynak, yıl, kamera)
5. Offset/limit ile sayfalama yapılır
6. Frontend grid'de benzerlik skoru ile gösterilir

**Dinamik fetch_limit:** EXIF filtresi aktifse 500 sonuç çekilir ve Python'da filtrelenir. Filtresizse sadece `limit+offset` kadar çekilir.

---

## 6. İNDEKSLEME VE DELTA SENKRONİZASYON

### İki Modlu Senkronizasyon

**Tam İndeksleme (`index_all`):** İlk kurulum veya zorunlu yenileme için. Tüm bağlı provider'lardaki fotoğraflar sıfırdan işlenir.

**Delta Senkronizasyon (`delta_sync`):** Sonraki çalıştırmalarda yalnızca son eşitlemeden bu yana değişen dosyalar işlenir. Her provider kendi checkpoint (page_token) mekanizmasını kullanır.

### Tam İndeksleme Adımları

1. Qdrant collection oluşturulur (yoksa)
2. Her provider için:
   a. `fotograflari_listele()` → güncel fotoğraf listesi
   b. "Hayalet temizliği": Qdrant'ta var ama provider'da artık olmayan kayıtlar silinir + albüm referansları temizlenir
   c. Her fotoğraf: `foto_indir()` → `foto_vektore_cevir()` → `fotograf_kaydet()`
   d. Hatalar kayıt altına alınır, indeksleme devam eder
3. **TÜM indeksleme bittikten sonra** page_token alınır: `baslangic_token_al()` → `T_start` → `degisiklikleri_getir(T_start)` → `T1` kaydedilir

**Neden token sonradan alınır?** İndeksleme sırasında oluşan değişiklik olayları bir sonraki delta sync tarafından tekrar işlenmemesi için. T_start anında tüm değişiklikler zaten işlenmiş olduğundan T1'den itibaren yalnızca yeni değişiklikler izlenir.

### Delta Senkronizasyon Adımları

1. Kaydedilmiş page_token olmayan provider'lar atlanır (henüz indekslenmemiş)
2. Her provider için:
   a. `degisiklikleri_getir(saved_token)` → `(eklenenler, silinenler, yeni_token)`
   b. Silinen dosyalar: `toplu_fotograf_sil()` + `album_fotograf_cikar_global()`
   c. Eklenenler: Qdrant'ta var mı? → varsa atla (cTag false-positive koruması), yoksa embed + kaydet
   d. **Reconciliation - Silme:** Provider listesi vs Qdrant karşılaştırması → delta'nın kaçırdığı silmeleri temizle
   e. **Reconciliation - Ekleme:** Provider'da olup Qdrant'ta olmayan dosyaları yeniden indeksle (indeksleme sırasında ağ hatası alan dosyalar bu adımda yakalanır)
   f. Yeni token'ı kaydet

### İndeks Sıfırlama

Kullanıcı `/account` sayfasından "İndeksi Sıfırla" butonuna basarak tüm Qdrant point'lerini silebilir. Collection korunur, page_token'lar sıfırlanır. Bu işlem sonrası yeniden tam indeksleme yapılmalıdır.

### OneDrive cTag Sorunu

OneDrive'da `/content` endpoint'i dosya içeriğini değiştirmeden cTag değerini günceller. Bu delta raporunda sahte "değişti" kaydı oluşturur. Çözüm 3 katmanlıdır:
1. Sync token indekslemeden SONRA alınır
2. T_start hemen tüketilir
3. Delta sync sırasında Qdrant'ta varlık kontrolü yapılır — zaten varsa atlanır

### Page Token Mekanizmaları (Provider'a Göre)

| Provider | Token Türü | API |
|----------|------------|-----|
| Google Drive | `startPageToken` | Changes API v3 |
| Dropbox | `cursor` | `files_list_folder_continue` |
| OneDrive | `deltaLink` URL | Microsoft Graph Delta API |
| pCloud | `diffid` integer | `/diff` endpoint |

---

## 7. BULUT SAĞLAYICI KATMANI

### Abstract Base Sınıf (`BaseProvider`)

Tüm provider'ların implement etmesi gereken 6 metot:

| Metot | Dönüş | Açıklama |
|-------|-------|----------|
| `fotograflari_listele(klasor_id, limit)` | `list[dict]` | Provider'daki tüm görüntüleri listeler |
| `foto_indir(file_id)` | `PIL.Image` | Fotoğrafı belleğe indirir |
| `degisiklikleri_getir(token)` | `(eklenen, silinen, yeni_token)` | Delta değişiklikler |
| `foto_sil(file_id)` | `bool` | Fotoğrafı cloud'dan siler |
| `baslangic_token_al()` | `str` | Delta sync başlangıç noktası |
| `foto_yukle(bytes, filename, folder)` | `dict` | Editlenmiş görseli yükler |

**Standart fotoğraf dict formatı:** Tüm provider'lar `{id, name, size, folder_path, drive_url, exif{...}}` döner. Bu sayede `sync.py` ve `embedding.py` provider'dan bağımsız çalışır.

### Google Drive (`gdrive.py`)

- **Kütüphane:** `googleapiclient` (Drive v3 API)
- **EXIF:** `imageMediaMetadata` alanından (tarih, GPS, kamera bilgileri)
- **Delta:** Changes API, `newStartPageToken` ile
- **Durum:** ✅ Tam çalışır, tüm özellikler aktif

### Dropbox (`dropbox.py`)

- **Kütüphane:** Dropbox Python SDK
- **EXIF:** Yok (Dropbox API metadata sağlamaz)
- **Yıl/kamera filtreleri çalışmaz** bu provider için
- **Token yenileme:** SDK refresh_token ile otomatik
- **Durum:** ✅ Çalışır

### OneDrive (`onedrive.py`)

- **Kütüphane:** `httpx` (senkron uyumluluk için SDK yerine)
- **EXIF:** Kısmi — `photo.takenDateTime` ve GPS koordinatları
- **Token yenileme:** Manuel — `token_refresh.py:onedrive_token_yenile()`. 401 alındığında otomatik retry
- **Durum:** ✅ Çalışır

### pCloud (`pcloud.py`)

- **API:** pCloud REST, Bearer token ile
- **AB sunucuları:** `https://eapi.pcloud.com` kullanılır
- **EXIF:** Yok
- **Durum:** ⏳ Entegrasyon tamamlandı, test edilmedi

### Thumbnail Proxy (`GET /thumbnail`)

Frontend, cloud dosyalarına doğrudan erişmek yerine backend proxy'si üzerinden görüntüleri alır. `file_id` ve `source` parametresi ile ilgili provider'dan küçük resim stream edilir. Bu yaklaşım OAuth token'larının tarayıcıya iletilmesini önler.

---

## 8. AI GÖRÜNTÜ DÜZENLEME

### Desteklenen İşlemler

| İşlem | Model | Açıklama |
|-------|-------|----------|
| Inpainting | flux-fill-pro | Seçili alanı prompt ile doldur |
| Outpainting | flux-fill-pro | Görüntüyü kenarlara genişlet (6 mod) |
| Stil Transferi | flux-kontext-pro | Promptla görüntünün stilini değiştir |
| Metin ile Düzenle | flux-kontext-max | Serbest dil talimatıyla düzenle |
| Restorasyon | flux-kontext-apps/restore-image | Çizik ve hasarı onar |
| Çözünürlük Artırma | clarity-upscaler | 2× veya 4× upscale |
| Arka Plan Kaldırma | bria/remove-background | Şeffaf PNG çıktısı |

### Backend Yapısı

**`BaseEditProvider`** abstract sınıfı: `isle()` dispatch metodu ile işlem + parametre validasyonu. Inpainting için maske, Outpainting/Stil/TextEdit için prompt zorunluluğu bu katmanda kontrol edilir.

**`ReplicateEditProvider`:** 
- `_pil_to_file()`: PIL → BytesIO. Maske L mode → PNG, diğerleri → JPEG %95
- `_output_to_pil()`: Replicate 3 farklı çıktı formatı döner → URL / raw bytes / iterator. Tüm formatlar handle edilir.
- `NamedBytesIO`: `.name` attribute'u ile Replicate SDK MIME tipini otomatik algılar

**`POST /edit` endpoint akışı:**
1. Görsel yükle: `image_b64` varsa decode (yerel yükleme), yoksa cloud'dan indir
2. Maske varsa decode + orijinal boyuta resize
3. `edit_provider.isle(...)` çalıştır (thread pool'da — senkron API için)
4. Sonucu base64 encode; RGBA → PNG, diğerleri → JPEG %92
5. Response: `{ sonuc_b64, gorsel_b64, mime_type, islem, model, boyut }`

`gorsel_b64` alanı: işlem sırasında tam çözünürlüklü orijinal görüntüyü döner. Frontend bu alanı slider'ın "öncesi" tarafında kullanır.

### Frontend Editör (`edit/page.tsx`)

**Before/After Karşılaştırma Slider'ı (`CompareCanvas`):**
- Mouse/touch drag ile % pozisyon kontrolü
- `clip-path: inset(0 X% 0 0)` ile "sonra" görüntüsü bölünür
- Yeni sonuç geldiğinde slider otomatik 0 pozisyonuna sıfırlanır
- Outpainting durumunda result görüntüsü before'dan büyük olabilir; konteyner dinamik olarak güncellenir

**Üretim Sırasında (`isGenerating`) UI:**
- Tam görüntü gösterilir (yarısı değil)
- `backdrop-filter: blur` + tarama animasyonu overlay
- Maske çizim alanı ve AI panel parametreleri gizlenir
- Geçen süre sayacı 0.1s hassasiyetle güncellenir

**Maske Çizim Modu (`MaskCanvasModal`):**
- Araçlar: Fırça, Silgi, Dikdörtgen, Daire
- Geri alma stack (max 40 adım), Ctrl+Z kısayolu
- Export: alpha channel → siyah/beyaz (boyalı = beyaz, boş = siyah)

**Görsel Seçimi (`ImagePicker`):**
- Cloud sekmesi: mevcut SigLIP araması ile fotoğraf seçimi
- Yerel sekme: drag-drop veya dosya input, base64 önizleme

---

## 9. ALBÜM SİSTEMİ

### Mimari Karar: Sanal Albümler

Fotoğraflar hiçbir zaman cloud'dan kopyalanmaz veya taşınmaz. Albümler yalnızca `(source, file_id)` referanslarını tutar. Bu yaklaşımın avantajları:
- Depolama alanı harcanmaz
- Orijinal dosya değiştirilmez
- Farklı provider'lardan fotoğraflar aynı albümde bulunabilir

### Veritabanı Şeması

```sql
albums (
  album_id TEXT PRIMARY KEY,  -- UUID v4
  owner    TEXT,              -- user_id
  name     TEXT,
  created_at TEXT
)

album_photos (
  album_id    TEXT,
  source      TEXT,           -- "gdrive" | "dropbox" | "pcloud" | "onedrive"
  file_id     TEXT,
  filename    TEXT,
  drive_url   TEXT,
  folder_path TEXT,
  file_size   INTEGER,
  added_at    TEXT,
  FOREIGN KEY(album_id) REFERENCES albums(album_id) ON DELETE CASCADE
)
```

### Albüm Yönetimi

- **Oluşturma:** Arama sayfasından "+ Albüm" butonuyla fotoğraf seçilir, albüm listesi açılır
- **Görüntüleme:** Grid görünümü veya tam ekran Lightbox (sol/sağ navigasyon, klavye kısayolları, thumbnail strip)
- **Yeniden adlandırma:** Albüm başlığında inline düzenleme
- **Fotoğraf kaldırma:** Referans silinir, cloud'daki dosya etkilenmez
- **Fotoğraf silindiğinde:** `fotograf_cikar_global(source, file_id)` tüm albümlerden referansı temizler

---

## 10. YİNELENEN FOTOĞRAF TESPİTİ

### Algoritma

1. Koleksiyondaki tüm vektörler Qdrant `scroll()` ile çekilir
2. Her vektör için `query_points()` ile yakın komşular bulunur
3. Cosine similarity eşiği (varsayılan %95) üstündeki gruplar oluşturulur
4. Ziyaret edilenler kümesi takip edilir: her fotoğraf yalnızca bir grupta görünür
5. Self (fotoğrafın kendisi) her zaman grubun ilk elemanıdır (score=1.0)

### Benzerlik Eşiği Rehberi

| Eşik | Anlam | Kullanım Senaryosu |
|------|-------|---------------------|
| ≥ 99% | Tam kopya (piksel düzeyi) | Aynı dosyanın iki kopyası |
| 95-99% | Çok benzer | Farklı boyut/sıkıştırma ile kaydedilmiş aynı fotoğraf |
| 90-95% | Benzer sahne | Aynı anda çekilen birkaç kare |
| 80-90% | Aynı konu | Aynı konuyu farklı açıdan gösterenler |

### Silme İşlemi

Kullanıcı "saklanacak" fotoğrafı seçer, geri kalanlar için ConfirmModal açılır. Onaylandıktan sonra:
1. İlgili cloud provider'dan `foto_sil()` ile cloud'dan silinir
2. Qdrant'tan `fotograf_sil()` ile vektör silinir
3. Tüm albüm referansları `fotograf_cikar_global()` ile temizlenir

Tahmini tasarruf (byte cinsinden) her grup için hesaplanır ve özet metrikte gösterilir.

---

## 11. FRONTEND MİMARİSİ

### Next.js App Router

Tüm sayfalar `src/app/` altındaki `page.tsx` dosyalarıdır. `"use client"` direktifi ile istemci bileşeni olarak işaretlenmiştir.

**Sayfa listesi:**

| Yol | Açıklama |
|-----|----------|
| `/` | Giriş sayfası; Google ile giriş |
| `/auth/callback` | OAuth callback; localStorage'a yazar, `/account`'a yönlendirir |
| `/account` | Hesap yönetimi; provider bağlama, indeksleme, senkronizasyon |
| `/search` | Doğal dil fotoğraf arama |
| `/edit` | AI görüntü editörü |
| `/albums` | Albüm listesi |
| `/albums/[id]` | Albüm detay; grid + lightbox |
| `/duplicates` | Yinelenen fotoğraf tespiti |
| `/help` | Statik yardım sayfası |

### Sidebar Navigasyon

Daraltılabilir sol sidebar (288px / 77px):
- Nav linkleri: Ara, AI Düzenle, Albümler, Yinelenenler
- Hesap menüsü (kullanıcı avatarına tıklanınca): Hesabım, Yardım al, Çıkış yap
- Durum `localStorage["sidebar-collapsed"]` ile kalıcı
- CSS değişkeni `--sidebar-w` her toggle'da güncellenir
- Tüm sayfalar `margin-left: var(--sidebar-w)` kullanır → smooth geçiş

**Hydration notu:** `collapsed` state SSR sırasında `false` olarak başlatılır, `useEffect` içinde `localStorage`'dan güncellenir.

### Tasarım Sistemi

- **Tema:** Dark theme
- **Font:** Yalnızca Epilogue (Google Fonts)
- **Accent renk:** `#7c6dfa` (mor-mavi)
- **CSS değişkenleri:** `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`
- **Animasyonlar:** `fadeIn`, `pulse-glow`, `spin-slow`, `toast-in`
- **Kaynak renk kodlaması:** GDrive (mavi), Dropbox (koyu mavi), pCloud (açık mavi), OneDrive (koyu)

### API İstemcisi (`lib/api.ts`)

Merkezi `request<T>()` fonksiyonu:
- localStorage'dan `access_token` alır, `Authorization: Bearer` header olarak ekler
- 401 → localStorage temizleme + anasayfa yönlendirmesi
- Tüm API namespace'leri bu fonksiyon üzerine inşa edilmiştir: `authApi`, `indexApi`, `syncApi`, `searchApi`, `integrationApi`, `photoApi`, `albumApi`, `editApi`

`thumbnailUrl()` fonksiyonu: JWT token'ı query parameter olarak ekler (img src uyumluluğu için).

`SOURCE_CONFIG`: Her provider için UI renk, label ve kontrast bilgisi.

---

## 12. VERİ AKIŞLARI (END-TO-END)

### İlk Kurulum Akışı

```
1. Kullanıcı Google ile giriş yapar
   → Qdrant collection oluşturulur (768d, cosine)
   → SQLite'a kullanıcı kaydedilir
   → JWT token localStorage'a yazılır

2. /account sayfasına gidilir
   → "Google Drive Bağla" / "Dropbox Bağla" / vb. tıklanır
   → Provider OAuth akışı tamamlanır
   → token_store'a credentials kaydedilir

3. "İndeksleme Başlat" tıklanır
   → Tüm provider'lardan fotoğraflar listelenir
   → Her fotoğraf indirilir → SigLIP ile 768d vektöre çevrilir → Qdrant'a yazılır
   → Indeksleme tamamlandıktan sonra page_token kaydedilir
```

### Arama Akışı

```
Kullanıcı "sahilde gün batımı" yazar
  → metin_vektore_cevir("sahilde gün batımı") → 768d vektör
  → Qdrant cosine similarity → en benzer fotoğraflar
  → Python filtresi (kaynak, yıl, kamera)
  → Sayfalama (12'şer)
  → Frontend grid'de thumbnail + metadata ile gösterim
  → Thumbnail: GET /thumbnail?file_id=X&source=Y proxy'si ile
```

### AI Düzenleme Akışı

```
Kullanıcı fotoğraf seçer (cloud araması veya yerel yükleme)
  → İşlem türü seçilir (örn. Inpainting)
  → Prompt yazılır, maske çizilir
  → "Çalıştır" tıklanır → isGenerating = true
  → POST /edit → Replicate API → model çalışır
  → base64 sonuç döner → slider sıfırlanır (pos=0)
  → Before/after karşılaştırma slider'ı aktifleşir
  → Kullanıcı indir veya buluta kaydet seçer
```

### Senkronizasyon Akışı

```
Kullanıcı "Senkronize Et" tıklar
  → Her provider için: degisiklikleri_getir(saved_token)
  → Silinen dosyalar: Qdrant'tan sil + albüm referanslarını temizle
  → Eklenen dosyalar: embed + Qdrant'a yaz
  → Reconciliation: provider'da var Qdrant'ta yok → yeniden indeksle
  → Reconciliation: Qdrant'ta var provider'da yok → sil
  → Yeni page_token'ları kaydet
```

---

## 13. API ENDPOİNT LİSTESİ (ÖZET)

### Auth
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/auth/login` | Google OAuth URL |
| GET | `/auth/callback` | Google token exchange + JWT üret |
| GET | `/auth/dropbox/login` | Dropbox OAuth URL |
| GET | `/auth/dropbox/callback` | Dropbox token exchange |
| GET | `/auth/pcloud/login` | pCloud OAuth URL |
| GET | `/auth/pcloud/callback` | pCloud token exchange |
| GET | `/auth/onedrive/login` | OneDrive OAuth URL |
| GET | `/auth/onedrive/callback` | OneDrive token exchange |

### Kullanıcı
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/users/me` | Aktif kullanıcı bilgisi |
| PATCH | `/users/me` | Profil güncelleme |
| DELETE | `/users/me` | Hesap silme (Qdrant + SQLite) |

### İndeksleme & Senkronizasyon
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/index` | Tam indeksleme |
| DELETE | `/index` | İndeksi sıfırla (points sil, collection koru) |
| POST | `/sync` | Delta senkronizasyon |

### Arama
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/search` | Vektör araması (q, limit, offset, source, year_from, year_to, camera_make) |
| GET | `/stats` | İndeks istatistikleri |
| GET | `/thumbnail` | Provider-agnostik thumbnail proxy |

### Entegrasyonlar
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/integrations` | 4 provider bağlantı durumu |
| DELETE | `/integrations/{source}` | Provider bağlantısını kes |

### Albümler
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/albums` | Albüm listesi |
| POST | `/albums` | Yeni albüm |
| GET | `/albums/{id}` | Albüm detayı + fotoğraflar |
| PATCH | `/albums/{id}` | Yeniden adlandır |
| DELETE | `/albums/{id}` | Albümü sil |
| POST | `/albums/{id}/photos` | Fotoğraf ekle |
| DELETE | `/albums/{id}/photos` | Fotoğraf referansını kaldır |

### Fotoğraflar & Yineleyenler
| Method | Path | Açıklama |
|--------|------|----------|
| DELETE | `/photos/{source}/{file_id}` | Tek fotoğraf sil (cloud + Qdrant) |
| GET | `/photos/duplicates` | Yinelenen grupları bul |
| POST | `/photos/duplicates/resolve` | Seçilen kopyaları sil |

### AI Düzenleme
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/edit` | AI görüntü düzenleme |
| POST | `/saveOnCloud` | Editlenmiş görseli cloud'a kaydet |
| GET | `/edit/providers` | Aktif edit provider listesi |

---

## 14. TEKNİK KARARLAR VE TRADE-OFF'LAR

### SigLIP Seçimi (CLIP'e Karşı)

CLIP `openai/clip-vit-base-patch32` 512 boyutlu vektör üretirken SigLIP `google/siglip-base-patch16-224` 768 boyutlu vektör üretir. SigLIP'in avantajları:
- Daha büyük anlam uzayı (768 vs 512 boyut)
- Sigmoid-bazlı eğitim kaybı (daha iyi negatif örnekleme)
- Fotoğraf-metin benzerliğinde daha tutarlı sonuçlar
- Patch boyutu 16 (CLIP'in 32'sine karşı) → daha ince görsel detay yakalama

Dezavantaj: 768d vektörler daha fazla Qdrant depolama alanı kullanır. Var olan collection'lar geçersiz olur ve yeniden indeksleme gerekir.

### Sanal Albüm Yaklaşımı

Fotoğrafları kopyalamak yerine referans tutmak:
- (+) Depolama tasarrufu
- (+) Orijinal dosya değişmez
- (+) Farklı provider'ları tek albümde birleştirme
- (-) Kaynak dosya silinirse albüm referansı kırılır (graceful handling: `fotograf_cikar_global`)

### Kullanıcı Başına Qdrant Collection

Tüm kullanıcıları tek collection'da yönetmek yerine her kullanıcıya ayrı collection:
- (+) Veri izolasyonu: kullanıcı siler → yalnızca kendi collection'ı etkilenir
- (+) Vektör indeksi performansı: küçük collection'da daha hızlı arama
- (-) Qdrant'ta çok sayıda collection (çok kullanıcılı senaryoda)

### Senkron HTTP (httpx) vs Async

FastAPI async desteklerken bazı provider'lar senkron `httpx` kullanır. AI edit işlemleri `run_in_threadpool` ile senkron kütüphane API çağrılarını async framework ile uyumlu hale getirir.

### In-Memory OAuth State Store

CSRF koruması için state `InMemoryOAuthStateStore`'da tutulur. Basitlik için Redis tercih edilmedi:
- (+) Sıfır bağımlılık
- (-) Sunucu restart'ta aktif OAuth akışları kesilir
- Çözüm: Redis (gelecek sürüm)

---

## 15. KURULUM VE ORTAM

### Ön Koşullar

- Python 3.11+
- Node.js 18+
- Qdrant Cloud hesabı (ücretsiz tier yeterli)
- Google Cloud project + OAuth 2.0 credentials
- Replicate.com API key
- İstenen cloud provider'lar için developer hesapları

### Backend Ortam Değişkenleri

```env
# Qdrant
QDRANT_URL=https://xxxx.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# JWT
JWT_SECRET_KEY=rastgele-güçlü-anahtar

# AI Düzenleme
REPLICATE_API_TOKEN=...

# Dropbox (opsiyonel)
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_REDIRECT_URI=http://localhost:8000/auth/dropbox/callback

# pCloud (opsiyonel)
PCLOUD_CLIENT_ID=...
PCLOUD_CLIENT_SECRET=...
PCLOUD_REDIRECT_URI=http://localhost:8000/auth/pcloud/callback

# OneDrive (opsiyonel)
ONEDRIVE_CLIENT_ID=...
ONEDRIVE_CLIENT_SECRET=...
ONEDRIVE_REDIRECT_URI=http://localhost:8000/auth/onedrive/callback

# HuggingFace (opsiyonel, gated model erişimi için)
HUGGINGFACE_TOKEN=...
```

### Bağımlılıklar

**Backend (Python):** `fastapi`, `uvicorn`, `python-dotenv`, `qdrant-client`, `transformers`, `torch`, `sentencepiece`, `pillow`, `httpx`, `python-multipart`, `python-jose`, `cryptography`, `huggingface_hub`, `google-auth-oauthlib`, `google-api-python-client`, `dropbox`, `replicate`

**Frontend (Node):** `next`, `react`, `typescript` + standart Next.js bağımlılıkları

### Çalıştırma

```bash
# Backend
cd backend
uvicorn main:app --reload
# İlk çalıştırmada SigLIP modeli (~350 MB) indirilir

# Frontend
cd frontend
npm run dev
```

---

## 16. BİLİNEN KISITLAR VE GELECEK ÇALIŞMALAR

| Kısıt | Etki | Olası Çözüm |
|-------|------|-------------|
| OAuth state store in-memory | Sunucu restart = aktif login akışları kesilir | Redis |
| pCloud test edilmedi | Credentials bulunamadı | Test ortamı kurulacak |
| Dropbox'ta EXIF yok | Yıl/kamera filtreleri çalışmaz | Dropbox EXIF API desteği bekleniyor |
| Tek sunucu, in-memory state | Çoklu worker/replica desteksiz | Redis (session/state için) |
| JWT expire kontrolü client'ta yok | Token expire olursa 401 sonrası yönlendirme | Token refresh endpoint |
| SigLIP CPU'da yavaş | Büyük koleksiyonlarda indeksleme süresi artar | Uyumlu PyTorch versiyonu ile GPU |
| Qdrant collection'ları model değişince geçersiz | CLIP→SigLIP geçişinde yeniden indeksleme gerekti | Versiyon yönetimi mekanizması |

---

## 17. PROJE YAPISI (DOSYA AĞACI)

```
Bitirmev2/
├── README.md
├── requirements.txt           # Kök bağımlılıklar
│
├── backend/
│   ├── main.py                # FastAPI uygulaması, tüm endpoint'ler (~850 satır)
│   ├── auth.py                # Google + 3 provider OAuth akışları
│   ├── embedding.py           # SigLIP sarmalayıcı
│   ├── sync.py                # index_all + delta_sync
│   ├── qdrant_db.py           # Qdrant CRUD, duplikat tespiti
│   ├── token_store.py         # SQLite OAuth token deposu
│   ├── user_store.py          # SQLite kullanıcı CRUD
│   ├── album_store.py         # SQLite albüm CRUD
│   ├── dependencies.py        # FastAPI dependency injection
│   ├── jwt_handler.py         # JWT üret / doğrula
│   ├── oauth_state_store.py   # In-memory CSRF state store
│   ├── token_refresh.py       # OneDrive token yenileme
│   ├── drive.py               # Eski Google Drive yardımcıları
│   ├── app.db                 # SQLite veritabanı
│   ├── test_embedding.py      # SigLIP birim testi
│   ├── providers/
│   │   ├── base.py            # BaseProvider abstract sınıf
│   │   ├── gdrive.py          # Google Drive implementasyonu
│   │   ├── dropbox.py         # Dropbox implementasyonu
│   │   ├── onedrive.py        # OneDrive implementasyonu
│   │   ├── pcloud.py          # pCloud implementasyonu
│   │   └── factory.py         # source → Provider factory
│   └── edit_providers/
│       ├── base.py            # BaseEditProvider + EditIslemi enum
│       ├── replicate.py       # Replicate.com implementasyonu
│       └── factory.py         # provider_adi → EditProvider factory
│
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx         # Kök layout + Google Fonts
        │   ├── globals.css        # Dark theme CSS değişkenleri + animasyonlar
        │   ├── page.tsx           # Giriş sayfası
        │   ├── auth/callback/
        │   │   └── page.tsx       # OAuth callback işleyicisi
        │   ├── account/
        │   │   └── page.tsx       # Hesap + entegrasyonlar + indeksleme
        │   ├── search/
        │   │   └── page.tsx       # Fotoğraf arama
        │   ├── edit/
        │   │   └── page.tsx       # AI editör (~1400 satır)
        │   ├── albums/
        │   │   ├── page.tsx       # Albüm listesi
        │   │   └── [id]/page.tsx  # Albüm detay + lightbox
        │   ├── duplicates/
        │   │   └── page.tsx       # Yinelenen tespiti
        │   └── help/
        │       └── page.tsx       # Statik yardım sayfası
        ├── components/
        │   └── common/
        │       └── Sidebar.tsx    # Ana navigasyon sidebar
        ├── hooks/
        │   └── useAuth.ts         # Auth state hook
        └── lib/
            └── api.ts             # Backend API istemcisi
```

---

## 18. TEMEL TERİMLER SÖZLÜĞÜ

| Terim | Açıklama |
|-------|----------|
| `source_key` | Provider kimliği: `"gdrive"`, `"dropbox"`, `"pcloud"`, `"onedrive"` |
| `file_id` | Provider'dan gelen benzersiz dosya ID'si |
| `page_token` | Delta sync checkpoint: her provider'ın kendi formatında |
| `point_id` | Qdrant integer ID = `file_id`'nin MD5 hash'inin ilk 8 byte'ı |
| `qdrant_collection` | `"user_"` + UUID (tire'siz) — her kullanıcı için ayrı |
| `beforeFullImage` | Edit tamamlandığında önce görüntüsünün tam çözünürlüklü hali |
| `isGenerating` | AI işlemi sürerken aktif olan state; tam görüntü + blur overlay |
| Slider sıfırlama | Yeni `resultImage` geldiğinde `pos=0` ile before konumuna döner |
| Hayalet kayıt | Qdrant'ta mevcut ama provider'da artık olmayan fotoğraf |
| Delta sync | Yalnızca son senkronizasyondan bu yana değişen dosyaları işleme |
| Reconciliation | Delta'nın kaçırdığı silme veya eklemeleri yakalamak için tam liste karşılaştırması |
| `SIDEBAR_WIDTH` | 288px (genişletilmiş sidebar) |
| `SIDEBAR_COLLAPSED_WIDTH` | 77px (daraltılmış sidebar) |
| `--sidebar-w` | Dinamik CSS değişkeni; sayfa layout'ları buna göre margin ayarlar |
| `SqliteTokenStore` | OAuth credential'larını SQLite'ta saklayan sınıf |
| `InMemoryOAuthStateStore` | CSRF state → payload eşleşmesi, 600s TTL |
| L2 normalize | Vektörün uzunluğunu 1'e eşitleme; cosine similarity = dot product sağlar |
| Thumbnail proxy | Backend üzerinden cloud görseli stream etme; OAuth token'ı tarayıcıya açmaz |

---

## 19. DOKÜMANTASYON İÇİN ÖNERİLEN BÖLÜM YAPISI (50 Sayfa)

Aşağıdaki yapı, bu briefing'deki bilgilerden 50 sayfalık bir teknik rapor oluşturmak için önerilmektedir:

1. **Giriş ve Motivasyon** (3 sayfa) — Problem tanımı, mevcut çözümlerin eksiklikleri, PhotoMind'ın katkısı
2. **İlgili Çalışmalar** (4 sayfa) — CLIP, SigLIP, vektör veritabanları, çok bulutlu sistemler
3. **Sistem Gereksinimleri** (2 sayfa) — Fonksiyonel ve fonksiyonel olmayan gereksinimler
4. **Sistem Mimarisi** (5 sayfa) — Genel mimari, katman yapısı, bileşen diyagramları
5. **Kimlik Doğrulama ve Güvenlik** (3 sayfa) — Google OAuth, JWT, provider OAuth, CSRF
6. **Embedding ve Vektör Arama** (5 sayfa) — SigLIP modeli, Qdrant, arama algoritması
7. **Bulut Sağlayıcı Entegrasyonları** (5 sayfa) — 4 provider, abstraction katmanı, delta sync
8. **İndeksleme ve Senkronizasyon** (4 sayfa) — Tam indeksleme, delta sync, reconciliation
9. **AI Görüntü Düzenleme** (5 sayfa) — 7 işlem, Replicate modelleri, before/after slider
10. **Albüm ve Organizasyon Sistemi** (3 sayfa) — Sanal albümler, SQLite şeması
11. **Yinelenen Fotoğraf Tespiti** (3 sayfa) — Cosine similarity, eşik analizi, silme akışı
12. **Frontend Mimarisi** (4 sayfa) — Next.js App Router, Sidebar, tasarım sistemi, API istemcisi
13. **Performans ve Teknik Değerlendirme** (2 sayfa) — Hız, doğruluk, kısıtlar
14. **Sonuç ve Gelecek Çalışmalar** (2 sayfa) — Özet, iyileştirme önerileri

**Toplam: ~50 sayfa**
