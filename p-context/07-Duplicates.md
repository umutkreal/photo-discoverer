# 07 — Yinelenen Fotoğraf Tespiti

## Genel Bakış
CLIP vektörleri arasındaki cosine similarity kullanılarak benzer fotoğraflar bulunur. Kullanıcı "saklanacak" olanı seçer, geri kalanlar bulut depolamadan silinir.

---

## Backend

### `backend/qdrant_db.py` — `duplikatlari_bul()`

```python
duplikatlari_bul(client, col_name, threshold=0.95, limit=500)
```

**Algoritma:**
1. Koleksiyondaki tüm vektörleri örnekler
2. Her vektör için `query_points()` ile kendine yakın vektörleri bulur (score > threshold)
3. Grup oluşturur: aynı fotoğraflar birden fazla grupta görünmemesi için işaretleme yapar
4. Her grup: `{ photos: [DuplicatePhoto], similarity_score }` formatında döner

**`DuplicatePhoto` alanları:** `file_id, filename, source, drive_url, file_size, folder_path, score`

### `backend/main.py` — Duplicate Endpoint'leri

**`GET /photos/duplicates`**
Parametreler: `threshold` (0-1, varsayılan 0.95), `limit` (varsayılan 500)
- `duplikatlari_bul()` çağırır
- Döner: gruplar listesi, toplam sayım, tahmini tasarruf (byte)

**`POST /photos/duplicates/resolve`**
Body: `{ keep: [PhotoRef], delete: [PhotoRef] }`
- `delete` listesindeki her fotoğraf için:
  - İlgili provider'ı belirler
  - `foto_sil(file_id)` çağırır
  - `fotograf_sil()` ile Qdrant'tan kaldırır
- Döner: silinen / atlanan sayıları

**`DELETE /photos/{source}/{file_id}`**
Tek fotoğraf silme: hem cloud'dan hem Qdrant'tan kaldırır.

---

## Frontend — `frontend/src/app/duplicates/page.tsx`

### Bölümler

**Özet Metrikler** (tarama sonrası):
- Yinelenen grup sayısı
- Tasarruf edilebilir boyut
- Toplam dosya sayısı

**Tarama Kontrolleri:**
- Benzerlik eşiği slider'ı (80%-99%, varsayılan %95)
- Görsel legend: ≥99% = tam kopya (kırmızı), 95-99% = benzer kare (sarı)
- "Tara" butonu (tarama sırasında devre dışı)

**Grup Kartları (açılır):**
- Başlık: Grup numarası, benzerlik rozeti, dosya sayısı, tahmini tasarruf
- Tıklama ile grid açılır (max 4 kolon)
- Her fotoğraf:
  - Seçilebilir (tıklama = "sakla" olarak işaretle)
  - Durum göstergesi: Sakla / Sil
  - Score % overlay (tam kopya değilse)
  - Kaynak, boyut, klasör metadata'sı
- "... sil (N dosya)" butonu: keep seçilmeden etkinleşmez

**ConfirmModal:**
- Silinecek fotoğrafların listesi
- Onay / İptal butonları
- Onay → `photoApi.resolve(keep, delete)` çağrısı

### Yardımcı Fonksiyonlar

```typescript
fmtSize(bytes) → "2.4 MB" | "1.1 GB"  // byte → okunabilir format
scoreBadge(score) → { label, bg, color }  // renk kodlaması
```

**State:** `groups[], saveableBytes, scanning, threshold, error`

**API çağrıları:**
- `photoApi.duplicates(threshold, limit)` → tarama
- `photoApi.resolve(keep, delete)` → silme

---

## Akış Özeti

```
Kullanıcı eşik seçer → GET /photos/duplicates?threshold=0.95
  → duplikatlari_bul() → vektör benzerliği → gruplar
  → Frontend'de grup kartları gösterilir

Kullanıcı "saklanacak"ı seçer → Sil butonu aktif
  → ConfirmModal → Onayla
  → POST /photos/duplicates/resolve
  → Her silinecek: foto_sil() (cloud) + fotograf_sil() (Qdrant)
```

---

## Benzerlik Eşiği Rehberi

| Eşik | Anlam |
|------|-------|
| ≥ 99% | Tam kopya (piksel düzeyi) |
| 95-99% | Çok benzer (farklı boyut, sıkıştırma) |
| 90-95% | Benzer sahne / çekim |
| 80-90% | Aynı olay / konu |
