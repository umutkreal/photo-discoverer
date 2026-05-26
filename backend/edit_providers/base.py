from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional
from PIL import Image


class EditIslemi(str, Enum):
    INPAINTING       = "inpainting"
    OUTPAINTING      = "outpainting"
    BACKGROUND_REMOVE = "background_remove"
    RESTORE          = "restore"
    UPSCALE          = "upscale"
    STIL_TRANSFER    = "style_transfer"
    TEXT_EDIT        = "text_edit"


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
    def outpaint(self, gorsel: Image.Image, prompt: str, outpaint_modu: str = "Zoom out 2x", steps: int = 50) -> EditSonucu: ...

    @abstractmethod
    def background_remove(self, gorsel: Image.Image) -> EditSonucu: ...

    @abstractmethod
    def restore(self, gorsel: Image.Image, aciklama: str = "Fix scratches, damage, and improve overall quality") -> EditSonucu: ...

    @abstractmethod
    def upscale(self, gorsel: Image.Image, olcek: int = 2) -> EditSonucu: ...

    @abstractmethod
    def stil_transfer(self, gorsel: Image.Image, prompt: str) -> EditSonucu: ...

    @abstractmethod
    def text_edit(self, gorsel: Image.Image, prompt: str) -> EditSonucu: ...

    def isle(
        self,
        islem: EditIslemi,
        gorsel: Image.Image,
        maske: Optional[Image.Image] = None,
        prompt: Optional[str] = None,
        guc: float = 0.85,
        outpaint_modu: str = "Zoom out 2x",
        adimlar: int = 50,
        olcek: int = 2,
        aciklama: str = "Fix scratches, damage, and improve overall quality",
    ) -> EditSonucu:
        if islem not in self.desteklenen_islemler:
            raise EditHatasi(islem, f"Bu işlem desteklenmiyor. Desteklenenler: {[i.value for i in self.desteklenen_islemler]}", self.provider_adi)

        if islem == EditIslemi.INPAINTING and maske is None:
            raise EditHatasi(islem, "Önce bir maske çizin", self.provider_adi)

        if islem in (EditIslemi.INPAINTING, EditIslemi.OUTPAINTING, EditIslemi.STIL_TRANSFER, EditIslemi.TEXT_EDIT) and not prompt:
            raise EditHatasi(islem, "Prompt alanını doldurun", self.provider_adi)

        match islem:
            case EditIslemi.INPAINTING:
                return self.inpaint(gorsel, maske, prompt, guc)
            case EditIslemi.OUTPAINTING:
                return self.outpaint(gorsel, prompt, outpaint_modu, adimlar)
            case EditIslemi.BACKGROUND_REMOVE:
                return self.background_remove(gorsel)
            case EditIslemi.RESTORE:
                return self.restore(gorsel, aciklama)
            case EditIslemi.UPSCALE:
                return self.upscale(gorsel, olcek)
            case EditIslemi.STIL_TRANSFER:
                return self.stil_transfer(gorsel, prompt)
            case EditIslemi.TEXT_EDIT:
                return self.text_edit(gorsel, prompt)
