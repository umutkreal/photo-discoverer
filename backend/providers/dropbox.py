import dropbox
import dropbox.files
from PIL import Image
import io
import os
from .base import BaseProvider


class DropboxProvider(BaseProvider):

    source_key = "dropbox"

    def __init__(self, credentials):
        if isinstance(credentials, dict):
            # Yeni format: {"access_token": "...", "refresh_token": "..."}
            # refresh_token varsa SDK otomatik yeniler, yoksa sadece access_token ile devam eder.
            refresh_token = credentials.get("refresh_token")
            if refresh_token:
                self.dbx = dropbox.Dropbox(
                    oauth2_access_token=credentials["access_token"],
                    oauth2_refresh_token=refresh_token,
                    app_key=os.getenv("DROPBOX_APP_KEY"),
                    app_secret=os.getenv("DROPBOX_APP_SECRET"),
                )
            else:
                self.dbx = dropbox.Dropbox(credentials["access_token"])
        else:
            # Eski format: düz string access_token (geriye dönük uyum)
            self.dbx = dropbox.Dropbox(credentials)

    def fotograflari_listele(self, klasor_id=None, limit=100):
        yol = klasor_id or ""
        sonuc = self.dbx.files_list_folder(yol, recursive=True)
        dosyalar = []

        while True:
            for entry in sonuc.entries:
                if isinstance(entry, dropbox.files.FileMetadata):
                    if entry.name.lower().endswith((".jpg", ".jpeg", ".png", ".heic")):
                        dosyalar.append({
                            "id":          entry.path_lower,  # DeletedMetadata ile eşleşmesi için path kullan
                            "name":        entry.name,
                            "size":        entry.size,
                            "folder_path": "/".join(entry.path_display.split("/")[:-1]),
                            "drive_url":   f"https://www.dropbox.com/home{entry.path_display}",
                            "exif":        {},
                        })
            if not sonuc.has_more or len(dosyalar) >= limit:
                break
            sonuc = self.dbx.files_list_folder_continue(sonuc.cursor)

        return dosyalar[:limit]

    def foto_indir(self, file_id):
        _, response = self.dbx.files_download(file_id)
        return Image.open(io.BytesIO(response.content)).convert("RGB")

    def degisiklikleri_getir(self, page_token):
        eklenenler: list = []
        silinenler: list = []
        cursor = page_token

        # Tüm sayfalar tüketilene kadar döngü (yeniden adlandırma birden fazla sayfaya yayılabilir)
        while True:
            sonuc = self.dbx.files_list_folder_continue(cursor)
            for entry in sonuc.entries:
                if isinstance(entry, dropbox.files.DeletedMetadata):
                    silinenler.append(entry.path_lower)
                elif isinstance(entry, dropbox.files.FileMetadata):
                    if entry.name.lower().endswith((".jpg", ".jpeg", ".png", ".heic")):
                        eklenenler.append({
                            "id":          entry.path_lower,
                            "name":        entry.name,
                            "size":        entry.size,
                            "folder_path": "/".join(entry.path_display.split("/")[:-1]),
                            "drive_url":   f"https://www.dropbox.com/home{entry.path_display}",
                            "exif":        {},
                        })
            cursor = sonuc.cursor
            if not sonuc.has_more:
                break

        return eklenenler, silinenler, cursor

    def foto_sil(self, file_id):
        try:
            self.dbx.files_delete_v2(file_id)
            return True
        except Exception as e:
            print(f"Dropbox silme hatası: {e}")
            return False

    def baslangic_token_al(self):
        # Tüm dosyaları atlayarak sadece cursor alır — indexleme sonrası delta başlangıcı.
        result = self.dbx.files_list_folder_get_latest_cursor("", recursive=True)
        return result.cursor
