# 05 — AI Görüntü Düzenleme

## Genel Bakış
Yedi farklı AI işlemi Replicate.com API'si üzerinden gerçekleştirilir. Backend provider abstraction katmanı sayesinde gelecekte farklı AI sağlayıcıları eklenebilir. Frontend tek-dosya bir editör sayfasıdır (`edit/page.tsx`).

---

## Backend

### `backend/edit_providers/base.py`

**`EditIslemi` enum:**
| Değer | Açıklama |
|-------|----------|
| `inpainting` | Maskeli alanı prompt ile doldur |
| `outpainting` | Görüntüyü genişlet (zoom/yön modları) |
| `background_remove` | Arka planı kaldır, şeffaf PNG |
| `restore` | Çizik, hasar, solmayı onar |
| `upscale` | 2× veya 4× çözünürlük artırma |
| `style_transfer` | Prompt ile stil dönüşümü |
| `text_edit` | Doğal dil talimatıyla serbest düzenleme |

**`EditSonucu` dataclass:** `gorsel (PIL.Image)`, `model (str)`, `maliyet`, `metadata`

**`EditHatasi` exception:** `islem`, `provider`, `message` içerir. `main.py` sadece `e.message`'ı kullanıcıya döner.

**`BaseEditProvider.isle()` dispatch metodu:** İşlem + parametre validasyonu yapar, ilgili abstract metoda yönlendirir.

Validasyonlar:
- Inpainting: maske zorunlu
- Inpainting / Outpainting / Stil Transfer / Text Edit: prompt zorunlu

---

### `backend/edit_providers/replicate.py`

**Kullanılan modeller:**

| Anahtar | Replicate Model | Kullanım |
|---------|-----------------|---------|
| `flux_fill_pro` | `black-forest-labs/flux-fill-pro` | Inpainting + Outpainting |
| `flux_kontext_pro` | `black-forest-labs/flux-kontext-pro` | Stil Transferi |
| `flux_kontext_max` | `black-forest-labs/flux-kontext-max` | Metin ile Düzenle |
| `restore_image` | `flux-kontext-apps/restore-image` | Restorasyon |
| `clarity_pro` | `philz1337x/clarity-pro-upscaler` | Çözünürlük Artırma |
| `remove_background` | `bria/remove-background` | Arka Plan Kaldırma |

**`NamedBytesIO`:** BytesIO alt sınıfı; `.name` attribute'u ile Replicate SDK MIME tipini algılar.

**`_pil_to_file(image, mode)`:** PIL → BytesIO dönüşümü. `L` (mask) → PNG, diğerleri → JPEG %95 kalite.

**`_output_to_pil(output, mode)`:** Replicate çıktısı 3 farklı formatta gelebilir:
- URL string → `httpx.get()` ile indir
- Raw bytes → `BytesIO`'ya aç
- Chunks iterator (`restore-image` gibi) → `b"".join(chunks)`

**İşlem detayları:**

| Metot | Özel Notlar |
|-------|-------------|
| `inpaint()` | `image` + `mask` (L mode PNG) + prompt + strength |
| `outpaint()` | `outpaint` parametresi enum: "Zoom out 1.5x", "Zoom out 2x", "Make square", "Left/Right/Top/Bottom outpaint"; `guidance=3.0`, `safety_tolerance=2` hardcode |
| `background_remove()` | Çıkış RGBA → PNG olarak döner |
| `restore()` | `input_image` + prompt (açıklama metni) |
| `upscale()` | Scale 2 veya 4; `scale_factor`, `creativity=0.35`, `resemblance=0.6` |
| `stil_transfer()` | `input_image` + prompt |
| `text_edit()` | `input_image` + prompt |

---

### `backend/edit_providers/factory.py`
```python
def edit_provider_getir(provider_adi: str) → BaseEditProvider
```
Şu an yalnızca `"replicate"` aktif. FAL provider yoruma alınmış (gelecek için).

`desteklenen_providerlar()` → aktif provider listesi ve desteklediği işlemler.

---

### `backend/main.py` — Edit Endpoint'leri

**`POST /edit`**

Body (`EditIstek`):
```
source, file_id, image_b64 (opsiyonel yerel yükleme)
edit_provider (default: "replicate")
islem (EditIslemi enum)
prompt, maske_b64, guc (0-1)
outpaint_modu, adimlar (1-50)
olcek (2 veya 4), aciklama
```

Akış:
1. Görsel yükle: `image_b64` varsa decode, yoksa cloud'dan indir
2. Maske varsa decode et + orijinal boyuta resize
3. `edit_provider.isle(...)` çalıştır (thread pool'da)
4. Sonucu base64'e çevir; RGBA → PNG, diğerleri → JPEG %92
5. Döner: `{ sonuc_b64, gorsel_b64, mime_type, islem, model, boyut, ... }`

**`POST /saveOnCloud`**
Editlenmiş görseli belirtilen cloud'a yükler (`foto_yukle()`).

**`GET /edit/providers`**
Aktif edit provider listesini döner.

---

## Frontend — `frontend/src/app/edit/page.tsx`

Tek büyük dosya (~1400+ satır). Tüm bileşenler bu dosyada tanımlı.

### Bileşenler

**`CompareCanvas`**
Before/after karşılaştırma görüntüleyicisi.
- `boxW/boxH`: before görüntüsünün ekran boyutu (handleBeforeLoad ile hesaplanır)
- `resultDims`: result görüntüsünün ekran boyutu (handleResultLoad ile; outpainting'de daha büyük olabilir)
- `dispW/dispH`: konteyner boyutu — result büyükse genişler, küçükse before boyutunu korur
- Karşılaştırma slider'ı: mouse/touch drag ile % pozisyon; clip-path ile before/after bölünmesi
- Before image: result daha büyükse `objectFit: contain` (orijinal boyutta ortalanmış, kenarlar siyah)
- **`beforeFullImage` state:** Edit tamamlandığında `gorsel_b64` response alanı before görseli tam çözünürlüklü olarak günceller. İlk yüklemede cloud thumbnail kullanılır; sonuç geldikten sonra full resolution before görüntüsü gösterilir.
- **Slider sıfırlama:** Yeni `resultImage` set edildiğinde `useEffect` tetiklenir ve `setPos(0)` çağrılır. Slider her yeni sonuçta soldan (0%) başlar.
- **`isGenerating` durumu:** Tam görsel gösterilir (önceki sonuç veya orijinal), üstüne `backdrop-filter: blur` + tarama animasyonu overlay eklenir. Maske çizim alanı ve diğer UI elemanları gizlenir. Progress overlay: generate sırasında blur + tarama animasyonu.

**`MaskCanvasModal`** (Inpainting için)
- Canvas araçları: Fırça, Silgi, Dikdörtgen, Daire
- Fırça boyutu: sayısal giriş, varsayılan 15
- Geri alma stack (en fazla 40 adım) — Ctrl+Z kısayolu
- Temizle butonu
- Export: alpha channel → siyah/beyaz (boyalı piksel = beyaz, boş = siyah)
- Görsel boyutuna göre canvas ölçeklenir

**`ImagePicker` Modal**
- Cloud sekmesi: arama kutusu + 4×4 grid (searchApi.search())
- Yerel sekme: drag-drop + dosya input, base64 preview
- Seçim: `PickedImage { source, file_id, previewUrl, b64 }`

**`AIEditPanel`** (sağ sidebar, **460px**)
- İşlem seçici dropdown (7 işlem, renk kodlamalı)
- Dinamik parametre alanları:
  - Prompt textarea (500 karakter limiti) — inpainting, outpainting, stil transfer, text edit
  - Güç slider (0-1) — inpainting
  - Outpaint modu select — outpainting
  - Adımlar slider (1-50) — outpainting
  - Ölçek butonları (2×/4×) — upscale
  - Açıklama textarea — restore
  - Tuvale aç butonu + küçük maske önizlemesi — inpainting
- Generate butonu + Cmd+Enter kısayolu
- Üretim zamanlayıcısı (0.1s güncelleme)
- Model adı başlık bilgisi

**Parametre bileşenleri:**
- `ParamSlider` — min/max/step değerleri ile range input + sayısal gösterim
- `ParamSeg` — segmented button group (ölçek, vb.)
- `ParamSelect` — styled native `<select>` (outpaint modu)

**Hata Toast:**
- Canvas alanının altında ortalanmış, slide-in animasyonu
- Uyarı ikonu + pembe metin, koyu kırmızı arka plan

### `EditParams` State
```typescript
{ prompt, description, strength, steps, scale, outpaint_mode }
```

### Generate Akışı
1. `handleGenerate()` tetiklenir
2. `isGenerating = true` → tam görsel gösterilir + blur overlay aktifleşir
3. `resultImage` sıfırlanır → `resultDims` sıfırlanır
4. `editApi.edit(NewEditRequest)` → `POST /edit`
5. Yanıt: `{ sonuc_b64, gorsel_b64, ... }`
   - `sonuc_b64` → `resultImage` (sonuç görüntüsü, `data:mime;base64,...`)
   - `gorsel_b64` → `beforeFullImage` (tam çözünürlüklü orijinal)
6. `useEffect([resultImage])` → `setPos(0)` — slider sıfırlanır
7. `handleResultLoad` ile result boyutu hesaplanır, konteyner güncellenir
8. `isGenerating = false` → overlay kalkar, slider aktifleşir

---

## Operasyon Durumları

| Operasyon | Model | Durum |
|-----------|-------|-------|
| Arka Plan Kaldır | bria/remove-background | ✅ |
| Restorasyon | flux-kontext-apps/restore-image | ✅ |
| Çözünürlük Artır | philz1337x/clarity-pro-upscaler | ✅ |
| Metin ile Düzenle | flux-kontext-max | ✅ |
| Stil Transferi | flux-kontext-pro | ✅ |
| Outpainting | flux-fill-pro | ✅ |
| Inpainting | flux-fill-pro | ✅ |
