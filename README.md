# Finding Photo by Text

Google Drive'daki fotoğrafları doğal dil ile arayabileceğiniz, CLIP modeli ve Qdrant vektör veritabanı kullanan bir sistem.

##Nasıl Çalışır?

```
Google Drive → Fotoğraf İndir → CLIP ile Vektöre Çevir → Qdrant'a Kaydet → Metin ile Ara
```

---

## 📁 Proje Yapısı

```
Finding-photo-by-text/
├── .venv/               # Python sanal ortamı
├── .env                 # Gizli anahtarlar (Git'e gitmez!)
├── credentials.json     # Google OAuth kimlik bilgisi (Git'e gitmez!)
├── token.json           # Google erişim tokeni (otomatik oluşur, Git'e gitmez!)
├── main.py              # Ana döngü
├── drive.py             # Google Drive işlemleri
├── embedding.py         # CLIP model işlemleri
└── qdrant_db.py         # Qdrant veritabanı işlemleri
```

---

## Modüller

### `drive.py` — Google Drive Bağlantısı
| Fonksiyon | Açıklama |
|---|---|
| `drive_baglanti()` | OAuth ile Drive'a bağlanır, token.json yoksa tarayıcı açar |
| `foto_indir(service, file_id)` | Fotoğrafı diske kaydetmeden RAM'e indirir |
| `fotograflari_listele(service, limit, klasor_id)` | Klasör ID varsa o klasörden, yoksa tüm Drive'dan listeler |

### `embedding.py` — CLIP Model
| Fonksiyon | Açıklama |
|---|---|
| `foto_vektore_cevir(image)` | PIL Image alır, 512 boyutlu normalize vektör döndürür |

> Kullanılan model: `openai/clip-vit-base-patch32`

### `qdrant_db.py` — Vektör Veritabanı
| Fonksiyon | Açıklama |
|---|---|
| `qdrant_baglanti()` | Qdrant Cloud'a bağlanır |
| `collection_olustur(client, name, size)` | Collection yoksa oluşturur, varsa atlar |
| `fotograf_kaydet(client, collection, index, vektor, foto)` | Vektörü ve metadata'yı Qdrant'a kaydeder |

### `main.py` — Ana Döngü
Tüm modülleri bir araya getirir. Drive → İndir → Vektöre Çevir → Qdrant'a Kaydet adımlarını sırayla çalıştırır.

---

## Kurulum

### 1. Repoyu klonla
```bash
git clone https://github.com/cagritukenmez/Finding-photo-by-text.git
cd Finding-photo-by-text
```

### 2. Sanal ortam oluştur
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# Mac/Linux
source .venv/bin/activate
```

### 3. Bağımlılıkları yükle
```bash
pip install -r requirements.txt
```

### 4. .env dosyası oluştur
```env
QDRANT_URL=https://xxxx.qdrant.io
QDRANT_API_KEY=your_api_key
QDRANT_COLLECTION=photos
DRIVE_FOLDER_ID=your_folder_id   # opsiyonel, boş bırakırsan tüm Drive taranır
```

### 5. Google credentials.json dosyasını ekle
Google Cloud Console'dan indirdiğin `credentials.json` dosyasını proje klasörüne koy.
İlk çalıştırmada tarayıcı açılır, Google hesabınla giriş yap → `token.json` otomatik oluşur.

---

## ▶️ Çalıştırma

```bash
python main.py
```

---

## 🔒 Güvenlik

Aşağıdaki dosyalar **kesinlikle Git'e gitmemeli:**

```gitignore
.env
token.json
credentials.json
.venv/
```

---

## 🛠️ Kullanılan Teknolojiler

| Teknoloji | Amaç |
|---|---|
| CLIP (OpenAI) | Fotoğrafları vektöre dönüştürme |
| Qdrant | Vektör veritabanı |
| Google Drive API | Fotoğraf kaynağı |
| Python Dotenv | Gizli anahtar yönetimi |