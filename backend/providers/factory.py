from .gdrive   import GoogleDriveProvider
from .dropbox  import DropboxProvider
from .onedrive import OneDriveProvider
from .pcloud   import PCloudProvider
from .base     import BaseProvider


def provider_getir(source: str, credentials) -> BaseProvider:
    match source:
        case "gdrive":
            return GoogleDriveProvider(credentials)
        case "dropbox":
            return DropboxProvider(credentials)
        case "onedrive":
            return OneDriveProvider(credentials["access_token"])
        case "pcloud":
            return PCloudProvider(credentials["access_token"])
        case _:
            raise ValueError(f"Bilinmeyen provider: {source}")
