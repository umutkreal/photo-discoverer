from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch
import torch.nn.functional as F
from huggingface_hub import login
from dotenv import load_dotenv
import os

load_dotenv()
hf_token = os.getenv("HUGGINGFACE_TOKEN")
if hf_token:
    login(token=hf_token)

print("CLIP modeli yükleniyor...")
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
print("✅ Model hazır!")


def foto_vektore_cevir(image: Image.Image):
    """Fotoğrafı 512 boyutlu vektöre çevirir (indexleme için)."""
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model.vision_model(pixel_values=inputs["pixel_values"])
        vektor = model.visual_projection(outputs.pooler_output)
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()


def metin_vektore_cevir(text: str):
    """Metni 512 boyutlu vektöre çevirir (arama için)."""
    inputs = processor(text=[text], return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = model.text_model(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"])
        vektor = model.text_projection(outputs.pooler_output)
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()