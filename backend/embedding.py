from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch
import torch.nn.functional as F

print("CLIP modeli yükleniyor...")
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
print("✅ Model hazır!")

def foto_vektore_cevir(image: Image.Image):
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model.vision_model(pixel_values=inputs["pixel_values"])
        vektor = model.visual_projection(outputs.pooler_output)
    vektor = F.normalize(vektor, dim=-1)
    return vektor.squeeze().tolist()