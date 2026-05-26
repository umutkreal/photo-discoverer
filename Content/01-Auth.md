# 01 — Authentication

## Genel Bakış
PhotoMind'da iki katmanlı bir kimlik doğrulama sistemi var: kullanıcı oturumu için **Google OAuth + JWT**, bulut depolama erişimi için **provider-özel OAuth** akışları.

---

## Kullanıcı Girişi (Google OAuth)

### `backend/auth.py`
Dört bulut sağlayıcı için OAuth akışlarını yönetir.

**Google Drive akışı:**
- `oauth_flow_init()` — `google-auth-oauthlib` ile authorization URL üretir. Scopes: `openid`, `drive`, `userinfo.email`, `userinfo.profile`
- `oauth_flow_fetch_token(authorization_response_url)` — kodu access token ile değiştirir, Credentials nesnesi döner
- `get_user_info(credentials)` — Google OAuth2 API'den `email / name / picture` alır

**Diğer sağlayıcılar (Dropbox, pCloud, OneDrive):**
- Her biri `main.py` içinde inline tanımlı; CSRF koruması için `state` dict kullanır
- Dropbox: `httpx` ile manuel token exchange
- pCloud: `api.pcloud.com/oauth2_token` endpoint'i
- OneDrive: `login.microsoftonline.com/.../token` (tenant: `consumers`, hem access hem refresh token döner)

### `backend/jwt_handler.py`
- `jwt_olustur(data: dict) → str` — HS256 imzalı, 24 saatlik JWT üretir
- `jwt_dogrula(token: str) → dict | None` — payload döner ya da None

### `backend/token_store.py`
Sunucu bellekte sağlayıcı kimlik bilgilerini ve delta-sync checkpoint'lerini tutar.

| Fonksiyon | Açıklama |
|-----------|----------|
| `kaydet(email, source, credentials)` | Provider tokenlarını saklar |
| `getir(email, source)` | Tek provider için token getirir |
| `getir_tum(email)` | Tüm bağlı providerları döner |
| `sil(email, source)` | Bağlantıyı keser |
| `page_token_kaydet/getir/sil` | Delta sync checkpoint yönetimi |

> **Kısıt:** Sunucu yeniden başlayınca tüm tokenlar kaybolur. Redis'e geçiş planlandı (Phase 5B).

---

## FastAPI Endpoint'leri (`backend/main.py`)

| Endpoint | Açıklama |
|----------|----------|
| `GET /auth/login` | Google auth URL döner |
| `GET /auth/callback` | Google kodu token'a çevirir, JWT + user info URL'e eklenerek frontend'e yönlendirir |
| `GET /auth/me` | JWT doğrular, user dict döner |
| `GET /auth/dropbox/login` | Dropbox auth URL |
| `GET /auth/dropbox/callback` | Dropbox token exchange |
| `GET /auth/pcloud/login` | pCloud auth URL |
| `GET /auth/pcloud/callback` | pCloud token exchange |
| `GET /auth/onedrive/login` | OneDrive auth URL |
| `GET /auth/onedrive/callback` | OneDrive token exchange |
| `DELETE /integrations/{source}` | Sağlayıcı bağlantısını keser |

### `backend/dependencies.py`
FastAPI dependency injection:
- `aktif_kullanici()` — Bearer token'dan JWT doğrular, user dict döner; geçersizse 401
- `kullanici_tum_credentials()` — En az bir sağlayıcı bağlı değilse hata; bağlı provider credentials'larını döner

---

## Frontend Tarafı

### `frontend/src/hooks/useAuth.ts`
`User { email, name, picture }` tipinde bir hook. localStorage'dan user/token okur.
- `logout()` — localStorage temizler, ana sayfaya yönlendirir
- `setUser()` — auth state'ini günceller

Tüm korumalı sayfalar: `loading && !user` kontrolüyle `/` adresine yönlendirir.

### `frontend/src/app/page.tsx`
Landing sayfası. `useAuth()` ile login kontrolü yapar; token varsa `/dashboard`'a yönlendirir. "Google ile Giriş Yap" butonu `authApi.login()` çağırır.

### `frontend/src/app/auth/callback/page.tsx`
OAuth geri dönüş işleyicisi. URL parametrelerinden (`access_token`, `email`, `name`, `picture`) JWT ve user bilgisini okur, localStorage'a yazar, `/dashboard`'a yönlendirir.

### `frontend/src/app/settings/integrations/page.tsx`
Bulut sağlayıcı bağlantı yönetimi. 4 kart (GDrive, Dropbox, OneDrive, pCloud): bağlantı durumu, izinler, bağlan/bağlantı kes aksiyonları.

---

## Akış Özeti

```
Kullanıcı → GET /auth/login → Google → GET /auth/callback
  → JWT üret → frontend /auth/callback?access_token=...
  → localStorage'a yaz → /dashboard'a yönlendir
```

```
Provider bağlama → /auth/{provider}/login → OAuth → /auth/{provider}/callback
  → token_store.kaydet(email, source, credentials)
```
