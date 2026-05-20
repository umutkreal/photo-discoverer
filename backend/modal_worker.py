"""
modal_worker.py — PhotoMind AI Düzenleme Servisi

Kurulum:
  pip install modal
  modal setup          # GitHub/Google ile giriş yap
  modal deploy modal_worker.py

Test:
  modal run modal_worker.py::foto_duzenle \
    --image_b64 "..." --prompt "arkaplanı sil"
"""

import os

import modal

# ---------------------------------------------------------------------------
# Image: CUDA + gerekli kütüphaneler
# Model ilk deploy'da HuggingFace'ten indirilir, sonra Modal cache'ler.
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        
        "torch==2.4",
        "torchvision",
        "transformers>=4.40.0",
        "accelerate>=0.28.0",
        "safetensors>=0.4.0",
        "Pillow>=10.0.0",
        "sentencepiece",
        "git+https://github.com/huggingface/diffusers",
    )
    
)

# Modal volume — model burada cache'lenir, her cold start'ta tekrar indirilmez
volume = modal.Volume.from_name("qwen-image-edit-cache", create_if_missing=True)
MODEL_DIR = "/cache/qwen-image-edit-2511"
MODEL_ID  = "Qwen/Qwen-Image-Edit-2511"

app = modal.App("photomind-image-edit", image=image)


# ---------------------------------------------------------------------------
# Model indirme fonksiyonu — sadece bir kez çalıştır:
#   modal run modal_worker.py::model_indir
# ---------------------------------------------------------------------------
@app.function(
    volumes={"/cache": volume},
    timeout=60 * 30,  # 30 dakika (model ~15 GB)
    memory=32768,
)
def model_indir():
    import os
    from diffusers import QwenImageEditPlusPipeline
    import torch

    if os.path.exists(MODEL_DIR):
        print(f"Model zaten mevcut: {MODEL_DIR}")
        return

    print(f"Model indiriliyor: {MODEL_ID} → {MODEL_DIR}")
    pipeline = QwenImageEditPlusPipeline.from_pretrained(
        MODEL_ID, torch_dtype=torch.bfloat16
    )
    pipeline.save_pretrained(MODEL_DIR)
    volume.commit()
    print("Model kaydedildi.")


@app.function(secrets=[modal.Secret.from_name("huggingface")])
def  secret_function():
    import os
    os.getenv("HUGGINGFACE_TOKEN")
   

# ---------------------------------------------------------------------------
# Ana düzenleme fonksiyonu
# ---------------------------------------------------------------------------
@app.function(
    gpu="A10G",                    # 24GB VRAM — Qwen için yeterli
    volumes={"/cache": volume},
    timeout=300,                   # 5 dakika maksimum
    memory=16384,
    scaledown_window=60,     # 60s boşta kalırsa kapat (maliyet tasarrufu)
)
def foto_duzenle(
    image_b64: str,
    prompt: str,
    image2_b64: str | None = None,
    num_inference_steps: int = 40,
    guidance_scale: float = 1.0,
    true_cfg_scale: float = 4.0,
    seed: int = -1,
) -> dict:
    """
    image_b64: düzenlenecek fotoğraf (base64, "data:image/..." prefix opsiyonel)
    prompt: düzenleme talimatı ("arkaplanı beyaza çevir", "gökyüzünü sil" vs.)
    image2_b64: opsiyonel — referans fotoğraf (çok görsel düzenleme için)
    """
    import base64, os, torch
    from io import BytesIO
    from PIL import Image
    from diffusers import QwenImageEditPlusPipeline

    # --- Model yükle (volume'dan) ---
    model_path = MODEL_DIR if os.path.exists(MODEL_DIR) else MODEL_ID
    print(f"Model yükleniyor: {model_path}")

    pipeline = QwenImageEditPlusPipeline.from_pretrained(
        model_path, torch_dtype=torch.bfloat16
    )
    pipeline.to("cuda")
    print("Model hazır.")

    # --- base64 → PIL ---
    def b64_to_pil(b64: str) -> Image.Image:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        return Image.open(BytesIO(base64.b64decode(b64))).convert("RGB")

    images = [b64_to_pil(image_b64)]
    if image2_b64:
        images.append(b64_to_pil(image2_b64))

    generator = torch.manual_seed(seed) if seed != -1 else None

    # --- Inference ---
    with torch.inference_mode():
        output = pipeline(
            image=images,
            prompt=prompt,
            negative_prompt=" ",
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            true_cfg_scale=true_cfg_scale,
            num_images_per_prompt=1,
            generator=generator,
        )

    result = output.images[0]

    # --- PIL → base64 ---
    buf = BytesIO()
    result.save(buf, format="JPEG", quality=92)
    result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "image": result_b64,   # "data:image/jpeg;base64,..." olmadan
        "width": result.width,
        "height": result.height,
    }