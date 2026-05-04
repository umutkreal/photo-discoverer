from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image
import io
from .base import BaseProvider


class GoogleDriveProvider(BaseProvider):

    source_key = "gdrive"

    def __init__(self, credentials: Credentials):
        self.service = build("drive", "v3", credentials=credentials)

    def fotograflari_listele(self, klasor_id=None, limit=100):
        if klasor_id:
            q = f"mimeType contains 'image/' and '{klasor_id}' in parents and trashed = false"
        else:
            q = "mimeType contains 'image/' and trashed = false"

        tum_dosyalar = []
        page_token = None

        while True:
            sonuc = self.service.files().list(
                q=q,
                fields="nextPageToken, files(id, name, size, parents, webViewLink, imageMediaMetadata)",
                pageSize=min(limit - len(tum_dosyalar), 1000),
                pageToken=page_token,
            ).execute()

            for f in sonuc.get("files", []):
                meta = f.get("imageMediaMetadata", {})
                loc = meta.get("location", {})
                tum_dosyalar.append({
                    "id":          f["id"],
                    "name":        f["name"],
                    "size":        int(f.get("size", 0)),
                    "folder_path": "/".join(f.get("parents", [])),
                    "drive_url":   f.get("webViewLink", ""),
                    "exif": {
                        "date_taken":   meta.get("time"),
                        "year":         int(meta["time"][:4]) if meta.get("time") else None,
                        "month":        int(meta["time"][5:7]) if meta.get("time") else None,
                        "lat":          loc.get("latitude"),
                        "lon":          loc.get("longitude"),
                        "camera_make":  meta.get("cameraMake"),
                        "camera_model": meta.get("cameraModel"),
                    },
                })

            if len(tum_dosyalar) >= limit:
                break
            page_token = sonuc.get("nextPageToken")
            if not page_token:
                break

        return tum_dosyalar[:limit]

    def foto_indir(self, file_id):
        request = self.service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buffer.seek(0)
        return Image.open(buffer).convert("RGB")

    def degisiklikleri_getir(self, page_token):
        eklenenler = []
        silinenler = []
        current_token = page_token
        new_start_token = page_token

        while True:
            response = self.service.changes().list(
                pageToken=current_token,
                fields="nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, trashed))",
                spaces="drive",
                includeRemoved=True,
            ).execute()

            for change in response.get("changes", []):
                file_id = change.get("fileId")
                file_info = change.get("file")

                if change.get("removed", False):
                    silinenler.append(file_id)
                    continue

                if file_info is None:
                    continue

                if file_info.get("trashed", False):
                    silinenler.append(file_id)
                elif file_info.get("mimeType", "").startswith("image/"):
                    eklenenler.append({
                        "id":          file_info["id"],
                        "name":        file_info["name"],
                        "size":        0,
                        "folder_path": "",
                        "drive_url":   f"https://drive.google.com/file/d/{file_info['id']}/view",
                        "exif":        {},
                    })

            if "nextPageToken" in response:
                current_token = response["nextPageToken"]
            else:
                new_start_token = response.get("newStartPageToken", current_token)
                break

        return eklenenler, silinenler, new_start_token

    def foto_sil(self, file_id):
        try:
            self.service.files().delete(fileId=file_id).execute()
            return True
        except Exception as e:
            print(f"GDrive silme hatası: {e}")
            return False

    def baslangic_token_al(self):
        response = self.service.changes().getStartPageToken().execute()
        return response.get("startPageToken")
