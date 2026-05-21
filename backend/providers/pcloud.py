import httpx
from PIL import Image
import io
from .base import BaseProvider

PCLOUD_URL = "https://api.pcloud.com"


class PCloudProvider(BaseProvider):
    """
    pCloud REST API üzerinden erişim.
    access_token: pCloud OAuth2 token.
    Not: EU bölgesi hesaplar için PCLOUD_URL'yi eapi.pcloud.com olarak değiştir.
    """

    source_key = "pcloud"

    def __init__(self, access_token: str):
        self._token = access_token

    def _get(self, endpoint: str, **params) -> dict:
        params["access_token"] = self._token
        resp = httpx.get(f"{PCLOUD_URL}{endpoint}", params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        result_code = data.get("result", 0)
        if result_code != 0:
            raise RuntimeError(f"pCloud hata {result_code}: {data.get('error', 'bilinmeyen hata')}")
        return data

    def _collect_files(self, metadata: dict, out: list) -> None:
        """Klasör ağacını recursive gezer, fotoğraf dosyalarını toplar."""
        for item in metadata.get("contents", []):
            if item.get("isfolder"):
                self._collect_files(item, out)
                continue
            ct = item.get("contenttype", "")
            name = item.get("name", "")
            if not (ct.startswith("image/") or name.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))):
                continue
            path = item.get("path", "")
            folder = "/".join(path.split("/")[:-1]) if path else ""
            out.append({
                "id":          str(item["id"]),
                "name":        name,
                "size":        item.get("size", 0),
                "folder_path": folder,
                "drive_url":   (
                    f"https://my.pcloud.com/#page=filemanager"
                    f"&folder={item.get('parentfolderid', '')}&file={item['id']}"
                ),
                "exif": {},
            })

    def fotograflari_listele(self, klasor_id=None, limit=100):
        folder_id = int(klasor_id) if klasor_id else 0
        resp = self._get("/listfolder", folderid=folder_id, recursive=1, noshares=0)
        files: list = []
        self._collect_files(resp.get("metadata", {}), files)
        return files[:limit]

    def foto_indir(self, file_id: str) -> Image.Image:
        link_data = self._get("/getfilelink", fileid=int(file_id))
        download_url = f"https://{link_data['hosts'][0]}{link_data['path']}"
        resp = httpx.get(download_url, follow_redirects=True, timeout=60)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    def degisiklikleri_getir(self, page_token: str):
        resp = self._get("/diff", diffid=int(page_token))
        eklenenler: list = []
        silinenler: list = []

        for entry in resp.get("entries", []):
            event = entry.get("event", "")
            meta = entry.get("metadata", {})
            if meta.get("isfolder"):
                continue
            if event == "delete":
                silinenler.append(str(meta.get("id", "")))
            elif event in ("create", "modify"):
                ct = meta.get("contenttype", "")
                name = meta.get("name", "")
                if not (ct.startswith("image/") or name.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))):
                    continue
                path = meta.get("path", "")
                folder = "/".join(path.split("/")[:-1]) if path else ""
                eklenenler.append({
                    "id":          str(meta["id"]),
                    "name":        name,
                    "size":        meta.get("size", 0),
                    "folder_path": folder,
                    "drive_url":   f"https://my.pcloud.com/#page=filemanager&file={meta['id']}",
                    "exif":        {},
                })

        return eklenenler, silinenler, str(resp.get("diffid", page_token))

    def foto_sil(self, file_id: str) -> bool:
        try:
            self._get("/deletefile", fileid=int(file_id))
            return True
        except Exception as e:
            print(f"pCloud silme hatası: {e}")
            return False

    def baslangic_token_al(self) -> str:
        # last=1 → sadece güncel diffid'i döner, tüm history'yi indirmez
        resp = self._get("/diff", last=1, limit=0)
        return str(resp.get("diffid", "0"))

    def foto_yukle(self, image_bytes: bytes, filename: str, folder: str = "PhotoMind-Edited") -> dict:
        # Önce klasörü bul/oluştur
        folder_resp = self._get("/createfolderifnotexists", path=f"/{folder}")
        folder_id = folder_resp.get("metadata", {}).get("folderid", 0)

        upload_resp = httpx.post(
            f"{PCLOUD_URL}/uploadfile",
            params={"access_token": self._token, "folderid": folder_id, "filename": filename},
            files={"file": (filename, image_bytes, "image/jpeg")},
            timeout=60,
        )
        upload_resp.raise_for_status()
        data = upload_resp.json()
        if data.get("result", 0) != 0:
            raise RuntimeError(f"pCloud yükleme hatası: {data.get('error')}")
        file_meta = data.get("metadata", [{}])[0] if data.get("metadata") else {}
        return {
            "id": str(file_meta.get("fileid", "")),
            "name": file_meta.get("name", filename),
            "drive_url": f"https://my.pcloud.com/#page=filemanager&path=/{folder}/{filename}",
        }
