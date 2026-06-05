from transformers import AutoProcessor, SiglipModel
from PIL import Image
import torch
import torch.nn.functional as F
from huggingface_hub import login
from dotenv import load_dotenv
from typing import List
import os

load_dotenv()
hf_token = os.getenv("HUGGINGFACE_TOKEN")
if hf_token:
    login(token=hf_token)

MODEL_ADI = "google/siglip-base-patch16-224"

try:
    if torch.cuda.is_available():
        _t = torch.randn(4, 4, device="cuda")
        _t @ _t  # gerçek kernel testi
        device = "cuda"
    else:
        device = "cpu"
except Exception:
    device = "cpu"

print("SigLIP modeli yükleniyor...")
model = SiglipModel.from_pretrained(MODEL_ADI).to(device)
processor = AutoProcessor.from_pretrained(MODEL_ADI)
model.eval()
print("✅ Model hazır!")


def foto_vektore_cevir(pil_image: Image.Image) -> List[float]:
    inputs = processor(images=pil_image, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        vektor = model.vision_model(**inputs).pooler_output
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()


def metin_vektore_cevir(text: str) -> List[float]:
    inputs = processor(text=[text], return_tensors="pt", padding="max_length")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        vektor = model.text_model(**inputs).pooler_output
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()
