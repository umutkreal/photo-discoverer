from abc import ABC, abstractmethod
from PIL import Image


class BaseProvider(ABC):

    @abstractmethod
    def fotograflari_listele(self, klasor_id: str = None, limit: int = 100) -> list[dict]:
        """
        Fotoğraf listesi döner. Her dict şu alanları içermeli:
        {
            "id":          str,
            "name":        str,
            "size":        int,
            "folder_path": str,
            "drive_url":   str,
            "exif":        dict,
        }
        """
        pass

    @abstractmethod
    def foto_indir(self, file_id: str) -> Image.Image:
        """Dosyayı RAM'e indirir, PIL Image olarak döner. Diske yazmaz."""
        pass

    @abstractmethod
    def degisiklikleri_getir(self, page_token: str) -> tuple[list, list, str]:
        """
        Delta sync için. Döner: (eklenen_dosyalar, silinen_id_ler, yeni_page_token)
        eklenen_dosyalar: list[dict] — fotograflari_listele ile aynı format
        silinen_id_ler:   list[str] — provider'a özgü file ID'leri
        """
        pass

    @abstractmethod
    def foto_sil(self, file_id: str) -> bool:
        """Dosyayı provider'dan kalıcı siler. True = başarılı."""
        pass

    @abstractmethod
    def baslangic_token_al(self) -> str:
        """
        İlk indexlemeden sonra kaydedilecek sync başlangıç token/cursor'ı döner.
        Sonraki delta_sync çağrıları bu token'dan devam eder.
        """
        pass

    @property
    @abstractmethod
    def source_key(self) -> str:
        """Qdrant payload'daki 'source' alanı. Örn: 'gdrive', 'dropbox', 'onedrive'"""
        pass
