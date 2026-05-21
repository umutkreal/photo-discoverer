from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional
from PIL import Image


class EditIslemi(str, Enum):
    INPAINTING      = "inpainting"
    OUTPAINTING     = "outpainting"
    NESNE_KALDIR    = "object_remove"
    ARKA_PLAN_DEGIS = "background_swap"
    RESTORE         = "restore"
    YUZ_RESTORE     = "face_restore"
    UPSCALE         = "upscale"
    STIL_TRANSFER   = "style_transfer"


class EditHatasi(Exception):
    def __init__(self, islem: EditIslemi, message: str, provider: str = ""):
        self.islem    = islem
        self.provider = provider
        self.message  = message
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"[{self.provider}] {self.islem}: {self.message}"


@dataclass
class EditSonucu:
    gorsel:   Image.Image
    model:    str
    maliyet:  Optional[float] = None
    metadata: Optional[dict]  = None


class BaseEditProvider(ABC):

    @property
    @abstractmethod
    def provider_adi(self) -> str: ...

    @property
    @abstractmethod
    def desteklenen_islemler(self) -> list[EditIslemi]: ...

    @abstractmethod
    def inpaint(self, gorsel: Image.Image, maske: Image.Image, prompt: str, guc: float = 0.85) -> EditSonucu: ...

    @abstractmethod
    def outpaint(self, gorsel: Image.Image, prompt: str, yon: str = "right", px: int = 256) -> EditSonucu: ...

    @abstractmethod
    def nesne_kaldir(self, gorsel: Image.Image, maske: Image.Image) -> EditSonucu: ...

    @abstractmethod
    def arka_plan_degistir(self, gorsel: Image.Image, prompt: str) -> EditSonucu: ...

    @abstractmethod
    def restore(self, gorsel: Image.Image, aciklama: str = "Fix scratches, damage, and improve overall quality") -> EditSonucu: ...

    @abstractmethod
    def yuz_restore(self, gorsel: Image.Image) -> EditSonucu: ...

    @abstractmethod
    def upscale(self, gorsel: Image.Image, olcek: int = 2) -> EditSonucu: ...

    @abstractmethod
    def stil_transfer(self, gorsel: Image.Image, prompt: str) -> EditSonucu: ...

    def isle(
        self,
        islem: EditIslemi,
        gorsel: Image.Image,
        maske: Optional[Image.Image] = None,
        prompt: Optional[str] = None,
        guc: float = 0.85,
        yon: str = "right",
        genisletme_px: int = 256,
        olcek: int = 2,
        aciklama: str = "Fix scratches, damage, and improve overall quality",
    ) -> EditSonucu:
        if islem not in self.desteklenen_islemler:
            raise EditHatasi(islem, f"Bu işlem desteklenmiyor. Desteklenenler: {[i.value for i in self.desteklenen_islemler]}", self.provider_adi)

        if islem in (EditIslemi.INPAINTING, EditIslemi.NESNE_KALDIR) and maske is None:
            raise EditHatasi(islem, "'maske' parametresi zorunlu", self.provider_adi)

        if islem in (EditIslemi.INPAINTING, EditIslemi.OUTPAINTING, EditIslemi.ARKA_PLAN_DEGIS, EditIslemi.STIL_TRANSFER) and not prompt:
            raise EditHatasi(islem, "'prompt' parametresi zorunlu", self.provider_adi)

        match islem:
            case EditIslemi.INPAINTING:
                return self.inpaint(gorsel, maske, prompt, guc)
            case EditIslemi.OUTPAINTING:
                return self.outpaint(gorsel, prompt, yon, genisletme_px)
            case EditIslemi.NESNE_KALDIR:
                return self.nesne_kaldir(gorsel, maske)
            case EditIslemi.ARKA_PLAN_DEGIS:
                return self.arka_plan_degistir(gorsel, prompt)
            case EditIslemi.RESTORE:
                return self.restore(gorsel, aciklama)
            case EditIslemi.YUZ_RESTORE:
                return self.yuz_restore(gorsel)
            case EditIslemi.UPSCALE:
                return self.upscale(gorsel, olcek)
            case EditIslemi.STIL_TRANSFER:
                return self.stil_transfer(gorsel, prompt)
