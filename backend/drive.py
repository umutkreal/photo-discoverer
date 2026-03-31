from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image
import io


def drive_servisi_olustur(credentials):
    """Token store'dan gelen credentials ile Drive servisi oluşturur."""
    return build("drive", "v3", credentials=credentials)


def foto_indir(service, file_id):
    """Fotoğrafı RAM'e indirir, diske kaydetmez."""
    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")


def fotograflari_listele(service, klasor_id=None, limit=100):
    """
    Drive'dan fotoğrafları listeler.
    klasor_id verilirse o klasörden, verilmezse tüm Drive'dan çeker.
    Google Drive API pageSize max 1000.
    """
    if klasor_id:
        query = f"mimeType contains 'image/' and '{klasor_id}' in parents and trashed = false"
    else:
        query = "mimeType contains 'image/' and trashed = false"

    tum_dosyalar = []
    page_token = None

    while True:
        sonuclar = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name)",
            pageSize=min(limit - len(tum_dosyalar), 1000),
            pageToken=page_token,
        ).execute()

        dosyalar = sonuclar.get("files", [])
        tum_dosyalar.extend(dosyalar)

        # Limit'e ulaştıysak veya başka sayfa yoksa dur
        if len(tum_dosyalar) >= limit:
            break

        page_token = sonuclar.get("nextPageToken")
        if not page_token:
            break

    return tum_dosyalar[:limit]