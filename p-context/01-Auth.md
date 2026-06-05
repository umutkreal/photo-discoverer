# 01 — Authentication

## Genel Bakış
PhotoMind'da iki katmanlı bir kimlik doğrulama sistemi var: kullanıcı oturumu için **Google OAuth + JWT**, bulut depolama erişimi için **provider-özel OAuth** akışları.

---

## Kullanıcı Girişi (Google OAuth)

### `backend/auth.py`
Dört bulut sağlayıcı için OAuth akışlarını yönetir.

**Google Drive akışı:**
- `oauth_flow_init(state_store)` — `google-auth-oauthlib` ile authorization URL üretir; PKCE `code_verifier` varsa state payload'a eklenir; state `state_store.kaydet(state, payload, ttl=600)` ile kaydedilir. Scopes: `openid`, `drive`, `userinfo.email`, `userinfo.profile`
- `oauth_flow_fetch_token(state, code, code_verifier)` — kodu access token ile değiştirir, Credentials nesnesi döner
- `get_user_info(credentials)` — Google OAuth2 API'den `{email, name, picture}` alır

**Diğer sağlayıcılar (Dropbox, pCloud, OneDrive):**
- `auth.py` içinde ayrı fonksiyonlar: `pcloud_auth_url_olustur`, `pcloud_token_exchange`, `onedrive_auth_url_olustur`, `onedrive_token_exchange`
- CSRF koruması için `state_store` kullanır (aynı `InMemoryOAuthStateStore`)
- Dropbox: `httpx` ile token exchange
- pCloud: `api.pcloud.com/oauth2_token` endpoint'i
- OneDrive: `login.microsoftonline.com/.../token` (tenant: `consumers`, hem access hem refresh token döner)

### `backend/oauth_state_store.py` — InMemoryOAuthStateStore
CSRF koruması için state → payload eşleştirmesi tutan thread-safe in-memory store.

| Fonksiyon | Açıklama |
|-----------|----------|
| `kaydet(state, payload, ttl=600)` | state + expire timestamp saklar |
| `tuket(state)` → payload veya None | Atomik: al + sil; expire olmuşsa None döner |
| `temizle_suresi_gecenler()` | Manuel temizleme |

**Kısıt:** Server restart'ta tüm aktif state'ler kaybolur. Geçici pencerede OAuth tamamlanamaz. Gelecekte Redis'e geçilebilir.

### `backend/jwt_handler.py`
- `jwt_olustur(user_id: str) → str` — `{sub: user_id, exp: now+24h}` payload, HS256 imzalı JWT üretir
- `jwt_dogrula(token: str) → str | None` — geçerliyse `user_id` string döner, geçersiz/expire ise `None`

**Önemli:** `jwt_dogrula` dict değil `str | None` döner. `sub` claim user_id'yi taşır.

### `backend/token_store.py` — SqliteTokenStore
Sağlayıcı kimlik bilgilerini ve delta-sync checkpoint'lerini **SQLite** (`app.db`) `tokens` ve `page_tokens` tablolarında kalıcı olarak saklar.

| Fonksiyon | Açıklama |
|-----------|----------|
| `kaydet(user_id, source, credentials)` | Provider tokenlarını saklar |
| `getir(user_id, source)` | Tek provider için token getirir |
| `getir_tum(user_id)` | Tüm bağlı providerları döner |
| `sil(user_id, source)` | Bağlantıyı keser |
| `page_token_kaydet/getir/sil` | Delta sync checkpoint yönetimi |

GDrive credentials `Credentials.to_json()` / `from_authorized_user_info()` ile serileştirilir. Diğer providerlar düz `json.dumps()`.

### `backend/token_refresh.py`
OneDrive token yenileme (Google credentials google-auth tarafından otomatik yenilenir).
- `onedrive_token_yenile(user_id, refresh_token)` — refresh token ile yeni access token alır, SQLite'a yazar
- `onedrive_credentials_hazirla(user_id)` — OneDrive credentials'larını döner

---

## FastAPI Endpoint'leri (`backend/main.py`)

### Yeni Kullanıcı Oluşturma Invariant'ı

`GET /auth/callback` içinde:
1. Qdrant collection oluşturulur **önce** (`qdrant_collection_olustur()`)
2. SQLite'a kullanıcı kaydedilir **sonra** (`user_store.kaydet()`)

Bu sıra kasıtlıdır: Qdrant başarısız olursa incomplete kullanıcı DB'de kalmaz.

### OAuth Callback — RedirectResponse

`GET /auth/callback` başarı durumunda `RedirectResponse` döner:
```
HTTP 302 → http://localhost:3000/auth/callback?access_token=...&email=...&name=...&picture=...
```

Frontend `/auth/callback` sayfası bu URL parametrelerini okur.

Provider callback'leri ise `FRONTEND_INTEGRATIONS = "http://localhost:3000/account"` adresine yönlendirir:
- Başarı: `?connected=dropbox` (veya `pcloud`, `onedrive`)
- Hata: `?error=...`

| Endpoint | Açıklama |
|----------|----------|
| `GET /auth/login` | Google auth URL döner |
| `GET /auth/callback` | Google kodu token'a çevirir; `RedirectResponse` ile frontend `/auth/callback?access_token=...&email=...&name=...&picture=...` adresine yönlendirir |
| `GET /users/me` | JWT doğrular, User nesnesi döner |
| `GET /auth/dropbox/login` | Dropbox auth URL |
| `GET /auth/dropbox/callback` | Dropbox token exchange; başarıda `/account?connected=dropbox` |
| `GET /auth/pcloud/login` | pCloud auth URL |
| `GET /auth/pcloud/callback` | pCloud token exchange; başarıda `/account?connected=pcloud` |
| `GET /auth/onedrive/login` | OneDrive auth URL |
| `GET /auth/onedrive/callback` | OneDrive token exchange; başarıda `/account?connected=onedrive` |
| `DELETE /integrations/{source}` | Sağlayıcı bağlantısını keser (token + page_token siler) |

### `backend/dependencies.py`
FastAPI dependency injection:
- `aktif_kullanici_id()` — Bearer token'dan `jwt_dogrula()` çağırır; `user_id` string döner; geçersizse 401. DB sorgusu yapılmaz (hız için).
- `aktif_kullanici()` — `user_id`'den `user_store.getir()` ile DB sorgusu yapar, `User` nesnesi döner; bulunamazsa 401
- `kullanici_tum_credentials()` — `token_store.getir_tum()` çağırır; sonuç boşsa 401 (hiçbir provider bağlı değil)

---

## Frontend Tarafı

### `frontend/src/hooks/useAuth.ts`
`User { email, name, picture }` tipinde bir hook. localStorage'dan user/token okur.
- `logout()` — `access_token` + `user` localStorage'dan siler, `"/"` adresine yönlendirir
- Server validation yapılmaz — sadece localStorage kontrol edilir

Korumalı sayfalar:
```typescript
const { user } = useAuth();
useEffect(() => {
  if (!user) router.push("/");
}, [user]);
```

### `frontend/src/app/page.tsx`
Landing sayfası. `useAuth()` ile login kontrolü yapar; token varsa `/account`'a yönlendirir. "Google ile Giriş Yap" butonu `authApi.login()` çağırır → `{ auth_url }` → `window.location.href = auth_url`.

### `frontend/src/app/auth/callback/page.tsx`
OAuth geri dönüş işleyicisi. URL parametrelerinden (`access_token`, `email`, `name`, `picture`) JWT ve user bilgisini okur, localStorage'a yazar, `/account`'a yönlendirir.

### `frontend/src/app/account/page.tsx`
Bulut sağlayıcı bağlantı yönetimi. 4 kart (GDrive, Dropbox, OneDrive, pCloud): bağlantı durumu, bağlan/bağlantı kes aksiyonları. Ayrıca indeksleme ve senkronizasyon butonları. `searchParams.get("connected")` ile OAuth callback sonucu gösterir.

---

## Akış Özeti

```
Kullanıcı → GET /auth/login → Google → GET /auth/callback
  → JWT üret (sub=user_id, 24h) → RedirectResponse
  → frontend /auth/callback?access_token=...&email=...&name=...&picture=...
  → localStorage'a yaz → /account'a yönlendir
```

```
Provider bağlama → /auth/{provider}/login → OAuth → /auth/{provider}/callback
  → token_store.kaydet(user_id, source, credentials)
  → RedirectResponse → /account?connected={provider}
```
