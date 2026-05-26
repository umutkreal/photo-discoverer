# AI Integration Status

## Replicate Provider

Tüm AI işlemleri `backend/edit_providers/replicate.py` üzerinden Replicate API'ye gönderilir.

### Görsel Gönderme Mekanizması

`_pil_to_file(image, mode)` → `NamedBytesIO` döndürür.  
Replicate SDK, `io.IOBase` nesneleri otomatik upload eder: `client.files.create(buf)` → geçici URL → modele iletilir.  
`buf.name = "image.jpg"` kritik — olmadan SDK `application/octet-stream` MIME type kullanır.

```
PIL Image → _pil_to_file() → NamedBytesIO(name="image.jpg") → Replicate Files API → URL → Model
```

---

## Operasyon Durumları

| Operasyon | Model | Durum | Not |
|-----------|-------|-------|-----|
| Arka Plan Kaldır | `bria/remove-background` | ✅ Çalışıyor | RGBA→PNG döner |
| Restorasyon | `flux-kontext-apps/restore-image` | ✅ Çalışıyor | Chunked bytes output |
| Çözünürlük Artır | `philz1337x/clarity-pro-upscaler` | ✅ Çalışıyor | |
| Inpainting | `black-forest-labs/flux-fill-pro` | ⬜ Denenmedi | Maske gerekli |
| Outpainting | `black-forest-labs/flux-fill-pro` | ⬜ Denenmedi | |
| Metin ile Düzenle | `black-forest-labs/flux-kontext-max` | ✅ Çalışıyor | |
| Stil Transferi | `black-forest-labs/flux-kontext-pro` | ✅ Çalışıyor | |

---

## Output Handling

Replicate modelleri farklı output formatları döndürür — `_output_to_pil(output, mode)` hepsini karşılar:

| Format | Örnek Model | İşlem |
|--------|-------------|-------|
| URL string | flux-fill-pro | `httpx.get(url)` |
| Raw bytes | flux-kontext-pro | `Image.open(BytesIO(bytes))` |
| Chunked bytes iterator | restore-image | `b"".join(chunks)` |

RGBA output (background_remove) → PNG olarak kaydedilir, `mime_type: image/png` döner.
