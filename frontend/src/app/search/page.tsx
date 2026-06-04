"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { searchApi, albumApi, photoApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
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
  { key: null,       label: "Tümü"         },
  { key: "gdrive",   label: "Google Drive" },
  { key: "dropbox",  label: "Dropbox"      },
  { key: "pcloud",   label: "pCloud"       },
  { key: "onedrive", label: "OneDrive"     },
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


// ─── Add to Album button ──────────────────────────────────────

function AddToAlbumButton({ photo }: { photo: PhotoResult }) {
  const [open, setOpen]         = useState(false);
  const [albums, setAlbums]     = useState<Album[]>([]);
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const wrapperRef              = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false); setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 50);
  }, [creating]);

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); setCreating(false); setNewName(""); return; }
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
      setTimeout(() => { setOpen(false); setDone(null); setCreating(false); setNewName(""); }, 900);
    } catch {}
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const name = newName.trim();
    if (!name) return;
    setCreateBusy(true);
    try {
      const album = await albumApi.create(name);
      await albumApi.addPhoto(album.album_id, {
        source: photo.source, file_id: photo.file_id,
        filename: photo.filename, drive_url: photo.drive_url,
        folder_path: photo.folder_path, file_size: photo.file_size ?? 0,
      });
      setDone(album.album_id);
      setAlbums((prev) => [...prev, { ...album, photo_count: 1 }]);
      setTimeout(() => { setOpen(false); setDone(null); setCreating(false); setNewName(""); }, 900);
    } catch {}
    finally { setCreateBusy(false); }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button onClick={handleOpen} style={{
        padding: "4px 10px", borderRadius: 6,
        background: open ? "var(--accent-soft)" : "#111",
        border: "1px solid transparent",
        color: "#fff", fontSize: "0.72rem", fontFamily: "var(--font-body)",
        cursor: "pointer", whiteSpace: "nowrap",
      }}>
        + Albüm
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", right: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 8, minWidth: 210, zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeIn 0.15s ease-out",
        }}>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "var(--text-muted)",
            padding: "2px 8px 6px", margin: 0, borderBottom: "1px solid var(--border)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            Albüme ekle
          </p>

          {busy && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", padding: "8px 8px 4px", margin: 0 }}>
              Yükleniyor...
            </p>
          )}

          {!busy && albums.length === 0 && !creating && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", padding: "8px 8px 2px", margin: 0 }}>
              Henüz albüm yok
            </p>
          )}

          {!busy && albums.map((a) => (
            <button key={a.album_id} onClick={(e) => handleAdd(e, a.album_id)} style={{
              display: "flex", width: "100%", alignItems: "center", gap: 8, textAlign: "left",
              padding: "7px 10px", borderRadius: 7, border: "none",
              background: done === a.album_id ? "rgba(132,201,164,0.15)" : "transparent",
              color: done === a.album_id ? "var(--success)" : "var(--text)",
              fontFamily: "var(--font-body)", fontSize: "0.82rem", cursor: "pointer",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => { if (done !== a.album_id) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { if (done !== a.album_id) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {done === a.album_id
                ? <><span style={{ color: "var(--success)" }}>✓</span> Eklendi</>
                : <><span style={{ fontSize: "0.85rem" }}>🖼</span> {a.name}</>
              }
            </button>
          ))}

          {/* Yeni albüm oluştur */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
            {!creating ? (
              <button
                onClick={(e) => { e.stopPropagation(); setCreating(true); }}
                style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, border: "none",
                  background: "transparent", color: "var(--text)",
                  fontFamily: "var(--font-body)", fontSize: "0.82rem", cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Yeni albüm oluştur ve ekle
              </button>
            ) : (
              <form onSubmit={handleCreateAndAdd} onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, padding: "4px 2px" }}>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Albüm adı..."
                  disabled={createBusy}
                  onKeyDown={(e) => { if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                  style={{
                    flex: 1, padding: "6px 9px", borderRadius: 7,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "0.82rem",
                    outline: "none", minWidth: 0,
                  }}
                />
                <button
                  type="submit"
                  disabled={createBusy || !newName.trim()}
                  style={{
                    padding: "6px 10px", borderRadius: 7, border: "none",
                    background: newName.trim() ? "var(--accent)" : "var(--surface-2)",
                    color: newName.trim() ? "#fff" : "var(--text-muted)",
                    fontFamily: "var(--font-body)", fontSize: "0.8rem",
                    cursor: newName.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  {createBusy
                    ? <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
                    : "Oluştur"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Photo Card ───────────────────────────────────────────────

function PhotoCard({ photo, index, onClick }: { photo: PhotoResult; index: number; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = thumbnailUrl(photo.file_id, photo.source);
  const cfg = SOURCE_CONFIG[photo.source];
  const textColor = cfg.light ? "#15212b" : "#fff";
  const metaColor = cfg.light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.72)";
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 14, background: "var(--surface)",
        border: "1px solid var(--border)", cursor: "pointer",
        transition: "transform 0.2s, border-color 0.2s",
        animation: `fadeIn 0.4s ease-out ${index * 0.04}s both`,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
      }}
    >
      <div style={{ position: "relative", paddingBottom: "75%", background: "var(--surface-2)", borderRadius: "14px 14px 0 0", overflow: "hidden" }}>
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
        {/* Score — transparent bg */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          color: "#fff", fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 600,
          textShadow: "0 1px 4px rgba(0,0,0,0.85)",
        }}>
          {(photo.score * 100).toFixed(0)}%
        </div>
      </div>
      {/* Source-colored card body */}
      <div style={{ padding: "10px 12px", background: cfg.srcBg }}>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "0.85rem", color: textColor,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
        }}>
          {photo.filename}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", fontWeight: 700, color: "#000" }}>
            {SOURCE_CONFIG[photo.source].label}
          </span>
          <AddToAlbumButton photo={photo} />
        </div>
        {(photo.year || photo.camera_make) && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.58rem", color: metaColor, margin: "3px 0 0" }}>
            {[photo.year, photo.camera_make].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Photo Modal ──────────────────────────────────────────────

function PhotoModal({ photo, onClose, onEditClick, onDelete }: { photo: PhotoResult; onClose: () => void; onEditClick: () => void; onDelete: (file_id: string) => void }) {
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting" | "error">("idle");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteState === "confirm") { setDeleteState("idle"); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, deleteState]);

  const handleDelete = async () => {
    setDeleteState("deleting");
    try {
      await photoApi.delete(photo.source, photo.file_id);
      onDelete(photo.file_id);
      window.location.reload();
    } catch {
      setDeleteState("error");
      setTimeout(() => setDeleteState("idle"), 2500);
    }
  };

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
        position: "relative",
      }}>

        {/* ─── Onay overlay ─── */}
        {(deleteState === "confirm" || deleteState === "deleting") && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(10,10,18,0.82)", backdropFilter: "blur(6px)",
            borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "fadeIn 0.15s ease-out",
          }}>
            <div style={{
              background: "var(--surface)", border: "1px solid rgba(213,115,115,0.35)",
              borderRadius: 16, padding: "28px 32px", maxWidth: 360, width: "90%",
              textAlign: "center", boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
                background: "rgba(213,115,115,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", color: "var(--text)", marginBottom: 8 }}>
                Fotoğrafı sil?
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 24 }}>
                Bu fotoğrafı silmek istediğinizden emin misiniz?<br />Bu işlem geri alınamaz.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setDeleteState("idle")}
                  disabled={deleteState === "deleting"}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    color: "var(--text-muted)", fontFamily: "var(--font-display)",
                    fontWeight: 600, fontSize: "0.9rem",
                    cursor: deleteState === "deleting" ? "not-allowed" : "pointer",
                  }}
                >
                  İptal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteState === "deleting"}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    background: "rgba(213,115,115,0.15)", border: "1px solid rgba(213,115,115,0.6)",
                    color: "var(--error)", fontFamily: "var(--font-display)",
                    fontWeight: 600, fontSize: "0.9rem",
                    cursor: deleteState === "deleting" ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  }}
                >
                  {deleteState === "deleting" && (
                    <span style={{ width: 14, height: 14, border: "2px solid rgba(213,115,115,0.3)", borderTop: "2px solid var(--error)", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
                  )}
                  {deleteState === "deleting" ? "Siliniyor…" : "Evet, Sil"}
                </button>
              </div>
            </div>
          </div>
        )}
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
              background: "rgba(255,255,255,0.1)", color: "var(--text)",
              fontSize: "0.8rem", fontFamily: "var(--font-mono)",
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
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--text)" }}>
                    {value}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {deleteState === "error" && (
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.82rem", color: "var(--error)", marginBottom: 10, textAlign: "center" }}>
              Silinemedi — tekrar dene.
            </p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setDeleteState("confirm")} style={{
              padding: "10px 16px", borderRadius: 10,
              background: "transparent", border: "1px solid rgba(213,115,115,0.5)",
              color: "var(--error)", fontFamily: "var(--font-display)",
              fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              Sil
            </button>
            <a href={photo.drive_url} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              background: cfg.color, color: "white",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
              textDecoration: "none", textAlign: "center",
            }}>
              {openLabel}
            </a>
            <button onClick={onEditClick} style={{
              padding: "10px 16px", borderRadius: 10,
              background: "var(--accent-grad)",
              border: "none", color: "white",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
              whiteSpace: "nowrap",
            }}>
              AI Düzenle
            </button>
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

  if (loading || !user) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, minHeight: "100vh" }}>
        {/* Search header */}
        <div style={{
          padding: "32px 24px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg)", position: "sticky", top: 0, zIndex: 40,
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
                    background: (showFilters || hasActiveFilters) ? "var(--accent-soft)" : "var(--surface-2)",
                    border: `1px solid ${(showFilters || hasActiveFilters) ? "var(--accent-2)" : "var(--border)"}`,
                    color: (showFilters || hasActiveFilters) ? "var(--text)" : "var(--text-muted)",
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
                    background: query.trim() ? "var(--accent-grad)" : "var(--surface-2)",
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
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SOURCES.map(({ key, label }) => {
                const active = (filters.source ?? null) === key;
                return (
                  <button key={String(key)} onClick={() => handleSourceChange(key)} style={{
                    padding: "6px 21px", borderRadius: 100,
                    border: `1px solid ${active ? "var(--border-2)" : "var(--border)"}`,
                    background: active ? "var(--surface-2)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                    fontWeight: active ? 500 : 400,
                    fontSize: "1.2rem", cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.15s",
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

          </div>
        </div>

        {/* Results */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
          {error && (
            <div style={{
              padding: "16px 20px", borderRadius: 12, marginBottom: 24,
              background: "rgba(213,115,115,0.1)", border: "1px solid rgba(213,115,115,0.25)",
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
                    background: SOURCE_CONFIG[filters.source].srcBg,
                    color: SOURCE_CONFIG[filters.source].light ? "#000" : "#fff",
                    fontSize: "0.78rem", fontWeight: 600,
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

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onEditClick={() => {
            const p = new URLSearchParams({ file_id: selectedPhoto.file_id, source: selectedPhoto.source });
            router.push(`/edit?${p}`);
          }}
          onDelete={(file_id) => {
            setResults((prev) => prev.filter((p) => p.file_id !== file_id));
            setSelectedPhoto(null);
          }}
        />
      )}
      {showToast && <SyncWarningToast onDismiss={() => setShowToast(false)} />}
    </div>
  );
}
