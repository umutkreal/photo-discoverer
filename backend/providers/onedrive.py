import httpx
from PIL import Image
import io
from .base import BaseProvider

GRAPH = "https://graph.microsoft.com/v1.0"


class OneDriveProvider(BaseProvider):
    """
    MS Graph REST API üzerinden OneDrive erişimi.
    access_token: MSAL OAuth2 akışından alınan Bearer token.
    msgraph-sdk yerine httpx kullanılıyor (sync uyumluluk için).
    """

    source_key = "onedrive"

    def __init__(self, access_token: str):
        self._headers = {"Authorization": f"Bearer {access_token}"}

    def _get(self, url: str, **params) -> dict:
        resp = httpx.get(url, headers=self._headers, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def fotograflari_listele(self, klasor_id=None, limit=100):
        dosyalar = []
        # Taranacak klasör kuyruğu — item ID veya "root"
        kuyruk = [klasor_id or "root"]

        while kuyruk and len(dosyalar) < limit:
            folder = kuyruk.pop(0)
            url = f"{GRAPH}/me/drive/items/{folder}/children" if folder != "root" else f"{GRAPH}/me/drive/root/children"
            params = {
                "$select": "id,name,size,webUrl,parentReference,photo,location,file,folder",
                "$top": 200,
            }

            while url and len(dosyalar) < limit:
                data = self._get(url, **params)
                for item in data.get("value", []):
                    if item.get("folder"):
                        kuyruk.append(item["id"])
                        continue
                    mime = item.get("file", {}).get("mimeType", "")
                    if not (item.get("photo") or mime.startswith("image/")):
                        continue
                    photo    = item.get("photo") or {}
                    location = item.get("location") or {}
                    dosyalar.append({
                        "id":          item["id"],
                        "name":        item["name"],
                        "size":        item.get("size", 0),
                        "folder_path": (item.get("parentReference") or {}).get("path", ""),
                        "drive_url":   item.get("webUrl", ""),
                        "exif": {
                            "date_taken": photo.get("takenDateTime"),
                            "lat":        location.get("latitude"),
                            "lon":        location.get("longitude"),
                        },
                    })
                next_link = data.get("@odata.nextLink")
                if not next_link or len(dosyalar) >= limit:
                    break
                url    = next_link
                params = {}

        return dosyalar[:limit]

    def foto_indir(self, file_id):
        # content endpoint doğrudan binary döner
        resp = httpx.get(
            f"{GRAPH}/me/drive/items/{file_id}/content",
            headers=self._headers,
            follow_redirects=True,
            timeout=60,
        )
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    def degisiklikleri_getir(self, page_token):
        # page_token burada deltaLink URL'sidir; tüm sayfalar tüketilene kadar döngü
        url = page_token
        eklenenler = []
        silinenler = []
        yeni_token = page_token

        while url:
            data = self._get(url)
            for item in data.get("value", []):
                if item.get("deleted"):
                    silinenler.append(item["id"])
                elif item.get("photo") or (item.get("file", {}).get("mimeType", "")).startswith("image/"):
                    photo    = item.get("photo") or {}
                    location = item.get("location") or {}
                    eklenenler.append({
                        "id":          item["id"],
                        "name":        item.get("name", ""),
                        "size":        item.get("size", 0),
                        "folder_path": (item.get("parentReference") or {}).get("path", ""),
                        "drive_url":   item.get("webUrl", ""),
                        "exif": {
                            "date_taken": photo.get("takenDateTime"),
                            "lat":        location.get("latitude"),
                            "lon":        location.get("longitude"),
                        },
                    })

            if "@odata.deltaLink" in data:
                yeni_token = data["@odata.deltaLink"]
                break
            url = data.get("@odata.nextLink")

        return eklenenler, silinenler, yeni_token

    def foto_sil(self, file_id):
        try:
            resp = httpx.delete(
                f"{GRAPH}/me/drive/items/{file_id}",
                headers=self._headers,
                timeout=30,
            )
            resp.raise_for_status()
            return True
        except Exception as e:
            print(f"OneDrive silme hatası: {e}")
            return False

    def baslangic_token_al(self):
        # Tüm sayfaları büyük $top ile hızlıca geçerek deltaLink'e ulaş
        data = self._get(
            f"{GRAPH}/me/drive/root/delta",
            **{"$top": "500"},
        )
        while "@odata.nextLink" in data:
            data = self._get(data["@odata.nextLink"])
        return data.get("@odata.deltaLink", "")

    def foto_yukle(self, image_bytes: bytes, filename: str, folder: str = "PhotoMind-Edited") -> dict:
        url = f"{GRAPH}/me/drive/root:/{folder}/{filename}:/content"
        resp = httpx.put(
            url,
            headers={**self._headers, "Content-Type": "image/jpeg"},
            content=image_bytes,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "id": data.get("id", ""),
            "name": data.get("name", filename),
            "drive_url": data.get("webUrl", ""),
        }
