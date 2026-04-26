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
  login: () => request<{ auth_url: string }>("/auth/login"),
  me: () => request<{ logged_in_user: { email: string; name: string; picture: string } }>("/auth/me"),
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
  errors: { file: string; error: string }[] | null;
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
  errors?: { file: string; error: string }[] | null;
}
export const syncApi = {
  run: () => request<SyncResult>("/sync", { method: "POST" }),
};

// ─── Search ───
export interface PhotoResult {
  filename: string;
  file_id: string;
  drive_url: string;
  thumbnail_url: string;
  score: number;
}
export interface SearchResponse {
  results: PhotoResult[];
  total_found: number;
  has_more: boolean;
  query: string;
}
export const searchApi = {
  search: (q: string, limit = 12, offset = 0) =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
};
export function thumbnailUrl(file_id: string): string {
  const token = getToken();
  return `${BASE_URL}/thumbnail/${file_id}?token=${token}`;
}