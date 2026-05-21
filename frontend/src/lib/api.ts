const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    window.location.href = "/";
    throw new Error("Oturum süresi doldu");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API Error: ${res.status}`);
  }

  return res.json();
}

// ─── Auth ───
export const authApi = {
  login:         () => request<{ auth_url: string }>("/auth/login"),
  me:            () => request<{ logged_in_user: { email: string; name: string; picture: string } }>("/auth/me"),
  dropboxLogin:  () => request<{ auth_url: string }>("/auth/dropbox/login"),
  pcloudLogin:   () => request<{ auth_url: string }>("/auth/pcloud/login"),
  onedriveLogin: () => request<{ auth_url: string }>("/auth/onedrive/login"),
};

// ─── Index ───
export interface IndexRequest {
  folder_id?: string;
  limit?: number;
}
export interface IndexResult {
  message: string;
  collection: string;
  indexed: number;
  total_found: number;
  errors: { source?: string; file: string; error: string }[] | null;
}
export const indexApi = {
  start: (body: IndexRequest) =>
    request<IndexResult>("/index", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Sync ───
export interface SyncResult {
  message: string;
  synced: boolean;
  added?: number;
  deleted?: number;
  errors?: { source?: string; file?: string; action?: string; error: string }[] | null;
}
export const syncApi = {
  run: () => request<SyncResult>("/sync", { method: "POST" }),
};

// ─── Search ───
export type SourceKey = "gdrive" | "dropbox" | "pcloud" | "onedrive";

export interface PhotoResult {
  filename: string;
  file_id: string;
  drive_url: string;
  thumbnail_url: string;
  source: SourceKey;
  folder_path: string;
  score: number;
  file_size?: number;
  // EXIF — opsiyonel, yoksa undefined
  year?: number;
  month?: number;
  date_taken?: string;
  camera_make?: string;
  camera_model?: string;
  lat?: number;
  lon?: number;
}
export interface SearchFilters {
  source?: SourceKey;
  year_from?: number;
  year_to?: number;
  camera_make?: string;
}
export interface SearchResponse {
  results: PhotoResult[];
  total_found: number;
  has_more: boolean;
  query: string;
}
export interface StatsResponse {
  total: number;
  with_exif: number;
  with_gps: number;
  camera_makes: string[];
}
export const searchApi = {
  search: (q: string, limit = 12, offset = 0, filters: SearchFilters = {}) => {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) });
    if (filters.source)     params.set("source",      filters.source);
    if (filters.year_from)  params.set("year_from",   String(filters.year_from));
    if (filters.year_to)    params.set("year_to",     String(filters.year_to));
    if (filters.camera_make) params.set("camera_make", filters.camera_make);
    return request<SearchResponse>(`/search?${params}`);
  },
  stats: () => request<StatsResponse>("/stats"),
};

export function thumbnailUrl(file_id: string, source: SourceKey = "gdrive"): string {
  const token = getToken();
  const params = new URLSearchParams({ file_id, source, token: token ?? "" });
  return `${BASE_URL}/thumbnail?${params}`;
}

// ─── Integrations ───
export interface ProviderStatus {
  connected: boolean;
  label: string;
  disabled?: boolean;   // true → kod mevcut ama entegrasyon şimdilik kapalı
}
export type IntegrationsResponse = Record<SourceKey, ProviderStatus>;

export const integrationApi = {
  status: () => request<IntegrationsResponse>("/integrations"),
  revoke: (source: SourceKey) =>
    request<{ message: string; source: string }>(`/integrations/${source}`, { method: "DELETE" }),
};

// ─── Photos (delete, duplicates) ───
export interface DuplicatePhoto {
  file_id: string;
  filename: string;
  source: SourceKey;
  drive_url: string;
  file_size: number;
  folder_path: string;
  score: number;
}
export interface DuplicatesResponse {
  groups: DuplicatePhoto[][];
  total_groups: number;
}

export interface ResolveResult {
  resolved: number;
  results: { source: string; file_id: string; cloud_deleted: boolean; index_deleted: boolean; error?: string }[];
}
export const photoApi = {
  delete: (source: SourceKey, file_id: string) =>
    request<{ deleted: boolean; cloud_deleted: boolean }>(
      `/photos/${source}/${encodeURIComponent(file_id)}`,
      { method: "DELETE" },
    ),
  duplicates: (threshold = 0.95, limit = 300) =>
    request<DuplicatesResponse & { saveable_bytes: number }>(
      `/photos/duplicates?threshold=${threshold}&limit=${limit}`,
    ),
  resolve: (keep: { source: SourceKey; file_id: string }, del: { source: SourceKey; file_id: string }[]) =>
    request<ResolveResult>("/photos/duplicates/resolve", {
      method: "POST",
      body: JSON.stringify({ keep, delete: del }),
    }),
};

// ─── Albums ───
export interface AlbumPhoto {
  source:      SourceKey;
  file_id:     string;
  filename:    string;
  drive_url:   string;
  folder_path: string;
  file_size:   number;
  added_at:    string;
}
export interface Album {
  album_id:    string;
  owner:       string;
  name:        string;
  created_at:  string;
  photo_count: number;
  photos?:     AlbumPhoto[];
}
export const albumApi = {
  list:   () => request<{ albums: Album[] }>("/albums"),
  get:    (id: string) => request<Album & { photos: AlbumPhoto[] }>(`/albums/${id}`),
  create: (name: string) => request<Album>("/albums", { method: "POST", body: JSON.stringify({ name }) }),
  rename: (id: string, name: string) =>
    request<{ message: string }>(`/albums/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  delete: (id: string) => request<{ message: string }>(`/albums/${id}`, { method: "DELETE" }),
  addPhoto: (album_id: string, photo: Omit<AlbumPhoto, "added_at">) =>
    request<{ message: string }>(`/albums/${album_id}/photos`, {
      method: "POST", body: JSON.stringify(photo),
    }),
  removePhoto: (album_id: string, source: SourceKey, file_id: string) => {
    const p = new URLSearchParams({ source, file_id });
    return request<{ message: string }>(`/albums/${album_id}/photos?${p}`, { method: "DELETE" });
  },
};

// ─── AI Edit ───
export interface NewEditRequest {
  source: string;
  file_id: string;
  image_b64?: string;
  edit_provider?: string;
  islem: string;
  prompt?: string;
  maske_b64?: string;
  guc?: number;
  yon?: string;
  genisletme_px?: number;
  olcek?: number;
  aciklama?: string;
}
export interface NewEditResult {
  sonuc_b64: string;
  mime_type: string;
  islem: string;
  edit_provider: string;
  model: string;
  boyut: { genislik: number; yukseklik: number };
  hata?: string;
}
export interface CloudSaveRequest {
  image_b64: string;
  filename: string;
  source: string;
  folder?: string;
}
export interface CloudSaveResult {
  success: boolean;
  file: { id: string; name: string; drive_url: string };
}
export const editApi = {
  edit: (body: NewEditRequest) =>
    request<NewEditResult>("/edit", { method: "POST", body: JSON.stringify(body) }),
  saveOnCloud: (body: CloudSaveRequest) =>
    request<CloudSaveResult>("/saveOnCloud", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Source config (shared UI helpers) ───
export const SOURCE_CONFIG: Record<SourceKey, { label: string; color: string; bg: string }> = {
  gdrive:   { label: "Google Drive", color: "#4285F4", bg: "rgba(66,133,244,0.15)" },
  dropbox:  { label: "Dropbox",      color: "#0061FF", bg: "rgba(0,97,255,0.15)"  },
  pcloud:   { label: "pCloud",       color: "#20BFFF", bg: "rgba(32,191,255,0.15)" },
  onedrive: { label: "OneDrive",     color: "#0078D4", bg: "rgba(0,120,212,0.15)" },
};
