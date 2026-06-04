import os
import httpx
from PIL import Image
import io
from .base import BaseProvider

PCLOUD_URL = os.getenv("PCLOUD_API_URL", "https://api.pcloud.com")


class PCloudAuthError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(f"pCloud hata {code}: {message}")
        self.code = code


class PCloudProvider(BaseProvider):
    """
    pCloud REST API üzerinden erişim.
    access_token: pCloud OAuth2 token.
    Not: EU bölgesi hesaplar için PCLOUD_URL'yi eapi.pcloud.com olarak değiştir.
    """

    source_key = "pcloud"

    def __init__(self, access_token: str, hostname: str = "api.pcloud.com"):
        self._token = access_token
        self._base_url = f"https://{hostname}"

    def _get(self, endpoint: str, **params) -> dict:
        headers = {"Authorization": f"Bearer {self._token}"}
        resp = httpx.get(f"{self._base_url}{endpoint}", params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        result_code = data.get("result", 0)
        if result_code != 0:
            # 1000 = login required (1xxx: login errors)
            # 2094 = invalid access_token value provided (2xxx: user/data errors, but this
            #        specific code means the token itself is bad — re-auth is the only fix)
            if result_code in (1000, 2094):
                raise PCloudAuthError(result_code, data.get("error", "bilinmeyen hata"))
            raise RuntimeError(f"pCloud hata {result_code}: {data.get('error', 'bilinmeyen hata')}")
        return data

    def _list_folder_recursive(self, folder_id: int, out: list, path_prefix: str) -> None:
        """EU endpoint recursive parametresini desteklemez; her alt klasör için ayrı API çağrısı yapar."""
        resp = self._get("/listfolder", folderid=folder_id)
        for item in resp.get("metadata", {}).get("contents", []):
            if item.get("isfolder"):
                sub_path = f"{path_prefix}/{item['name']}".lstrip("/")
                self._list_folder_recursive(item["folderid"], out, sub_path)
                continue
            ct = item.get("contenttype", "")
            name = item.get("name", "")
            if not (ct.startswith("image/") or name.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))):
                continue
            file_id = item.get("fileid") or item.get("id", "")
            folder_path = f"/{path_prefix}" if path_prefix else "/"
            out.append({
                "id":          str(file_id),
                "name":        name,
                "size":        item.get("size", 0),
                "folder_path": folder_path,
                "drive_url":   (
                    f"https://my.pcloud.com/#page=filemanager"
                    f"&folder={item.get('parentfolderid', '')}&file={file_id}"
                ),
                "exif": {},
            })

    def fotograflari_listele(self, klasor_id=None, limit=100):
        folder_id = int(klasor_id) if klasor_id else 0
        files: list = []
        self._list_folder_recursive(folder_id, files, "")
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
            file_id = meta.get("fileid") or meta.get("id", "")
            if event == "delete":
                if file_id:
                    silinenler.append(str(file_id))
            elif event in ("create", "modify"):
                ct = meta.get("contenttype", "")
                name = meta.get("name", "")
                if not (ct.startswith("image/") or name.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))):
                    continue
                eklenenler.append({
                    "id":          str(file_id),
                    "name":        name,
                    "size":        meta.get("size", 0),
                    "folder_path": "",
                    "drive_url":   f"https://my.pcloud.com/#page=filemanager&file={file_id}",
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
            f"{self._base_url}/uploadfile",
            params={"folderid": folder_id, "filename": filename},
            headers={"Authorization": f"Bearer {self._token}"},
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
