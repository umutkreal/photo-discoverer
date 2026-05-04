from .gdrive  import GoogleDriveProvider
from .dropbox import DropboxProvider
from .base    import BaseProvider

# Devre dışı provider'lar — kod muhafaza edildi, import kasıtlı olarak kaldırıldı.
# Etkinleştirmek için ilgili satırı uncomment et ve match bloğuna case ekle:
#   from .onedrive import OneDriveProvider  →  case "onedrive": return OneDriveProvider(credentials)
#   from .pcloud   import PCloudProvider    →  case "pcloud":   return PCloudProvider(credentials)


def provider_getir(source: str, credentials) -> BaseProvider:
    match source:
        case "gdrive":   return GoogleDriveProvider(credentials)
        case "dropbox":  return DropboxProvider(credentials)
        case _: raise ValueError(f"Bilinmeyen provider: {source}")
