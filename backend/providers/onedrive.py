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
        if klasor_id:
            url = f"{GRAPH}/me/drive/items/{klasor_id}/children"
        else:
            url = f"{GRAPH}/me/drive/root/search(q='.jpg')"

        # photo facet'i olan her item fotoğraftır — boş query + client-side filtre
        search_url = f"{GRAPH}/me/drive/root/search(q='')"
        data = self._get(
            search_url,
            **{"$top": min(limit * 3, 999), "$select": "id,name,size,webUrl,parentReference,photo,location,file"},
        )

        dosyalar = []
        for item in data.get("value", []):
            mime = item.get("file", {}).get("mimeType", "")
            if not (item.get("photo") or mime.startswith("image/")):
                continue
            photo = item.get("photo") or {}
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
        # page_token burada deltaLink URL'sidir
        data = self._get(page_token)
        eklenenler = []
        silinenler = []

        for item in data.get("value", []):
            if item.get("deleted"):
                silinenler.append(item["id"])
            elif item.get("photo") or (item.get("file", {}).get("mimeType", "")).startswith("image/"):
                photo = item.get("photo") or {}
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

        yeni_token = data.get("@odata.deltaLink") or data.get("@odata.nextLink", page_token)
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
        # Delta endpoint'ini bir kez çağır, deltaLink'i al — bu ilk sync noktasıdır.
        data = self._get(
            f"{GRAPH}/me/drive/root/delta",
            **{"$select": "id"},
            **{"$top": 1},
        )
        # Tüm sayfaları geç, son deltaLink'i bul
        while "@odata.nextLink" in data:
            data = self._get(data["@odata.nextLink"])
        return data.get("@odata.deltaLink", "")
