import os
from io import BytesIO
from typing import Optional

import httpx
import replicate
from PIL import Image

from .base import BaseEditProvider, EditIslemi, EditSonucu, EditHatasi

_MODELLER = {
    "flux_fill_pro":    "black-forest-labs/flux-fill-pro",
    "flux_kontext_pro": "black-forest-labs/flux-kontext-pro",
    "restore_image":    "flux-kontext-apps/restore-image",
    "clarity_pro":      "philz1337x/clarity-pro-upscaler",
}

_FACE_PROMPT = (
    "Restore and enhance facial features, fix blurriness, "
    "improve skin texture and details"
)

_YON_MAP = {
    "left":  "padding_left",
    "right": "padding_right",
    "up":    "padding_top",
    "down":  "padding_bottom",
}


class ReplicateEditProvider(BaseEditProvider):

    def __init__(self, api_token: Optional[str] = None):
        token = api_token or os.getenv("REPLICATE_API_TOKEN")
        if not token:
            raise EnvironmentError("REPLICATE_API_TOKEN is not set.")
        os.environ["REPLICATE_API_TOKEN"] = token

    @property
    def provider_adi(self) -> str:
        return "replicate"

    @property
    def desteklenen_islemler(self) -> list[EditIslemi]:
        return list(EditIslemi)

    # ─── Public methods ───────────────────────────────────────────

    def inpaint(self, gorsel: Image.Image, maske: Image.Image, prompt: str, guc: float = 0.85) -> EditSonucu:
        model = _MODELLER["flux_fill_pro"]
        try:
            output = replicate.run(model, input={
                "image":           self._pil_to_file(gorsel, "RGB"),
                "mask":            self._pil_to_file(maske, "L"),
                "prompt":          prompt,
                "prompt_strength": guc,
                "output_format":   "jpg",
                "output_quality":  92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.INPAINTING, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    def outpaint(self, gorsel: Image.Image, prompt: str, yon: str = "right", px: int = 256) -> EditSonucu:
        model = _MODELLER["flux_fill_pro"]
        padding_key = _YON_MAP.get(yon, "padding_right")
        try:
            output = replicate.run(model, input={
                "image":          self._pil_to_file(gorsel, "RGB"),
                "prompt":         prompt,
                "output_format":  "jpg",
                "output_quality": 92,
                padding_key:      px,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.OUTPAINTING, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    def nesne_kaldir(self, gorsel: Image.Image, maske: Image.Image) -> EditSonucu:
        sonuc = self.inpaint(gorsel, maske, prompt="", guc=0.97)
        return EditSonucu(gorsel=sonuc.gorsel, model=sonuc.model)

    def arka_plan_degistir(self, gorsel: Image.Image, prompt: str) -> EditSonucu:
        model = _MODELLER["flux_kontext_pro"]
        try:
            output = replicate.run(model, input={
                "image":          self._pil_to_file(gorsel, "RGB"),
                "prompt":         prompt,
                "output_format":  "jpg",
                "output_quality": 92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.ARKA_PLAN_DEGIS, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    def restore(self, gorsel: Image.Image, aciklama: str = "Fix scratches, damage, and improve overall quality") -> EditSonucu:
        model = _MODELLER["restore_image"]
        try:
            output = replicate.run(model, input={
                "image":  self._pil_to_file(gorsel, "RGB"),
                "prompt": aciklama,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.RESTORE, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    def yuz_restore(self, gorsel: Image.Image) -> EditSonucu:
        sonuc = self.restore(gorsel, aciklama=_FACE_PROMPT)
        return EditSonucu(gorsel=sonuc.gorsel, model=sonuc.model)

    def upscale(self, gorsel: Image.Image, olcek: int = 2) -> EditSonucu:
        if olcek not in (2, 4):
            raise EditHatasi(EditIslemi.UPSCALE, "olcek 2 veya 4 olmalı", self.provider_adi)
        model = _MODELLER["clarity_pro"]
        try:
            output = replicate.run(model, input={
                "image":         self._pil_to_file(gorsel, "RGB"),
                "scale_factor":  olcek,
                "prompt":        "masterpiece, best quality, highres, highly detailed",
                "creativity":    0.35,
                "resemblance":   0.6,
                "dynamic":       6,
                "output_format": "jpg",
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.UPSCALE, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    def stil_transfer(self, gorsel: Image.Image, prompt: str) -> EditSonucu:
        model = _MODELLER["flux_kontext_pro"]
        try:
            output = replicate.run(model, input={
                "image":          self._pil_to_file(gorsel, "RGB"),
                "prompt":         prompt,
                "output_format":  "jpg",
                "output_quality": 92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.STIL_TRANSFER, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._url_to_pil(self._cikti_url(output)), model=model)

    # ─── Private helpers ──────────────────────────────────────────

    @staticmethod
    def _pil_to_file(image: Image.Image, mode: str) -> BytesIO:
        img = image.convert(mode)
        buf = BytesIO()
        if mode == "L":
            img.save(buf, format="PNG")
        else:
            img.save(buf, format="JPEG", quality=95)
        buf.seek(0)
        return buf

    @staticmethod
    def _url_to_pil(url: str) -> Image.Image:
        resp = httpx.get(url, timeout=120, follow_redirects=True)
        resp.raise_for_status()
        return Image.open(BytesIO(resp.content)).convert("RGB")

    @staticmethod
    def _cikti_url(output) -> str:
        if hasattr(output, "__iter__") and not isinstance(output, (str, bytes)):
            return next(iter(output))
        return str(output)
