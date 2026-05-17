"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/common/Navbar";
import { searchApi, albumApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { PhotoResult, SourceKey, SearchFilters, StatsResponse, Album } from "@/lib/api";

const LIMIT = 12;

// ─── Sync warning toast ───────────────────────────────────────

function SyncWarningToast({ onDismiss }: { onDismiss: () => void }) {
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("last_sync_warning");
    if (raw) setWarning(raw);
  }, []);
  if (!warning) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 200, background: "rgba(26,26,36,0.97)",
      border: "1px solid rgba(251,191,36,0.4)", borderRadius: 12,
      padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
      maxWidth: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeIn 0.3s ease-out",
    }}>
      <span style={{ fontSize: "1.1rem" }}>⚠️</span>
      <p style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--warning)", margin: 0, lineHeight: 1.4 }}>
        {warning}
      </p>
      <button onClick={() => { localStorage.removeItem("last_sync_warning"); setWarning(null); onDismiss(); }}
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem", padding: 4 }}>
        ✕
      </button>
    </div>
  );
}

// ─── Source filter pills ──────────────────────────────────────

const SOURCES: { key: SourceKey | null; label: string }[] = [
  { key: null,      label: "Tümü"         },
  { key: "gdrive",  label: "Google Drive" },
  { key: "dropbox", label: "Dropbox"      },
];

// ─── EXIF filter panel ────────────────────────────────────────

interface FilterPanelProps {
  filters: SearchFilters;
  stats: StatsResponse | null;
  onChange: (f: SearchFilters) => void;
}

function FilterPanel({ filters, stats, onChange }: FilterPanelProps) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "16px 20px", marginTop: 12,
      display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end",
      animation: "fadeIn 0.2s ease-out",
    }}>
      {/* Yıl aralığı */}
      <div>
        <label style={labelStyle}>Yıl aralığı</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number" placeholder="2018" min={1990} max={2100}
            value={filters.year_from ?? ""}
            onChange={(e) => onChange({ ...filters, year_from: e.target.value ? Number(e.target.value) : undefined })}
            style={inputStyle}
          />
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>–</span>
          <input
            type="number" placeholder="2025" min={1990} max={2100}
            value={filters.year_to ?? ""}
            onChange={(e) => onChange({ ...filters, year_to: e.target.value ? Number(e.target.value) : undefined })}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Kamera markası */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Kamera / Marka</label>
        {stats && stats.camera_makes.length > 0 ? (
          <select
            value={filters.camera_make ?? ""}
            onChange={(e) => onChange({ ...filters, camera_make: e.target.value || undefined })}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">Tümü</option>
            {stats.camera_makes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            type="text" placeholder="Apple, Samsung..."
            value={filters.camera_make ?? ""}
            onChange={(e) => onChange({ ...filters, camera_make: e.target.value || undefined })}
            style={inputStyle}
          />
        )}
      </div>

      {/* Temizle */}
      {(filters.year_from || filters.year_to || filters.camera_make) && (
        <button
          onClick={() => onChange({ ...filters, year_from: undefined, year_to: undefined, camera_make: undefined })}
          style={{
            padding: "8px 14px", borderRadius: 8, background: "transparent",
            border: "1px solid var(--border)", color: "var(--text-muted)",
            fontFamily: "var(--font-body)", fontSize: "0.82rem", cursor: "pointer",
          }}
        >
          Temizle
        </button>
      )}

      {/* EXIF istatistik */}
      {stats && (
        <div style={{ width: "100%", display: "flex", gap: 16, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
          <StatChip label="Toplam" value={stats.total} />
          <StatChip label="EXIF var" value={stats.with_exif} total={stats.total} color="var(--accent)" />
          <StatChip label="GPS var" value={stats.with_gps} total={stats.total} color="#10b981" />
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, total, color }: { label: string; value: number; total?: number; color?: string }) {
  return (
    <span style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: color ?? "var(--text-muted)" }}>
      {label}: <strong style={{ color: color ?? "var(--text)" }}>{value}</strong>
      {total ? <span style={{ color: "var(--text-muted)" }}>/{total}</span> : null}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.72rem", color: "var(--text-muted)",
  fontFamily: "var(--font-body)", marginBottom: 5,
  textTransform: "uppercase", letterSpacing: "0.04em",
};
const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, width: "100%",
  background: "var(--bg)", border: "1px solid var(--border)",
  color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "0.88rem", outline: "none",
};

// ─── Source Badge ─────────────────────────────────────────────

function SourceBadge({ source }: { source: SourceKey }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <div style={{
      position: "absolute", bottom: 8, left: 8,
      padding: "2px 8px", borderRadius: 5,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      color: cfg.color, fontSize: "0.68rem", fontFamily: "var(--font-body)", fontWeight: 600,
      border: `1px solid ${cfg.color}44`,
    }}>
      {cfg.label.replace("Google ", "G.")}
    </div>
  );
}

// ─── Add to Album button ──────────────────────────────────────

function AddToAlbumButton({ photo }: { photo: PhotoResult }) {
  const [open, setOpen]       = useState(false);
  const [albums, setAlbums]   = useState<Album[]>([]);
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState<string | null>(null);

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true); setBusy(true);
    try { const r = await albumApi.list(); setAlbums(r.albums); } catch {}
    finally { setBusy(false); }
  };

  const handleAdd = async (e: React.MouseEvent, albumId: string) => {
    e.stopPropagation();
    try {
      await albumApi.addPhoto(albumId, {
        source: photo.source, file_id: photo.file_id,
        filename: photo.filename, drive_url: photo.drive_url,
        folder_path: photo.folder_path, file_size: photo.file_size ?? 0,
      });
      setDone(albumId);
      setTimeout(() => { setOpen(false); setDone(null); }, 800);
    } catch {}
  };

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={handleOpen} style={{
        padding: "4px 10px", borderRadius: 6,
        background: "rgba(124,109,250,0.15)", border: "1px solid rgba(124,109,250,0.3)",
        color: "var(--accent)", fontSize: "0.72rem", fontFamily: "var(--font-body)",
        cursor: "pointer", whiteSpace: "nowrap",
      }}>
        + Albüm
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 8, minWidth: 180, zIndex: 50,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)", animation: "fadeIn 0.15s ease-out",
        }}>
          {busy && <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", padding: "4px 8px", margin: 0 }}>Yükleniyor...</p>}
          {!busy && albums.length === 0 && <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", padding: "4px 8px", margin: 0 }}>Albüm yok — önce oluştur</p>}
          {!busy && albums.map((a) => (
            <button key={a.album_id} onClick={(e) => handleAdd(e, a.album_id)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "7px 10px", borderRadius: 7, border: "none",
              background: done === a.album_id ? "rgba(74,222,128,0.15)" : "transparent",
              color: done === a.album_id ? "var(--success)" : "var(--text)",
              fontFamily: "var(--font-body)", fontSize: "0.82rem", cursor: "pointer",
            }}>
              {done === a.album_id ? "✓ Eklendi" : a.name}
            </button>
          ))}
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "5px 10px", borderRadius: 7, border: "none",
            background: "transparent", color: "var(--text-muted)",
            fontFamily: "var(--font-body)", fontSize: "0.75rem", cursor: "pointer",
            borderTop: "1px solid var(--border)", marginTop: 4,
          }}>
            Kapat
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Photo Card ───────────────────────────────────────────────

function PhotoCard({ photo, index, onClick }: { photo: PhotoResult; index: number; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = thumbnailUrl(photo.file_id, photo.source);
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 14, overflow: "hidden", background: "var(--surface)",
        border: "1px solid var(--border)", cursor: "pointer",
        transition: "transform 0.2s, border-color 0.2s",
        animation: `fadeIn 0.4s ease-out ${index * 0.04}s both`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = SOURCE_CONFIG[photo.source]?.color ?? "var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
      }}
    >
      <div style={{ position: "relative", paddingBottom: "75%", background: "var(--surface-2)" }}>
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={photo.filename} onError={() => setImgError(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z" stroke="var(--border)" strokeWidth="1.5"/>
              <circle cx="9" cy="11" r="2" stroke="var(--border)" strokeWidth="1.5"/>
            </svg>
          </div>
        )}
        <div style={{
          position: "absolute", top: 8, right: 8, padding: "3px 8px", borderRadius: 6,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          color: "white", fontSize: "0.72rem", fontFamily: "monospace",
        }}>
          {(photo.score * 100).toFixed(0)}%
        </div>
        <SourceBadge source={photo.source} />
      </div>
      <div style={{ padding: "10px 12px" }}>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "0.82rem", color: "var(--text-muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {photo.filename}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          {(photo.year || photo.camera_make) ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "var(--text-muted)", opacity: 0.7, margin: 0 }}>
              {[photo.year, photo.camera_make].filter(Boolean).join(" · ")}
            </p>
          ) : <span />}
          <AddToAlbumButton photo={photo} />
        </div>
      </div>
    </div>
  );
}

// ─── Photo Modal ──────────────────────────────────────────────

function PhotoModal({ photo, onClose }: { photo: PhotoResult; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const cfg = SOURCE_CONFIG[photo.source];
  const imgSrc = thumbnailUrl(photo.file_id, photo.source);
  const openLabel = `${cfg.label.replace("Google ", "G.")}'da Aç`;

  const exifItems = [
    photo.date_taken   && { label: "Tarih",   value: photo.date_taken.slice(0, 10) },
    photo.camera_make  && { label: "Kamera",  value: [photo.camera_make, photo.camera_model].filter(Boolean).join(" ") },
    photo.lat != null  && { label: "Konum",   value: `${photo.lat?.toFixed(4)}, ${photo.lon?.toFixed(4)}` },
    photo.file_size    && { label: "Boyut",   value: photo.file_size >= 1_000_000 ? `${(photo.file_size / 1_000_000).toFixed(1)} MB` : `${Math.round(photo.file_size / 1000)} KB` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, animation: "fadeIn 0.2s ease-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 20, maxWidth: 640, width: "100%", overflow: "hidden",
      }}>
        <div style={{ position: "relative", background: "var(--surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgSrc} alt={photo.filename}
            style={{ width: "100%", maxHeight: 400, objectFit: "contain", display: "block" }} />
        </div>
        <div style={{ padding: "20px 24px" }}>
          <p style={{
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem",
            color: "var(--text)", marginBottom: 12, wordBreak: "break-all",
          }}>
            {photo.filename}
          </p>

          {/* Badges */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{
              padding: "3px 10px", borderRadius: 6,
              background: "rgba(124,109,250,0.15)", color: "var(--accent)",
              fontSize: "0.8rem", fontFamily: "monospace",
            }}>
              {(photo.score * 100).toFixed(1)}%
            </span>
            <span style={{
              padding: "3px 10px", borderRadius: 6,
              background: cfg.bg, color: cfg.color,
              fontSize: "0.8rem", fontFamily: "var(--font-body)", fontWeight: 600,
            }}>
              {cfg.label}
            </span>
            {photo.folder_path && (
              <span style={{
                padding: "3px 10px", borderRadius: 6,
                background: "var(--surface-2)", color: "var(--text-muted)",
                fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: 200, whiteSpace: "nowrap",
              }}>
                📁 {photo.folder_path.split("/").slice(-2).join("/")}
              </span>
            )}
          </div>

          {/* EXIF tablo */}
          {exifItems.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px",
              marginBottom: 16, padding: "10px 12px",
              background: "var(--surface-2)", borderRadius: 10,
            }}>
              {exifItems.map(({ label, value }) => (
                <React.Fragment key={label}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text)" }}>
                    {value}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <a href={photo.drive_url} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: cfg.color, color: "white",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
              textDecoration: "none", textAlign: "center",
            }}>
              {openLabel}
            </a>
            <button onClick={onClose} style={{
              padding: "10px 20px", borderRadius: 10,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--text-muted)", fontFamily: "var(--font-display)",
              fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
            }}>
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [query, setQuery]           = useState("");
  const [filters, setFilters]       = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats]           = useState<StatsResponse | null>(null);
  const [results, setResults]       = useState<PhotoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore]       = useState(false);
  const [offset, setOffset]         = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoResult | null>(null);
  const [showToast, setShowToast]   = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    else inputRef.current?.focus();
  }, [user, loading, router]);

  // Filtre paneli açıldığında istatistikleri yükle
  useEffect(() => {
    if (showFilters && !stats && user) {
      searchApi.stats().then(setStats).catch(() => {});
    }
  }, [showFilters, stats, user]);

  const search = useCallback(async (q: string, f: SearchFilters, newOffset = 0, append = false) => {
    if (!q.trim()) return;
    if (newOffset === 0) setIsSearching(true);
    else setLoadingMore(true);
    setError("");
    try {
      const data = await searchApi.search(q, LIMIT, newOffset, f);
      setResults((prev) => append ? [...prev, ...data.results] : data.results);
      setHasMore(data.has_more);
      setOffset(newOffset + LIMIT);
      setHasSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Arama hatası");
    } finally {
      setIsSearching(false);
      setLoadingMore(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0); setResults([]);
    search(query, filters, 0, false);
  };

  const handleFiltersChange = (f: SearchFilters) => {
    setFilters(f);
    if (hasSearched && query.trim()) {
      setOffset(0); setResults([]);
      search(query, f, 0, false);
    }
  };

  const handleSourceChange = (src: SourceKey | null) => {
    const f = { ...filters, source: src ?? undefined };
    handleFiltersChange(f);
  };

  const hasActiveFilters = !!(filters.year_from || filters.year_to || filters.camera_make);
  const activeFilterCount = [filters.year_from, filters.year_to, filters.camera_make].filter(Boolean).length;

  const exampleQueries = [
    "Sahilde gün batımı", "Aile yemeği", "Köpek parkta",
    "Karlı dağlar", "Doğum günü pastası", "Şehir gece ışıkları",
  ];

  if (loading || !user) return null;

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 80, minHeight: "100vh" }}>
        {/* Search header */}
        <div style={{
          padding: "32px 24px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg)", position: "sticky", top: 64, zIndex: 40,
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <form onSubmit={handleSubmit}>
              <div style={{
                display: "flex", gap: 12, alignItems: "center",
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, padding: "6px 6px 6px 20px",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <input
                  ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Fotoğraflarını tarif et..."
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "1.05rem", padding: "8px 0",
                  }}
                />
                {/* Filtre toggle */}
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  style={{
                    padding: "8px 14px", borderRadius: 10,
                    background: (showFilters || hasActiveFilters) ? "rgba(124,109,250,0.15)" : "var(--surface-2)",
                    border: `1px solid ${(showFilters || hasActiveFilters) ? "var(--accent)" : "var(--border)"}`,
                    color: (showFilters || hasActiveFilters) ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--font-body)", fontSize: "0.82rem", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Filtre{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
                <button
                  type="submit" disabled={isSearching || !query.trim()}
                  style={{
                    padding: "10px 22px", borderRadius: 11,
                    background: query.trim() ? "var(--accent)" : "var(--surface-2)",
                    color: "white", border: "none",
                    cursor: query.trim() ? "pointer" : "not-allowed",
                    fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
                    display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                  }}
                >
                  {isSearching && (
                    <span style={{
                      width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)",
                      borderTop: "2px solid white", borderRadius: "50%",
                      animation: "spin-slow 0.7s linear infinite",
                    }} />
                  )}
                  Ara
                </button>
              </div>
            </form>

            {/* Source filter pills */}
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SOURCES.map(({ key, label }) => {
                const active = (filters.source ?? null) === key;
                const cfg = key ? SOURCE_CONFIG[key] : null;
                return (
                  <button key={String(key)} onClick={() => handleSourceChange(key)} style={{
                    padding: "4px 14px", borderRadius: 100,
                    border: `1px solid ${active ? (cfg?.color ?? "var(--accent)") : "var(--border)"}`,
                    background: active ? (cfg?.bg ?? "rgba(124,109,250,0.15)") : "transparent",
                    color: active ? (cfg?.color ?? "var(--accent)") : "var(--text-muted)",
                    fontSize: "0.8rem", cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.15s",
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* EXIF filter panel */}
            {showFilters && (
              <FilterPanel filters={filters} stats={stats} onChange={handleFiltersChange} />
            )}

            {/* Example queries */}
            {!hasSearched && !showFilters && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {exampleQueries.map((q) => (
                  <button key={q} onClick={() => { setQuery(q); search(q, filters); }}
                    style={{
                      padding: "5px 14px", borderRadius: 100, background: "var(--surface)",
                      border: "1px solid var(--border)", color: "var(--text-muted)",
                      fontSize: "0.82rem", cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
          {error && (
            <div style={{
              padding: "16px 20px", borderRadius: 12, marginBottom: 24,
              background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
              color: "var(--error)", fontFamily: "var(--font-body)",
            }}>
              {error}
            </div>
          )}

          {isSearching && (
            <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 48, height: 48, margin: "0 auto 16px",
                  border: "3px solid var(--border)", borderTop: "3px solid var(--accent)",
                  borderRadius: "50%", animation: "spin-slow 0.8s linear infinite",
                }} />
                <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>
                  CLIP ile aranıyor...
                </p>
              </div>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text)", marginBottom: 8 }}>
                Sonuç bulunamadı
              </p>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {hasActiveFilters ? "Filtreleri gevşetin veya temizleyin." : "Farklı kelimeler deneyin veya önce fotoğraflarınızı indexleyin."}
              </p>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 20 }}>
                &ldquo;{query}&rdquo; için {results.length} sonuç
                {filters.source && (
                  <span style={{
                    marginLeft: 8, padding: "2px 8px", borderRadius: 4,
                    background: SOURCE_CONFIG[filters.source].bg, color: SOURCE_CONFIG[filters.source].color, fontSize: "0.78rem",
                  }}>
                    {SOURCE_CONFIG[filters.source].label}
                  </span>
                )}
                {filters.year_from && <span style={{ marginLeft: 6, color: "var(--accent)", fontSize: "0.78rem" }}>{filters.year_from}+</span>}
                {filters.camera_make && <span style={{ marginLeft: 6, color: "var(--accent)", fontSize: "0.78rem" }}>{filters.camera_make}</span>}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {results.map((photo, i) => (
                  <PhotoCard key={photo.file_id} photo={photo} index={i} onClick={() => setSelectedPhoto(photo)} />
                ))}
              </div>

              {hasMore && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
                  <button
                    onClick={() => search(query, filters, offset, true)} disabled={loadingMore}
                    style={{
                      padding: "12px 32px", borderRadius: 12, background: "var(--surface)",
                      border: "1px solid var(--border)", color: "var(--text)",
                      fontFamily: "var(--font-display)", fontWeight: 600,
                      cursor: loadingMore ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {loadingMore && <span style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTop: "2px solid var(--accent)", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />}
                    Daha Fazla Yükle
                  </button>
                </div>
              )}
            </>
          )}

          {!hasSearched && !isSearching && (
            <div style={{ textAlign: "center", padding: "100px 0" }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
                background: "var(--surface)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="var(--text-muted)" strokeWidth="1.5"/>
                  <path d="M21 21l-4-4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--text)", marginBottom: 8 }}>
                Ne arıyorsun?
              </p>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Yukarıya bir şeyler yaz ve ara
              </p>
            </div>
          )}
        </div>
      </main>

      {selectedPhoto && <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />}
      {showToast && <SyncWarningToast onDismiss={() => setShowToast(false)} />}
    </>
  );
}
