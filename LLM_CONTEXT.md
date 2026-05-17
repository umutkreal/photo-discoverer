# Photo Discovery System - LLM Context

## 1. System Overview & Goal
The system is an AI-powered smart photo search assistant. The goal is to allow users to search their cloud storage photos (Google Drive, Dropbox) using natural language (e.g., "sunset on the beach", "birthday cake"). 

It works by embedding both photos and text queries into the same 512-dimensional vector space using OpenAI's **CLIP model** (`clip-vit-base-patch32`) and storing/querying these vectors in **Qdrant Vector Database**.

## 2. Current Achieved Status
**Status: ✅ Core System Functional (Backend + Frontend)**
- **Authentication:** Google and Dropbox OAuth2 flows are implemented. JWT tokens are used for stateless frontend-backend session management. Cloud provider credentials are saved in memory.
- **Indexing & Sync:** Full folder/drive indexing and delta synchronization (detecting changes/deletions) are working.
- **Search:** Natural language search is working using Cosine Similarity on CLIP embeddings. It supports filtering by source, EXIF year, and camera make.
- **Photo Management:** Finding duplicate photos (based on vector similarity >=0.95) and deleting photos permanently from cloud & Qdrant is functional.
- **Albums:** Cross-cloud virtual albums are working, backed by a local SQLite DB.
- **Metadata Extraction:** EXIF and GPS data extraction from photos (year, camera make, lat/lon) is implemented and passed to Qdrant payloads.

## 3. Backend Architecture (Python / FastAPI)
The backend is a FastAPI application located in the `backend/` directory.

### Key Components & Responsibilities:
- **`main.py`**: The FastAPI application entry point. Registers endpoints for auth, indexing, sync, search, duplicates, and albums.
- **`auth.py` & `jwt_handler.py`**: Manages Google/Dropbox OAuth and stateless JWT tokens.
- **`token_store.py`**: In-memory dictionary for storing user Cloud API credentials and sync page tokens. (Note: Data is lost on server restart, planned transition to Redis).
- **`embedding.py`**: Wraps the Hugging Face `transformers` CLIP model (`openai/clip-vit-base-patch32`). Handles conversion of PIL Images and text strings to normalized 512-dim vectors.
- **`qdrant_db.py`**: Manages connections to Qdrant Cloud. Handles collection creation (isolated per user: `photos_{email_hash}`), inserting points, deleting points, and finding duplicates based on similarity threshold.
- **`sync.py`**: Orchestrates `index_all` (full initial index) and `delta_sync` (fetching only changes since last page_token).
- **`providers/`**: Implements a Factory pattern (`providers/factory.py`) to handle different cloud APIs. Currently active: Google Drive (`gdrive.py`) and Dropbox (`dropbox.py`). Handles listing files, downloading images directly to RAM (no disk writing), and extracting EXIF data.
- **`album_store.py`**: A SQLite-backed store (`albums.db`) for creating cross-provider virtual albums. Does not copy files; only saves `(source, file_id)` references.

### Qdrant Payload Structure:
When a photo is embedded, the following metadata is saved alongside the vector:
```json
{
  "filename": "IMG_123.jpg",
  "file_id": "cloud_file_id_123",
  "drive_url": "https://...",
  "source": "gdrive",          // or "dropbox"
  "folder_path": "/Photos/2023",
  "file_size": 1024000,
  "year": 2023,                // EXIF extracted
  "month": 10,                 // EXIF extracted
  "date_taken": "2023:10:15",  // EXIF extracted
  "camera_make": "Apple",      // EXIF extracted
  "camera_model": "iPhone 13", // EXIF extracted
  "lat": 41.0082,              // EXIF extracted
  "lon": 28.9784               // EXIF extracted
}
```

## 4. Frontend Architecture (Next.js)
The frontend is a Next.js (App Router) application located in the `frontend/` directory, written in TypeScript and styled with Tailwind CSS.

### Key Pages:
- `/`: Landing page & Login with Google.
- `/dashboard`: Triggers for Initial Indexing and Delta Sync.
- `/search`: Search grid interface. Connects to `GET /search`.
- `/duplicates`: UI for finding and resolving duplicate photos.
- `/albums` & `/albums/[id]`: Management of virtual photo albums.
- `/settings/integrations`: Managing active cloud provider connections (Drive, Dropbox).

## 5. Important API Endpoints
- `GET /auth/login`, `GET /auth/callback`: Initialize Google OAuth and exchange tokens.
- `GET /auth/dropbox/login`, `GET /auth/dropbox/callback`: Dropbox OAuth flows.
- `POST /index`: Run a full photo indexing task across all connected providers.
- `POST /sync`: Run a delta sync (fetch new/deleted photos since last run).
- `GET /search`: Search text (via `q` param). Supports pagination (`limit`, `offset`) and EXIF filtering (`year_from`, `year_to`, `camera_make`, `source`).
- `GET /photos/duplicates` & `POST /photos/duplicates/resolve`: Identify and remove duplicate images from both vector DB and Cloud.
- `POST /albums`, `GET /albums`, `POST /albums/{id}/photos`: Virtual album CRUD.
- `GET /thumbnail`: Proxies image thumbnail requests dynamically directly from memory.

## 6. How It Works (Example Flow)
1. User logs in via Google (`/auth/login`). Frontend receives a JWT token.
2. User initiates full index (`/index`). The backend's `index_all` loops through the Cloud providers.
3. For each file, the provider downloads it directly to RAM. 
4. EXIF data is extracted.
5. The `embedding.py` processes the PIL image through CLIP to generate a 512-dim vector.
6. The vector and metadata payload are written to Qdrant (using a deterministic point ID derived from `file_id`).
7. User searches "birthday cake" (`/search`). The text is passed to CLIP text encoder, producing a 512-dim vector.
8. Qdrant performs Cosine Similarity search, returning the most relevant photos.
9. Frontend displays images using `/thumbnail` proxy or direct CDN links.

## 7. Known Limitations / Future Work
- **Token Storage:** `token_store.py` currently relies on an in-memory dictionary. A server restart logs all users out and breaks syncing until re-authenticated. Needs migration to Redis.
- **Provider Coverage:** OneDrive and pCloud exist as boilerplates in `providers/` but are currently disabled.
