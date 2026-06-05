from PIL import Image
import math
import numpy as np
from embedding import foto_vektore_cevir, metin_vektore_cevir

vec = metin_vektore_cevir("sunset at the beach")
assert len(vec) == 768, f"Beklenen 768, gelen {len(vec)}"
print(f"✅ Metin embedding: {len(vec)}d")

img = Image.new("RGB", (224, 224), color=(100, 150, 200))
vec = foto_vektore_cevir(img)
assert len(vec) == 768, f"Beklenen 768, gelen {len(vec)}"
print(f"✅ Görsel embedding: {len(vec)}d")

norm = math.sqrt(sum(x**2 for x in vec))
assert abs(norm - 1.0) < 0.001, f"Normalize değil! Norm={norm}"
print(f"✅ L2 normalize: {norm:.6f}")

text_vec = metin_vektore_cevir("a cat sleeping")
sim = np.dot(text_vec, vec)
print(f"ℹ️  Cosine similarity (rastgele görsel): {sim:.4f}")
print("✅ Tüm testler geçti")
