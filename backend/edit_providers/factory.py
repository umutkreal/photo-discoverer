from .base import BaseEditProvider, EditIslemi
from .replicate import ReplicateEditProvider


def edit_provider_getir(provider_adi: str) -> BaseEditProvider:
    match provider_adi.lower().strip():
        case "replicate":
            return ReplicateEditProvider()
        # case "fal":
        #     from .fal import FalEditProvider
        #     return FalEditProvider()
        case _:
            raise ValueError(f"Bilinmeyen AI düzenleme provider'ı: '{provider_adi}'")


def desteklenen_providerlar() -> list[dict]:
    providerlar = [
        {"id": "replicate", "label": "Replicate", "aktif": True},
    ]
    sonuc = []
    for p in providerlar:
        if p["aktif"]:
            try:
                instance = edit_provider_getir(p["id"])
                islemler = [i.value for i in instance.desteklenen_islemler]
            except (ImportError, EnvironmentError, Exception):
                islemler = []
        else:
            islemler = []
        sonuc.append({**p, "islemler": islemler})
    return sonuc
