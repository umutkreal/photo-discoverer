# PhotoMind

**AI-powered cross-cloud photo manager.** Search your photos with natural language, edit them with AI, and manage duplicates — all in one place across Google Drive, Dropbox, pCloud, and OneDrive.

---

## Features

- **Natural Language Search** — Find photos using plain text queries like *"sunset at the beach"* or *"family dinner 2023"*. Powered by SigLIP (768-dimensional embeddings) and Qdrant vector similarity.
- **AI Editing** — Inpainting, outpainting, style transfer, background removal, restoration, upscaling, and free-form text editing via Replicate.com models. Before/after comparison slider.
- **Multi-Cloud** — Connect Google Drive, Dropbox, pCloud, and OneDrive simultaneously. Search and edit photos from any of them.
- **Smart Sync** — Full indexing on first run, delta sync for subsequent updates. Missed files (e.g. network errors during indexing) are automatically recovered on the next sync.
- **Duplicate Detection** — AI-based similarity grouping with adjustable threshold. Choose which copy to keep, delete the rest from the cloud.
- **Albums** — Create virtual collections from search results without moving files.
- **Index Reset** — Clear the entire vector index from the account page and re-index from scratch.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript |
| Backend | FastAPI, Python 3.13 |
| Embedding | SigLIP `google/siglip-base-patch16-224` — 768d vectors |
| Vector DB | Qdrant Cloud (cosine similarity, per-user collections) |
| Auth | Google OAuth 2.0 (login) + OAuth for each cloud provider |
| AI Editing | Replicate.com (7 models) |
| Database | SQLite — users, OAuth tokens, albums |

---

## Project Structure

```
Bitirmev2/
├── backend/
│   ├── main.py              # FastAPI app, all endpoints
│   ├── embedding.py         # SigLIP wrapper (foto_vektore_cevir, metin_vektore_cevir)
│   ├── sync.py              # Full indexing + delta sync
│   ├── qdrant_db.py         # Qdrant operations
│   ├── auth.py              # Google OAuth flow
│   ├── token_store.py       # SQLite-backed OAuth token store
│   ├── providers/           # GDrive, Dropbox, pCloud, OneDrive adapters
│   └── edit_providers/      # Replicate.com model wrappers
└── frontend/
    └── src/app/
        ├── search/          # Natural language photo search
        ├── edit/            # AI image editor
        ├── albums/          # Album management
        ├── duplicates/      # Duplicate detection & cleanup
        ├── account/         # Cloud connections, indexing, sync
        └── help/            # Usage guide
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Qdrant Cloud](https://qdrant.io) account (free tier works)
- Google Cloud project with OAuth credentials
- Replicate.com API key

### 1. Clone the repo

```bash
git clone https://github.com/UmutKReal/PhotoMind.git
cd PhotoMind
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install fastapi uvicorn[standard] python-dotenv qdrant-client \
            transformers torch sentencepiece pillow httpx python-multipart \
            python-jose cryptography huggingface_hub
```

Create `backend/.env`:

```env
# Qdrant
QDRANT_URL=https://xxxx.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key

# Google OAuth (login)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# JWT
JWT_SECRET_KEY=your_random_secret

# Replicate (AI editing)
REPLICATE_API_TOKEN=your_replicate_token

# Optional: Dropbox, pCloud, OneDrive OAuth
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REDIRECT_URI=http://localhost:8000/auth/dropbox/callback

PCLOUD_CLIENT_ID=
PCLOUD_CLIENT_SECRET=
PCLOUD_REDIRECT_URI=http://localhost:8000/auth/pcloud/callback

ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=
ONEDRIVE_REDIRECT_URI=http://localhost:8000/auth/onedrive/callback

# Optional: HuggingFace token (for gated models)
HUGGINGFACE_TOKEN=
```

Start the backend (SigLIP model downloads on first run, ~350 MB):

```bash
uvicorn main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Sign in** with Google on the home page.
2. Go to **Hesabım** (`/account`) and connect your cloud storage accounts.
3. Click **İndeksleme Başlat** — photos are downloaded, embedded with SigLIP, and stored in Qdrant. First run may take a few minutes.
4. Go to **Arama** (`/search`) and search with natural language.
5. Click any result to open it, then use **AI Düzenle** to edit or **+ Albüm** to save it to a collection.
6. After adding or deleting photos in the cloud, click **Senkronize Et** to update the index.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/index` | Full indexing of all connected providers |
| `DELETE` | `/index` | Clear vector index (keeps collection, resets page tokens) |
| `POST` | `/sync` | Delta sync — only processes changes since last sync |
| `GET` | `/search` | Vector search with optional filters |
| `GET` | `/stats` | Index statistics (total, EXIF coverage, cameras) |
| `GET` | `/integrations` | Connection status for all providers |
| `DELETE` | `/integrations/{source}` | Disconnect a provider |
| `POST` | `/edit` | Run an AI edit operation via Replicate |
| `POST` | `/albums` | Create an album |
| `GET` | `/photos/duplicates` | Find duplicate groups by similarity threshold |

---

## Environment Notes

- Each user gets an isolated Qdrant collection (`user_<uuid>`).
- OAuth tokens for all cloud providers are stored in SQLite (`app.db`), not in-memory.
- SigLIP runs on CPU if a compatible CUDA GPU is not available.
- Deleting a user account removes their Qdrant collection and all DB records.

---

## License

MIT
