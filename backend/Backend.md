# Photo Discovery — Backend Geliştirme Dokümantasyonu

> **Proje:** AI Tabanlı Akıllı Fotoğraf Arama Asistanı  
> **Geliştirici:** Umut Kuzyaka  
> **Backend Durumu:** ✅ Tamamlandı ve test edildi  
> **Frontend Durumu:** 🔜 Planlandı (Next.js)

---

## İçindekiler

1. [Proje Hakkında](#1-proje-hakkında)
2. [Mimari Genel Bakış](#2-mimari-genel-bakış)
3. [Dosya Yapısı ve Sorumluluklar](#3-dosya-yapısı-ve-sorumluluklar)
4. [Faz 1 — Kimlik Doğrulama ve Token Yönetimi](#4-faz-1--kimlik-doğrulama-ve-token-yönetimi)
5. [Faz 2 — Fotoğraf İndexleme Sistemi](#5-faz-2--fotoğraf-i̇ndexleme-sistemi)
6. [Faz 3 — Doğal Dilde Fotoğraf Arama](#6-faz-3--doğal-dilde-fotoğraf-arama)
7. [Faz 4 — Delta Senkronizasyon](#7-faz-4--delta-senkronizasyon)
8. [API Endpoint Referansı](#8-api-endpoint-referansı)
9. [Test Sonuçları](#9-test-sonuçları)
10. [Öğrenilen Dersler ve Çözülen Sorunlar](#10-öğrenilen-dersler-ve-çözülen-sorunlar)
11. [Sonraki Adımlar](#11-sonraki-adımlar)

---

## 1. Proje Hakkında

Photo Discovery, kullanıcıların Google Drive'daki fotoğraf arşivlerini yapay zeka ile aranabilir hale getiren bir uygulamadır.

**Temel fikir:** Kullanıcı doğal dilde bir metin yazar (örneğin "denizde gün batımı" veya "doğum günü pastası"), sistem bu metni anlayarak en alakalı fotoğrafları bulur ve sıralar.

**Nasıl çalışır:**

- Fotoğraflar Google Drive'dan çekilir, RAM'e indirilir (diske asla kaydedilmez)
- Her fotoğraf CLIP modeli ile 512 boyutlu bir vektöre (sayı dizisi) dönüştürülür
- Bu vektörler Qdrant vektor veritabanında saklanır
- Arama yapılırken metin de aynı CLIP modeli ile 512 boyutlu vektöre dönüştürülür
- Qdrant'ta cosine similarity ile en yakın vektörler bulunur — bu da en alakalı fotoğrafları döndürür

**Neden CLIP?** CLIP (Contrastive Language-Image Pretraining), OpenAI tarafından geliştirilen bir modeldir. İki ayrı encoder'a sahiptir: biri görselleri, diğeri metinleri aynı 512 boyutlu vektör uzayına yerleştirir. "Sunset" kelimesi ile gün batımı fotoğrafı bu uzayda birbirine yakın konumlanır — bu sayede metin ile görsel arasında benzerlik ölçülebilir.

---

## 2. Mimari Genel Bakış

```
┌──────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│                  (localhost:3000)                     │
│                                                      │
│  ┌─────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ Navbar  │   │  Search Box  │   │  Settings    │  │
│  │ 3 tabs  │   │  + Grid      │   │  Page        │  │
│  └─────────┘   └──────────────┘   └──────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP + JWT
                       ▼
┌──────────────────────────────────────────────────────┐
│                  FastAPI Backend                     │
│                 (localhost:8000)                      │
│                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Auth     │  │ /index    │  │ /search          │  │
│  │ OAuth+JWT│  │ Pipeline  │  │ Text→CLIP→Qdrant │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
└───────┬──────────────┬──────────────┬────────────────┘
        │              │              │
        ▼              ▼              ▼
  Google OAuth    CLIP Model      Qdrant Cloud
  Google Drive    (512-dim)       (Vector DB)
  (User photos)   (Embedding)     (Search)
```

### Veri Akışı — Arama Sorgu Yaşam Döngüsü

```
Kullanıcı yazar: "denizde gün batımı"
       │
       ▼
Frontend gönderir: GET /search?q=denizde+gün+batımı&limit=10&offset=0
       │
       ▼
Backend: JWT doğrulama → kullanıcı email'ini çıkar
       │
       ▼
CLIP text encoder: "denizde gün batımı" → [0.023, -0.118, ..., 0.045] (512 float)
       │
       ▼
Qdrant: cosine similarity araması → collection "photos_{email_hash}"
       │
       ▼
En alakalı 10 sonuç relevance score'a göre sıralanır
       │
       ▼
Frontend: 10 fotoğraf kartı grid'de gösterilir + "Daha fazla getir" butonu
       │
       ▼
Kullanıcı "Daha fazla getir" tıklar → GET /search?q=...&limit=10&offset=10
       │
       ▼
Sonraki 10 sonuç mevcut kartların altına eklenir (append, replace değil)
```

---

## 3. Dosya Yapısı ve Sorumluluklar

```
backend/
├── main.py            # FastAPI uygulaması, tüm endpoint tanımları
├── auth.py            # Google OAuth 2.0 akışı (login, callback)
├── jwt_handler.py     # JWT token üretme ve doğrulama
├── token_store.py     # Google credentials bellekte saklama (Redis-ready)
├── dependencies.py    # FastAPI Depends() middleware, auth kontrolü
├── drive.py           # Google Drive API işlemleri (listeleme, indirme)
├── embedding.py       # CLIP modeli (fotoğraf ve metin → 512d vektör)
├── qdrant_db.py       # Qdrant bağlantısı, vektör kaydetme/silme
├── sync.py            # Delta senkronizasyon, tam indexleme mantığı
├── sync_store.py      # Page token saklama (Changes API için)
├── .env               # Ortam değişkenleri (gizli, Git'e gitmez)
└── credentials.json   # Google OAuth client bilgileri (gizli, Git'e gitmez)
```

### Her Dosyanın Detaylı Açıklaması

**`main.py`** — Uygulamanın giriş noktası. FastAPI instance'ını oluşturur, CORS middleware ekler ve tüm endpoint'leri tanımlar. Endpoint'ler: `/auth/login`, `/auth/callback`, `/auth/me`, `/index`, `/sync`, `/search`. Her korumalı endpoint `Depends()` ile auth kontrolü yapar.

**`auth.py`** — Google OAuth 2.0 akışını yönetir. `oauth_flow_init()` login URL'si üretir, `oauth_flow_fetch_token()` callback'ten gelen kodu token'a çevirir, `get_user_info()` kullanıcı bilgilerini Google'dan çeker. `OAUTHLIB_INSECURE_TRANSPORT=1` ile localhost HTTP'ye izin verir.

**`jwt_handler.py`** — İki fonksiyon: `jwt_olustur()` kullanıcı bilgilerinden 24 saat süreli JWT üretir, `jwt_dogrula()` gelen token'ı doğrulayıp payload döner. `python-jose` kütüphanesi kullanır, HS256 algoritması ile imzalar.

**`token_store.py`** — Google OAuth credentials'ı bellekte (Python dict) saklar. 3 fonksiyon: `kaydet()`, `getir()`, `sil()`. Aynı arayüz korunarak Redis'e geçiş tek dosya değişikliği ile mümkün. ⚠️ Sunucu restart olursa veriler kaybolur.

**`dependencies.py`** — FastAPI dependency injection middleware'i. `aktif_kullanici()` JWT'den kullanıcıyı çıkarır (401 döner token geçersizse). `kullanici_credentials()` hem JWT hem Google credentials kontrolü yapar — `/index` ve `/search` gibi Drive erişimi gerektiren endpoint'lerde kullanılır.

**`drive.py`** — Google Drive API v3 wrapper'ı. `drive_servisi_olustur()` credentials ile servis oluşturur, `fotograflari_listele()` fotoğrafları listeler (opsiyonel folder_id ve limit ile), `foto_indir()` fotoğrafı RAM'e indirir (diske kaydetmez, PIL Image olarak döner).

**`embedding.py`** — CLIP modeli (openai/clip-vit-base-patch32) wrapper'ı. Uygulama başladığında model RAM'e yüklenir (~500MB, 3-5 saniye). İki fonksiyon: `foto_vektore_cevir()` fotoğrafı 512d vektöre çevirir (indexleme için), `metin_vektore_cevir()` metni 512d vektöre çevirir (arama için). Her iki vektör aynı uzayda olduğu için cosine similarity ile karşılaştırılabilir.

**`qdrant_db.py`** — Qdrant vektor veritabanı wrapper'ı. `collection_olustur()` kullanıcıya özel collection açar, `fotograf_kaydet()` vektörü metadata ile kaydeder (deterministik ID sistemi — MD5 hash), `fotograf_sil()` ve `toplu_fotograf_sil()` sync sırasında silme işlemi yapar.

**`sync.py`** — İki ana fonksiyon: `tam_indexle()` tüm Drive'ı sıfırdan indexler (ilk kullanım veya yeniden indexleme), `delta_sync()` Google Drive Changes API ile sadece değişenleri işler. `baslangic_token_al()` Changes API'nin page token'ını alır, `degisiklikleri_getir()` son token'dan bu yana olan ekleme/silmeleri listeler.

**`sync_store.py`** — Google Drive Changes API page token'larını bellekte saklar. `token_store.py` ile aynı mantık — dict tabanlı, Redis-ready.

---

## 4. Faz 1 — Kimlik Doğrulama ve Token Yönetimi

### Amaç

Kullanıcıyı Google hesabı ile login ettirmek, her istekte kim olduğunu tanımak ve Google Drive'a erişim için credentials'ı güvenli saklamak.

### Hibrit Token Mimarisi

Projede iki tür token birlikte kullanılır:

**JWT (JSON Web Token):** Kullanıcıyı tanımlamak için. İçinde `email`, `name`, `picture` ve `exp` (son kullanma tarihi) bilgileri var. Frontend bu token'ı her istekte `Authorization: Bearer <token>` header'ında gönderir. Backend sadece imzayı doğrular — veritabanına bakmaz (stateless). 24 saat geçerli.

**Google Credentials:** Drive API'ye erişim için. `access_token` ve `refresh_token` içerir. Bunlar hassas veriler olduğu için JWT içine konulmaz — sunucu tarafında `token_store.py`'de bellekte saklanır. ⚠️ Sunucu restart olursa kaybolur, kullanıcı tekrar login olmalıdır.

### OAuth 2.0 Akışı — Adım Adım

```
1. Kullanıcı "Login" tıklar
       │
       ▼
2. GET /auth/login → Backend, Flow nesnesi oluşturur
   - credentials.json'dan client_id ve client_secret okunur
   - authorization_url() üretilir (+ PKCE code_verifier oluşturulur)
   - auth_url frontend'e döner
       │
       ▼
3. Kullanıcı Google'ın login sayfasına yönlendirilir
   - Hesap seçer, "İzin Ver" tıklar
       │
       ▼
4. Google, kullanıcıyı callback URL'sine yönlendirir
   - http://localhost:8000/auth/callback?code=ABC123&scope=...&state=...
       │
       ▼
5. GET /auth/callback → Backend tam URL'yi alır
   - fetch_token(authorization_response=TAM_URL) çağrılır
   - Google, code'u access_token + refresh_token'a çevirir
   - PKCE code_verifier doğrulanır
       │
       ▼
6. Backend:
   - Google credentials'ı token_store'a kaydeder (email key ile)
   - Kullanıcı bilgilerinden JWT üretir
   - JWT'yi frontend'e döner
       │
       ▼
7. Frontend: JWT'yi saklar, sonraki isteklerde header'da gönderir
```

### Önemli Notlar

- `OAUTHLIB_INSECURE_TRANSPORT=1` ortam değişkeni localhost'ta HTTP kullanmak için zorunlu. Yoksa oauthlib "InsecureTransportError" fırlatır.
- Google, OAuth yanıtına otomatik olarak `openid` scope'unu ekler. SCOPES listesinde `openid` yoksa oauthlib "Scope has changed" hatası verir. Çözüm: SCOPES'a `"openid"` eklemek.
- `fetch_token(code=code)` yerine `fetch_token(authorization_response=TAM_URL)` kullanılmalı. Tam URL, PKCE parametreleri dahil tüm bilgileri içerir ve daha güvenilir çalışır.
- `_flow` nesnesi global değişkende tutuluyor. Birden fazla kullanıcı aynı anda login olursa üzerine yazılabilir. Production'da session veya Redis'te saklanmalı.

### Test

```bash
# 1. Login URL al
curl http://localhost:8000/auth/login
# Dönen auth_url'e tarayıcıda git, Google login ol

# 2. Callback sonrası dönen JSON:
# {
#   "user": {"email": "umut@gmail.com", "name": "Umut Kuzyaka", "picture": "..."},
#   "access_token": "eyJhbGciOiJI...",
#   "token_type": "bearer"
# }

# 3. JWT'yi test et
curl -H "Authorization: Bearer eyJhbGciOiJI..." http://localhost:8000/auth/me
# Beklenen: {"logged_in_user": {"email": "umut@gmail.com", "name": "Umut Kuzyaka", ...}}
```

### Test Sonucu: ✅ Başarılı

`/auth/me` endpoint'i kullanıcı bilgilerini doğru şekilde döndürdü. JWT doğrulama çalışıyor.

---

## 5. Faz 2 — Fotoğraf İndexleme Sistemi

### Amaç

Kullanıcının Google Drive'daki fotoğraflarını CLIP modeli ile vektöre dönüştürüp Qdrant vektor veritabanına kaydetmek.

### İndexleme Pipeline'ı

```
POST /index (JWT gerekli)
       │
       ▼
JWT'den email al → token_store'dan Google credentials al
       │
       ▼
Drive servisi oluştur → fotoğrafları listele
       │
       ▼
Her fotoğraf için:
  ┌─────────────────────────────────────────────┐
  │ 1. Drive'dan RAM'e indir (diske kaydetme!)  │
  │ 2. CLIP vision encoder → 512d vektör        │
  │ 3. Qdrant'a kaydet (deterministik ID ile)   │
  └─────────────────────────────────────────────┘
       │
       ▼
Page token kaydet (sonraki sync için)
       │
       ▼
{"indexed": 5, "total_found": 5, "collection": "photos_abc123def456"}
```

### Deterministik ID Sistemi

Qdrant'ta her vektörün bir sayısal ID'si olmalı. İlk versiyonda sıralı index kullanılıyordu (0, 1, 2, 3...) ama bu sync sırasında sorun çıkarıyordu — bir fotoğraf silindiğinde "bu fotoğrafın Qdrant ID'si neydi?" sorusuna cevap verilemiyordu.

Çözüm: Google Drive file_id'den MD5 hash ile deterministik ID üretmek.

```python
def file_id_to_point_id(file_id: str) -> int:
    hash_bytes = hashlib.md5(file_id.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder="big")
```

Aynı file_id her zaman aynı sayısal ID'yi üretir. Bu sayede:
- Kaydetme anı: `"1a2B3cD4..."` → `15286811845673582084` ID ile Qdrant'a yazılır
- Silme anı: Aynı `"1a2B3cD4..."` → yine `15286811845673582084` → Qdrant'tan silinir

### Per-User Collection İzolasyonu

Her kullanıcının kendi Qdrant collection'ı vardır:

```python
def collection_adi(email: str) -> str:
    email_hash = hashlib.md5(email.encode()).hexdigest()[:12]
    return f"photos_{email_hash}"

# umut@gmail.com → photos_a1b2c3d4e5f6
# baska@gmail.com → photos_x7y8z9w0v1u2
```

Kullanıcılar arası veri sızıntısı yapısal olarak imkansız.

### Test

```bash
curl -X POST http://localhost:8000/index \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'

# Beklenen yanıt:
# {
#   "message": "Indexleme tamamlandı",
#   "indexed": 5,
#   "total_found": 5,
#   "errors": null,
#   "collection": "photos_abc123def456"
# }

# Terminal çıktısı:
#   ✅ [1/5] IMG_2847.jpg
#   ✅ [2/5] IMG_2848.jpg
#   ✅ [3/5] IMG_2849.jpg
#   ✅ [4/5] IMG_2850.jpg
#   ✅ [5/5] IMG_2851.jpg
#   📌 Page token kaydedildi: 12345...
```

### Test Sonucu: ✅ Başarılı

5 fotoğraf Drive'dan çekildi, CLIP ile vektöre dönüştürüldü ve Qdrant'a kaydedildi. Page token kaydedildi.

### Önemli Not

`{"limit": 500}` veya boş `{}` gönderilirse varsayılan limit 500 çalışır ve tüm Drive taranır. İlk testlerde `{"limit": 5}` ile başlamak önerilir.

---

## 6. Faz 3 — Doğal Dilde Fotoğraf Arama

### Amaç

Kullanıcının metin girişini CLIP text encoder ile vektöre çevirip Qdrant'ta arama yaparak en alakalı fotoğrafları döndürmek. Projenin kalbi.

### CLIP Dual Encoder — Aynı Uzayda Buluşma

```
Fotoğraf yolu:                          Metin yolu:
foto_vektore_cevir()                     metin_vektore_cevir()

  Fotoğraf                                "sunset"
     │                                        │
     ▼                                        ▼
  Vision Encoder                          Text Encoder
  (pixel → özellik)                       (kelime → özellik)
     │                                        │
     ▼                                        ▼
  Visual Projection                       Text Projection
  (özellik → 512d vektör)                 (özellik → 512d vektör)
     │                                        │
     ▼                                        ▼
  [0.02, -0.11, ...]                      [0.03, -0.09, ...]
                    ↘                   ↙
               Cosine Similarity = 0.87
                   (Çok alakalı!)
```

Her iki vektör aynı 512 boyutlu uzayda olduğu için cosine similarity ile karşılaştırılabilir. Skor 1'e yakınsa çok alakalı, 0'a yakınsa alakasız.

### metin_vektore_cevir() Fonksiyonu

```python
def metin_vektore_cevir(text: str):
    inputs = processor(text=[text], return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model.text_model(
            input_ids=inputs["input_ids"],
            attention_mask=inputs["attention_mask"]
        )
        vektor = model.text_projection(outputs.pooler_output)
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()
```

1. `processor(text=[text], ...)` — Metni token'lara ayırır ("sunset" → [49406, 7553, 49407])
2. `model.text_model(...)` — Token'ları transformer katmanlarından geçirip anlam çıkarır
3. `model.text_projection(...)` — Çıkan anlamı 512 boyutlu vektöre sıkıştırır
4. `F.normalize(...)` — Vektörü birim uzunluğa getirir (cosine similarity için gerekli)

### /search Endpoint'i

```python
@app.get("/search")
def search_photos(
    q: str,              # Arama metni (zorunlu)
    limit: int = 10,     # Sayfa başına sonuç (varsayılan 10)
    offset: int = 0,     # Kaçıncı sonuçtan başla (sayfalama için)
    user = Depends(aktif_kullanici),  # JWT kontrolü
):
```

**Sayfalama mantığı:**

- İlk arama: `offset=0, limit=10` → ilk 10 sonuç
- "Daha fazla getir": `offset=10, limit=10` → 11-20. sonuçlar
- Tekrar: `offset=20, limit=10` → 21-30. sonuçlar
- `has_more: false` dönene kadar devam eder

Sonuçlar mevcut kartların altına eklenir (append), üzerine yazılmaz (replace).

### API Yanıt Formatı

```json
{
  "results": [
    {
      "filename": "IMG_2847.jpg",
      "file_id": "1a2b3c...",
      "drive_url": "https://drive.google.com/file/d/1a2b3c.../view",
      "thumbnail_url": "https://drive.google.com/thumbnail?id=1a2b3c...&sz=w400",
      "score": 0.8734
    }
  ],
  "total_found": 42,
  "has_more": true,
  "query": "sunset"
}
```

### Test

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:8000/search?q=sunset&limit=3"

# Beklenen: results dizisi, her biri score ile sıralı
# CLIP İngilizce'de daha güçlü, basit Türkçe kelimeler de çalışabilir
```

### Test Sonucu: ✅ Başarılı

Arama sonuçları relevance score'a göre sıralı döndü. Sayfalama (offset/limit) doğru çalışıyor.

### Qdrant Versiyon Notu

Yeni Qdrant client versiyonlarında `.search()` metodu kaldırılmıştır. Yerine `.query_points()` kullanılır:

```python
# Eski (çalışmıyor):
results = client.search(collection_name=col, query_vector=vec, limit=10)

# Yeni (doğru):
results = client.query_points(collection_name=col, query=vec, limit=10).points
```

---

## 7. Faz 4 — Delta Senkronizasyon

### Amaç

İlk indexlemeden sonra tüm Drive'ı tekrar taramak yerine, sadece değişen fotoğrafları tespit edip verimli şekilde güncellemek.

### Full Index vs Delta Sync Karşılaştırması

```
İlk giriş (full index):              Sonraki giriş (delta sync):
─────────────────────────            ──────────────────────────
150 foto listele                      Changes API'ye page_token gönder
150 foto CLIP embed (~3 dk)           3 yeni, 2 silinen tespit
150 vektör Qdrant'a kaydet            3 yeniyi embed et (~2 sn)
page_token kaydet                     2 eskiyi Qdrant'tan sil
                                      Yeni page_token kaydet
─────────────────────────            ──────────────────────────
~3 dakika                             ~2 saniye
```

### Page Token — Kitap Ayracı Benzetmesi

Google Drive Changes API, bir "page_token" mekanizması sunar. Bu, bir kitaptaki ayraç gibi çalışır:

```
Pazartesi: Full index yapıldı, 150 foto işlendi
           → Google diyor: "İşte ayracın: abc123"
           → Backend bu token'ı kaydeder

Salı:      Kullanıcı 3 foto ekledi, 2 foto sildi
           → Backend habersiz

Çarşamba:  POST /sync çağrıldı
           → Backend Google'a soruyor: "abc123'ten bu yana ne değişti?"
           → Google cevaplıyor: +3 yeni, -2 silinen
           → Backend yenileri indexler, silinenleri kaldırır
           → Google yeni ayraç verir: xyz789
           → Backend yeni token'ı kaydeder

Sonraki:   xyz789'dan itibaren sorulacak
```

Page token Google'ın ürettiği opaque (içi gizli) bir string'dir. Sadece saklanır ve geri gönderilir — içeriğini bilmemize gerek yoktur.

### Sync Akışı

```
POST /sync (JWT gerekli)
       │
       ▼
Kayıtlı page_token var mı?
  ├── Hayır → "Önce POST /index çağırın" uyarısı
  └── Evet ↓
       │
       ▼
Google Drive Changes API'ye page_token gönder
       │
       ▼
Değişiklikleri kategorize et:
  ├── Yeni/güncellenmiş fotoğraflar → yeni_fotolar listesi
  └── Silinen/çöpe atılan → silinen_ids listesi
       │
       ▼
Silinenleri Qdrant'tan toplu kaldır (toplu_fotograf_sil)
       │
       ▼
Yenileri indexle (indir → CLIP → Qdrant kaydet)
       │
       ▼
Yeni page_token kaydet
       │
       ▼
{"synced": true, "added": 3, "deleted": 2}
```

### degisiklikleri_getir() — Değişiklik Tespit Mantığı

Fonksiyon her değişikliği şu kurallara göre kategorize eder:

- `removed: true` → Dosya tamamen kaldırılmış → silinen_ids'e ekle
- `file.trashed: true` → Çöp kutusuna atılmış → silinen_ids'e ekle
- `file.mimeType.startswith("image/")` → Fotoğrafsa → yeni_fotolar'a ekle
- Fotoğraf değilse (pdf, docx vs.) → atla, bizi ilgilendirmiyor

### Test

Dört farklı senaryo test edildi:

```bash
# Test 1: Değişiklik yok
curl -X POST http://localhost:8000/sync -H "Authorization: Bearer TOKEN"
# Sonuç: {"synced": true, "added": 0, "deleted": 0}

# Test 2: Drive'a 1 fotoğraf eklendi
curl -X POST http://localhost:8000/sync -H "Authorization: Bearer TOKEN"
# Sonuç: {"synced": true, "added": 1, "deleted": 0}

# Test 3: Drive'dan 1 fotoğraf silindi
curl -X POST http://localhost:8000/sync -H "Authorization: Bearer TOKEN"
# Sonuç: {"synced": true, "added": 0, "deleted": 1}

# Test 4: 1 eklendi + 1 silindi (aynı anda)
curl -X POST http://localhost:8000/sync -H "Authorization: Bearer TOKEN"
# Sonuç: {"synced": true, "added": 1, "deleted": 1}
```

### Test Sonucu: ✅ 4/4 Başarılı

Tüm senaryolar doğru çalıştı. Ekleme, silme ve ikisinin aynı anda yapılması durumlarında delta sync doğru sonuç verdi.

---

## 8. API Endpoint Referansı

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/` | Yok | Sağlık kontrolü |
| GET | `/health` | Yok | Sağlık kontrolü |
| GET | `/auth/login` | Yok | Google OAuth URL döndürür |
| GET | `/auth/callback` | Yok | OAuth callback, JWT döndürür |
| GET | `/auth/me` | Bearer JWT | Giriş yapan kullanıcı bilgisi |
| POST | `/index` | Bearer JWT | Tam indexleme tetikler |
| POST | `/sync` | Bearer JWT | Delta senkronizasyon |
| GET | `/search?q=...&limit=10&offset=0` | Bearer JWT | Doğal dilde fotoğraf arama |

### /index Request Body

```json
{
  "folder_id": "opsiyonel_klasor_id",  // Belirli klasör (opsiyonel)
  "limit": 500                          // Kaç fotoğraf indexlensin (varsayılan 500)
}
```

### /search Query Parametreleri

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| q | string | (zorunlu) | Arama metni |
| limit | int | 10 | Sayfa başına sonuç (1-50) |
| offset | int | 0 | Kaçıncı sonuçtan başla |

---

## 9. Test Sonuçları

| Faz | Test | Sonuç |
|-----|------|-------|
| **Faz 1** | `/auth/login` → Google login → callback → JWT | ✅ Başarılı |
| **Faz 1** | `/auth/me` ile JWT doğrulama | ✅ Başarılı |
| **Faz 2** | `POST /index` ile 5 fotoğraf indexleme | ✅ Başarılı |
| **Faz 2** | `POST /index` ile 500 fotoğraf indexleme | ✅ Başarılı |
| **Faz 3** | `GET /search?q=sunset` arama | ✅ Başarılı |
| **Faz 3** | Offset/limit sayfalama | ✅ Başarılı |
| **Faz 4** | Sync — değişiklik yok | ✅ added: 0, deleted: 0 |
| **Faz 4** | Sync — 1 fotoğraf eklendi | ✅ added: 1, deleted: 0 |
| **Faz 4** | Sync — 1 fotoğraf silindi | ✅ added: 0, deleted: 1 |
| **Faz 4** | Sync — 1 eklendi + 1 silindi | ✅ added: 1, deleted: 1 |

---

## 10. Öğrenilen Dersler ve Çözülen Sorunlar

### Sorun 1: OAuth Scope Uyuşmazlığı

**Hata:** `Warning: Scope has changed from "...email ...profile ...drive.readonly" to "...email ...profile openid ...drive.readonly"`

**Neden:** Google, OAuth yanıtına otomatik olarak `openid` scope'unu ekliyor. `oauthlib` bunu "beklenmeyen scope" olarak değerlendirip hata fırlatıyor.

**Çözüm:** `SCOPES` listesine `"openid"` eklemek. Bu yeni bir yetki vermek değil — Google'ın zaten yaptığı şeyi açıkça söylemek.

### Sorun 2: fetch_token Yöntemi

**Hata:** PKCE `code_verifier` eşleşmeme hatası.

**Neden:** `fetch_token(code=code)` kullanıldığında PKCE parametreleri doğru eşleşmiyor.

**Çözüm:** `fetch_token(authorization_response=TAM_URL)` kullanmak. Tam URL tüm parametreleri içerdiği için kütüphane kendi parse'ını yapıyor.

### Sorun 3: Qdrant Client Versiyon Değişikliği

**Hata:** `AttributeError: 'QdrantClient' object has no attribute 'search'`

**Neden:** Yeni Qdrant client versiyonlarında `.search()` metodu deprecate edilmiş.

**Çözüm:** `.search()` yerine `.query_points()` kullanmak, sonuçlara `.points` ile erişmek.

### Sorun 4: Localhost HTTP Hatası

**Hata:** `InsecureTransportError` — oauthlib HTTPS gerektiriyor.

**Çözüm:** `os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"` eklemek. Sadece geliştirme ortamı için.

### Sorun 5: Sunucu Restart Sonrası 401

**Neden:** `token_store` (in-memory dict) sunucu restart olduğunda sıfırlanıyor. JWT hâlâ geçerli olsa bile Google credentials bellekten silinmiş oluyor.

**Çözüm:** Her restart sonrası tekrar `/auth/login` ile login olmak. Production'da Redis'e geçildiğinde bu sorun ortadan kalkacak.

---

## 11. Sonraki Adımlar

### Frontend Geliştirmesi (Next.js)

| Öncelik | Görev | Durum |
|---------|-------|-------|
| Yüksek | Next.js proje kurulumu | 🔜 Planlandı |
| Yüksek | Navbar (Ana Ekran, Settings, Gizli Özellik) | 🔜 Planlandı |
| Yüksek | Arama kutusu + sonuç grid'i | 🔜 Planlandı |
| Yüksek | 10'lu sayfalama ("Daha fazla getir" butonu) | 🔜 Planlandı |
| Orta | Settings sayfası (profil, yeniden indexleme) | 🔜 Planlandı |
| Orta | İndexleme ilerleme göstergesi | 🔜 Planlandı |

### Backend İyileştirmeleri

| Öncelik | Görev | Durum |
|---------|-------|-------|
| Orta | Redis'e geçiş (token saklama) | 🔜 Planlandı |
| Düşük | AI tabanlı fotoğraf düzenleme (Inpainting) | 🔜 Planlandı |

---

## Tasarım İlkeleri

1. **Privacy First:** Fotoğraflar kullanıcının Drive'ından çıkmaz. Sadece sayısal vektörler (embedding) saklanır. Bu vektörler geri fotoğrafa dönüştürülemez.

2. **RAM-Only Processing:** Fotoğraflar belleğe indirilir, işlenir ve atılır. Hiçbir fotoğraf diske kaydedilmez.

3. **Kullanıcı İzolasyonu:** Her kullanıcı kendi Qdrant collection'ına sahiptir (`photos_{email_hash}`). Kullanıcılar arası veri sızıntısı yapısal olarak imkansızdır.

4. **Modüler Mimari:** Her bileşen (auth, drive, embedding, vector DB, token storage) ayrı bir modüldür. CLIP yerine başka bir model veya Qdrant yerine Pinecone geçişi tek dosya değişikliği ile mümkündür.

5. **Progressive Enhancement:** Dict-based token saklama ile başlanıp Redis'e geçiş yapılabilir. Tam indexleme ile başlanıp delta sync eklenmiştir. MVP'yi gönder, iteratif geliştir.