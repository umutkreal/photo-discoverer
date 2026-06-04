"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { albumApi, photoApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { Album, AlbumPhoto, SourceKey } from "@/lib/api";

function SourceDot({ source }: { source: SourceKey }) {
  const color = SOURCE_CONFIG[source]?.color ?? "#888";
  return <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, border: "1.5px solid rgba(0,0,0,0.4)", flexShrink: 0 }} title={SOURCE_CONFIG[source]?.label} />;
}

function Lightbox({ photos, initialIndex, onClose, onRemove, onDeleteFromCloud }: {
  photos: AlbumPhoto[]; initialIndex: number;
  onClose: () => void; onRemove: (p: AlbumPhoto) => void;
  onDeleteFromCloud: (p: AlbumPhoto) => Promise<void>;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");
  const stripRef      = useRef<HTMLDivElement>(null);
  const photo         = photos[idx];
  const cfg           = photo ? SOURCE_CONFIG[photo.source] : null;

  useEffect(() => { setDeleteState("idle"); }, [idx]);

  const handleDelete = async () => {
    if (!photo) return;
    setDeleteState("deleting");
    try {
      await onDeleteFromCloud(photo);
    } catch {
      setDeleteState("idle");
    }
  };

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteState === "confirm") { setDeleteState("idle"); return; }
        onClose();
      }
      if (e.key === "ArrowLeft" && deleteState === "idle") prev();
      if (e.key === "ArrowRight" && deleteState === "idle") next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, prev, next, deleteState]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const thumb = strip.children[idx] as HTMLElement;
    if (thumb) thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [idx]);

  if (!photo || !cfg) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", backdropFilter: "blur(20px)",
      zIndex: 100, display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out",
    }}>

      {/* ─── Onay overlay ─── */}
      {(deleteState === "confirm" || deleteState === "deleting") && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", inset: 0, zIndex: 10,
          background: "rgba(10,10,18,0.82)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.15s ease-out",
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 16, padding: "28px 32px", maxWidth: 360, width: "90%",
            textAlign: "center", boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
              background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
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
                  background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.6)",
                  color: "var(--error)", fontFamily: "var(--font-display)",
                  fontWeight: 600, fontSize: "0.9rem",
                  cursor: deleteState === "deleting" ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}
              >
                {deleteState === "deleting" && (
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(248,113,113,0.3)", borderTop: "2px solid var(--error)", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
                )}
                {deleteState === "deleting" ? "Siliniyor…" : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {idx + 1} / {photos.length}
        </span>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "white", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
      </div>

      {/* Image + arrows */}
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0, padding: "0 64px" }}>
        {idx > 0 && (
          <button onClick={prev} style={{ position: "absolute", left: 12, background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: 44, height: 44, borderRadius: "50%", cursor: "pointer", fontSize: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnailUrl(photo.file_id, photo.source)} alt={photo.filename}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
        {idx < photos.length - 1 && (
          <button onClick={next} style={{ position: "absolute", right: 12, background: "rgba(255,255,255,0.1)", border: "none", color: "white", width: 44, height: 44, borderRadius: "50%", cursor: "pointer", fontSize: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        )}
      </div>

      {/* Metadata */}
      <div onClick={(e) => e.stopPropagation()} style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem", color: "white", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.filename}</span>
        <span style={{ padding: "2px 10px", borderRadius: 5, background: cfg.bg, color: cfg.color, fontSize: "0.78rem", fontFamily: "var(--font-body)", fontWeight: 600 }}>{cfg.label}</span>
        {photo.folder_path && <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>📁 {photo.folder_path.split("/").slice(-2).join("/")}</span>}
        {photo.file_size > 0 && <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{photo.file_size >= 1_000_000 ? `${(photo.file_size / 1_000_000).toFixed(1)} MB` : `${Math.round(photo.file_size / 1000)} KB`}</span>}
        <div style={{ flex: 1 }} />
        <a href={photo.drive_url} target="_blank" rel="noopener noreferrer" style={{ padding: "5px 14px", borderRadius: 7, background: cfg.color, color: "white", textDecoration: "none", fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 600 }}>
          {cfg.label.replace("Google ", "G.")}&apos;da Aç
        </a>
        <button onClick={() => onRemove(photo)} style={{ padding: "5px 14px", borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.8rem", cursor: "pointer" }}>
          Çıkar
        </button>
        <button onClick={() => setDeleteState("confirm")} style={{ padding: "5px 14px", borderRadius: 7, background: "transparent", border: "1px solid rgba(248,113,113,0.4)", color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.8rem", cursor: "pointer", whiteSpace: "nowrap" }}>
          Buluttan Sil
        </button>
      </div>

      {/* Thumbnail strip */}
      <div onClick={(e) => e.stopPropagation()} ref={stripRef} style={{ display: "flex", gap: 6, padding: "10px 24px 20px", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" }}>
        {photos.map((p, i) => (
          <div key={`${p.source}-${p.file_id}`} onClick={() => setIdx(i)} style={{
            width: 60, height: 60, flexShrink: 0, borderRadius: 6, overflow: "hidden",
            border: `2px solid ${i === idx ? "#4285F4" : "transparent"}`,
            cursor: "pointer", opacity: i === idx ? 1 : 0.55, transition: "opacity 0.15s, border-color 0.15s",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl(p.file_id, p.source)} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

type ViewMode = "grid" | "lightbox";

export default function AlbumDetailPage() {
  const router            = useRouter();
  const { id }            = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [album, setAlbum]             = useState<(Album & { photos: AlbumPhoto[] }) | null>(null);
  const [fetching, setFetching]       = useState(true);
  const [viewMode, setViewMode]       = useState<ViewMode>("grid");
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [renaming, setRenaming]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [removing, setRemoving]       = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    albumApi.get(id)
      .then(setAlbum)
      .catch(() => router.push("/albums"))
      .finally(() => setFetching(false));
  }, [user, id, router]);

  const handleRemove = async (photo: AlbumPhoto) => {
    if (!album) return;
    const key = `${photo.source}-${photo.file_id}`;
    setRemoving(key);
    try {
      await albumApi.removePhoto(album.album_id, photo.source, photo.file_id);
      const updated = album.photos.filter((p) => !(p.source === photo.source && p.file_id === photo.file_id));
      setAlbum({ ...album, photos: updated });
      if (updated.length === 0) setViewMode("grid");
      else setLightboxIdx((i) => Math.min(i, updated.length - 1));
    } catch {}
    finally { setRemoving(null); }
  };

  const handleDeleteFromCloud = async (photo: AlbumPhoto) => {
    if (!album) return;
    await photoApi.delete(photo.source, photo.file_id);
    try { await albumApi.removePhoto(album.album_id, photo.source, photo.file_id); } catch {}
    window.location.reload();
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!album || !newName.trim()) return;
    try {
      await albumApi.rename(album.album_id, newName.trim());
      setAlbum({ ...album, name: newName.trim() });
      setRenaming(false);
    } catch {}
  };

  if (loading || !user || fetching) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", display: "flex", justifyContent: "center", paddingTop: 120 }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin-slow 0.8s linear infinite" }} />
        </div>
      </div>
    );
  }

  if (!album) return null;
  const photos = album.photos;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, padding: "40px 40px 60px", maxWidth: 1100 }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
          <div>
            <Link href="/albums" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.85rem", textDecoration: "none", display: "inline-block", marginBottom: 8 }}>
              ← Albümler
            </Link>
            {renaming ? (
              <form onSubmit={handleRename} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: "6px 12px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--accent)", color: "var(--text)", fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800, outline: "none" }} />
                <button type="submit" style={{ padding: "6px 14px", borderRadius: 8, background: "var(--accent)", color: "white", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>Kaydet</button>
                <button type="button" onClick={() => setRenaming(false)} style={{ padding: "6px 14px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>İptal</button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", margin: 0 }}>{album.name}</h1>
                <button onClick={() => { setNewName(album.name); setRenaming(true); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                </button>
              </div>
            )}
            <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.85rem", marginTop: 4 }}>
              {photos.length} fotoğraf · {album.created_at.slice(0, 10)}
            </p>
          </div>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
            {(["grid", "lightbox"] as ViewMode[]).map((mode) => (
              <button key={mode}
                onClick={() => { if (mode === "lightbox" && photos.length > 0) setViewMode("lightbox"); else setViewMode("grid"); }}
                disabled={mode === "lightbox" && photos.length === 0}
                style={{
                  padding: "7px 14px", borderRadius: 7, border: "none",
                  background: viewMode === mode ? "var(--accent)" : "transparent",
                  color: viewMode === mode ? "white" : "var(--text-muted)",
                  fontFamily: "var(--font-body)", fontSize: "0.82rem",
                  cursor: photos.length === 0 && mode === "lightbox" ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {mode === "grid" ? "⊞ Grid" : "⬛ Lightbox"}
              </button>
            ))}
          </div>
        </div>

        {/* Empty */}
        {photos.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Albüm boş</p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.88rem" }}>
              <Link href="/search" style={{ color: "var(--accent)" }}>Arama sayfasından</Link> fotoğraf ekleyebilirsin.
            </p>
          </div>
        )}

        {/* Grid */}
        {photos.length > 0 && viewMode === "grid" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {photos.map((photo, i) => {
              const key = `${photo.source}-${photo.file_id}`;
              return (
                <div key={key} style={{
                  borderRadius: 12, overflow: "hidden", background: "var(--surface)",
                  border: "1px solid var(--border)", cursor: "pointer",
                  transition: "transform 0.15s, border-color 0.15s",
                  animation: `fadeIn 0.3s ease-out ${i * 0.03}s both`,
                  opacity: removing === key ? 0.4 : 1,
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.borderColor = SOURCE_CONFIG[photo.source]?.color ?? "var(--accent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
                >
                  <div onClick={() => { setLightboxIdx(i); setViewMode("lightbox"); }} style={{ position: "relative", paddingBottom: "100%", background: "var(--surface-2)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbnailUrl(photo.file_id, photo.source)} alt={photo.filename} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", top: 8, left: 8 }}>
                      <SourceDot source={photo.source} />
                    </div>
                  </div>
                  <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <p style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                      {photo.filename}
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); handleRemove(photo); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = "var(--error)"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {viewMode === "lightbox" && photos.length > 0 && (
        <Lightbox photos={photos} initialIndex={lightboxIdx} onClose={() => setViewMode("grid")} onRemove={handleRemove} onDeleteFromCloud={handleDeleteFromCloud} />
      )}
    </div>
  );
}
