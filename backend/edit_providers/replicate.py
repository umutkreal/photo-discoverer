from __future__ import annotations

import os
from io import BytesIO
from typing import Optional

try:
    import replicate
    import httpx
    from PIL import Image
    _DEPS_OK = True
except ImportError:
    _DEPS_OK = False

from .base import BaseEditProvider, EditIslemi, EditSonucu, EditHatasi


class NamedBytesIO(BytesIO):
    """BytesIO subclass with a .name attribute so the Replicate SDK can detect MIME type."""
    name: str


_MODELLER = {
    "flux_fill_pro":      "black-forest-labs/flux-fill-pro",
    "flux_kontext_pro":   "black-forest-labs/flux-kontext-pro",
    "flux_kontext_max":   "black-forest-labs/flux-kontext-max",
    "restore_image":      "flux-kontext-apps/restore-image",
    "clarity_pro":        "philz1337x/clarity-pro-upscaler",
    "remove_background":  "bria/remove-background",
}


class ReplicateEditProvider(BaseEditProvider):

    def __init__(self, api_token: Optional[str] = None):
        if not _DEPS_OK:
            raise ImportError(
                "AI edit için gerekli paket eksik. "
                "`pip install replicate pillow httpx` ile yükleyin."
            )
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
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

    def outpaint(self, gorsel: Image.Image, prompt: str, outpaint_modu: str = "Zoom out 2x", steps: int = 50) -> EditSonucu:
        model = _MODELLER["flux_fill_pro"]
        try:
            output = replicate.run(model, input={
                "image":            self._pil_to_file(gorsel, "RGB"),
                "prompt":           prompt,
                "outpaint":         outpaint_modu,
                "steps":            steps,
                "guidance":         3.0,
                "safety_tolerance": 2,
                "output_format":    "jpg",
                "output_quality":   92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.OUTPAINTING, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

    def background_remove(self, gorsel: Image.Image) -> EditSonucu:
        model = _MODELLER["remove_background"]
        try:
            output = replicate.run(model, input={
                "image": self._pil_to_file(gorsel, "RGB"),
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.BACKGROUND_REMOVE, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._output_to_pil(output, mode="RGBA"), model=model)

    def restore(self, gorsel: Image.Image, aciklama: str = "Fix scratches, damage, and improve overall quality") -> EditSonucu:
        model = _MODELLER["restore_image"]
        try:
            output = replicate.run(model, input={
                "input_image": self._pil_to_file(gorsel, "RGB"),
                "prompt":      aciklama,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.RESTORE, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

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
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

    def stil_transfer(self, gorsel: Image.Image, prompt: str) -> EditSonucu:
        model = _MODELLER["flux_kontext_pro"]
        try:
            output = replicate.run(model, input={
                "input_image":    self._pil_to_file(gorsel, "RGB"),
                "prompt":         prompt,
                "output_format":  "jpg",
                "output_quality": 92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.STIL_TRANSFER, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

    def text_edit(self, gorsel: Image.Image, prompt: str) -> EditSonucu:
        model = _MODELLER["flux_kontext_max"]
        try:
            output = replicate.run(model, input={
                "input_image":    self._pil_to_file(gorsel, "RGB"),
                "prompt":         prompt,
                "output_format":  "jpg",
                "output_quality": 92,
            })
        except Exception as e:
            raise EditHatasi(EditIslemi.TEXT_EDIT, str(e), self.provider_adi)
        return EditSonucu(gorsel=self._output_to_pil(output), model=model)

    # ─── Private helpers ──────────────────────────────────────────

    @staticmethod
    def _pil_to_file(image: Image.Image, mode: str) -> NamedBytesIO:
        img = image.convert(mode)
        buf = NamedBytesIO()
        if mode == "L":
            img.save(buf, format="PNG")
            buf.name = "image.png"
        else:
            img.save(buf, format="JPEG", quality=95)
            buf.name = "image.jpg"
        buf.seek(0)
        return buf

    @staticmethod
    def _output_to_pil(output, mode: str = "RGB") -> Image.Image:
        if isinstance(output, (str, bytes)):
            item = output
        elif hasattr(output, "__iter__"):
            chunks = list(output)
            if not chunks:
                raise ValueError("Empty model output")
            item = b"".join(chunks) if isinstance(chunks[0], bytes) else chunks[0]
        else:
            item = output

        if isinstance(item, bytes):
            return Image.open(BytesIO(item)).convert(mode)
        resp = httpx.get(str(item), timeout=120, follow_redirects=True)
        resp.raise_for_status()
        return Image.open(BytesIO(resp.content)).convert(mode)
