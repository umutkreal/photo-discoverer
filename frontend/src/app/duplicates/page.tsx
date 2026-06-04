"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { photoApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { DuplicatePhoto, SourceKey } from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000)     return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes >= 1_000)         return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
}

function scoreBadge(score: number): { label: string; color: string; bg: string } {
  if (score >= 0.99) return { label: "Tam kopya", color: "#f87171", bg: "rgba(213,115,115,0.15)" };
  if (score >= 0.95) return { label: "Benzer kare", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" };
  return { label: "Benzer", color: "#8888aa", bg: "rgba(136,136,170,0.1)" };
}

// ─── Confirm modal ────────────────────────────────────────────

function ConfirmModal({
  toDelete, onConfirm, onCancel, resolving,
}: {
  toDelete: DuplicatePhoto[];
  onConfirm: () => void;
  onCancel: () => void;
  resolving: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !resolving) onCancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, resolving]);

  const sources = [...new Set(toDelete.map((p) => SOURCE_CONFIG[p.source]?.label ?? p.source))];

  return (
    <div onClick={() => !resolving && onCancel()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, animation: "fadeIn 0.2s ease-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface)", border: "1px solid rgba(213,115,115,0.3)",
        borderRadius: 20, maxWidth: 460, width: "100%", padding: "28px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(213,115,115,0.1)", border: "1px solid rgba(213,115,115,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
            Kalıcı Olarak Sil
          </h3>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
            <strong style={{ color: "var(--error)" }}>Bu işlem geri alınamaz.</strong> Aşağıdaki{" "}
            <strong style={{ color: "var(--text)" }}>{toDelete.length} dosya</strong>{" "}
            <strong style={{ color: "var(--text)" }}>{sources.join(" + ")}</strong>&apos;dan kalıcı olarak silinecek.
          </p>
        </div>

        {/* Silinecekler listesi */}
        <div style={{
          maxHeight: 160, overflowY: "auto", marginBottom: 20,
          background: "var(--surface-2)", borderRadius: 10, padding: "8px 12px",
        }}>
          {toDelete.map((p) => {
            const cfg = SOURCE_CONFIG[p.source];
            return (
              <div key={`${p.source}-${p.file_id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg?.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.filename}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: cfg?.color }}>{cfg?.label.replace("Google ", "G.")}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={resolving} style={{
            flex: 1, padding: "11px 0", borderRadius: 10,
            background: "var(--surface-2)", border: "1px solid var(--border)",
            color: "var(--text-muted)", fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: "0.9rem", cursor: resolving ? "not-allowed" : "pointer",
          }}>
            İptal
          </button>
          <button onClick={onConfirm} disabled={resolving} style={{
            flex: 1, padding: "11px 0", borderRadius: 10,
            background: resolving ? "var(--surface-2)" : "var(--error)",
            border: "none", color: resolving ? "var(--text-muted)" : "white",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
            cursor: resolving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {resolving && <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />}
            {resolving ? "Siliniyor..." : "Evet, Sil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Duplicate Group Card ─────────────────────────────────────

function DuplicateGroup({
  group, groupIndex, onResolved,
}: {
  group: DuplicatePhoto[];
  groupIndex: number;
  onResolved: (deletedIds: string[]) => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [keepIdx, setKeepIdx]       = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resolving, setResolving]   = useState(false);
  const [error, setError]           = useState("");
  const [imgErrors, setImgErrors]   = useState<Set<number>>(new Set());

  const maxScore  = Math.max(...group.map((p) => p.score));
  const badge     = scoreBadge(maxScore);
  const groupSize = group.reduce((s, p) => s + (p.file_size ?? 0), 0);
  const savings   = keepIdx !== null
    ? group.filter((_, i) => i !== keepIdx).reduce((s, p) => s + (p.file_size ?? 0), 0)
    : group.slice(1).reduce((s, p) => s + (p.file_size ?? 0), 0);

  const toDelete  = keepIdx !== null ? group.filter((_, i) => i !== keepIdx) : [];
  const deleteLabels = [...new Set(toDelete.map((p) => SOURCE_CONFIG[p.source]?.label?.replace("Google ", "G.") ?? p.source))];

  const handleResolve = async () => {
    if (keepIdx === null || toDelete.length === 0) return;
    setResolving(true);
    setError("");
    try {
      await photoApi.resolve(
        { source: group[keepIdx].source as SourceKey, file_id: group[keepIdx].file_id },
        toDelete.map((p) => ({ source: p.source as SourceKey, file_id: p.file_id })),
      );
      onResolved(toDelete.map((p) => p.file_id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    } finally {
      setResolving(false);
      setShowConfirm(false);
    }
  };

  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${expanded ? "var(--border-2)" : "var(--border)"}`,
      borderRadius: 16, overflow: "hidden",
      animation: `fadeIn 0.4s ease-out ${groupIndex * 0.04}s both`,
      transition: "border-color 0.2s",
    }}>
      {/* Header — kapalıyken tıklanabilir */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
      >
        {/* Temsil thumbnail */}
        <div style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--surface-2)" }}>
          {!imgErrors.has(0) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl(group[0].file_id, group[0].source as SourceKey)}
              alt={group[0].filename}
              onError={() => setImgErrors((s) => new Set([...s, 0]))}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z" stroke="var(--border)" strokeWidth="1.5"/></svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>
              Grup #{groupIndex + 1}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: "0.7rem", fontFamily: "var(--font-body)", fontWeight: 600, background: badge.bg, color: badge.color }}>
              {badge.label}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: "0.7rem", fontFamily: "var(--font-body)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {group.length} dosya
            </span>
            {savings > 0 && (
              <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: "0.7rem", fontFamily: "var(--font-mono)", background: "rgba(132,201,164,0.1)", color: "var(--success)" }}>
                ~{fmtSize(savings)} boşaltılabilir
              </span>
            )}
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {group[0].filename}
          </p>
        </div>

        {/* Arrow */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path d="M6 9l6 6 6-6" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", margin: "12px 0 14px" }}>
            Saklamak istediğin fotoğrafa tıkla — diğerleri silinecek olarak işaretlenir.
          </p>

          {error && (
            <p style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(213,115,115,0.1)", color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.82rem", marginBottom: 12 }}>
              {error}
            </p>
          )}

          {/* Photo grid */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(group.length, 4)}, 1fr)`, gap: 10, marginBottom: 16 }}>
            {group.map((photo, i) => {
              const isKeep   = keepIdx === i;
              const isDelete = keepIdx !== null && !isKeep;
              const cfg      = SOURCE_CONFIG[photo.source as SourceKey];
              return (
                <div
                  key={`${photo.source}-${photo.file_id}`}
                  onClick={() => setKeepIdx(i)}
                  style={{
                    borderRadius: 10, overflow: "hidden",
                    border: `2px solid ${isKeep ? "var(--success)" : isDelete ? "var(--error)" : "var(--border)"}`,
                    cursor: "pointer", transition: "border-color 0.15s",
                    opacity: isDelete ? 0.55 : 1,
                    position: "relative",
                  }}
                >
                  {/* Image */}
                  <div style={{ paddingBottom: "100%", position: "relative", background: "var(--surface-2)" }}>
                    {!imgErrors.has(i) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnailUrl(photo.file_id, photo.source as SourceKey)}
                        alt={photo.filename}
                        onError={() => setImgErrors((s) => new Set([...s, i]))}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z" stroke="var(--border)" strokeWidth="1.5"/></svg>
                      </div>
                    )}
                    {/* Status badge */}
                    {keepIdx !== null && (
                      <div style={{
                        position: "absolute", top: 6, left: 6,
                        padding: "2px 7px", borderRadius: 5, fontSize: "0.68rem",
                        fontFamily: "var(--font-body)", fontWeight: 700,
                        background: isKeep ? "rgba(132,201,164,0.9)" : "rgba(213,115,115,0.85)",
                        color: "white",
                      }}>
                        {isKeep ? "✓ Sakla" : "Sil"}
                      </div>
                    )}
                    {/* Score */}
                    {photo.score < 1.0 && (
                      <div style={{ position: "absolute", top: 6, right: 6, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.7)", color: "white", fontSize: "0.68rem", fontFamily: "monospace" }}>
                        {(photo.score * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ padding: "6px 8px" }}>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: cfg?.color, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cfg?.label.replace("Google ", "G.")}
                    </p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "var(--text-muted)", margin: 0 }}>
                      {photo.file_size ? fmtSize(photo.file_size) : "—"}
                    </p>
                    {photo.folder_path && (
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "0.68rem", color: "var(--text-muted)", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
                        📁 {photo.folder_path.split("/").pop() || photo.folder_path}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action button */}
          {keepIdx !== null && toDelete.length > 0 ? (
            <button
              onClick={() => setShowConfirm(true)}
              style={{
                padding: "10px 20px", borderRadius: 10,
                background: "rgba(213,115,115,0.12)",
                border: "1px solid rgba(213,115,115,0.35)",
                color: "var(--error)", fontFamily: "var(--font-display)",
                fontWeight: 600, fontSize: "0.88rem", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              {deleteLabels.join(" + ")}&apos;dan sil ({toDelete.length} dosya)
            </button>
          ) : keepIdx === null ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              ← Saklamak istediğin fotoğrafa tıkla
            </p>
          ) : null}
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          toDelete={toDelete}
          onConfirm={handleResolve}
          onCancel={() => setShowConfirm(false)}
          resolving={resolving}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DuplicatesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [groups, setGroups]         = useState<DuplicatePhoto[][] | null>(null);
  const [saveableBytes, setSaveableBytes] = useState(0);
  const [scanning, setScanning]     = useState(false);
  const [threshold, setThreshold]   = useState(0.95);
  const [error, setError]           = useState("");

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  const runScan = async () => {
    setScanning(true); setError(""); setGroups(null);
    try {
      const data = await photoApi.duplicates(threshold);
      setGroups(data.groups);
      setSaveableBytes(data.saveable_bytes ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tarama hatası");
    } finally { setScanning(false); }
  };

  const handleResolved = (groupIdx: number, deletedIds: string[]) => {
    if (!groups) return;
    const updated = groups.filter((_, i) => i !== groupIdx);
    setGroups(updated);
    // Yaklaşık olarak savings'i güncelle
    const removedSize = groups[groupIdx]
      .filter((p) => deletedIds.includes(p.file_id))
      .reduce((s, p) => s + (p.file_size ?? 0), 0);
    setSaveableBytes((b) => Math.max(0, b - removedSize));
  };

  if (loading || !user) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, padding: "40px 40px 60px", maxWidth: 900 }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", marginBottom: 6 }}>
            Yinelenenler
          </h1>
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.95rem" }}>
            Benzer fotoğrafları bul, hangisini saklayacağını seç, diğerlerini sil.
          </p>
        </div>

        {/* Summary metrics */}
        {groups !== null && !scanning && (
          <div className="animate-fade-in" style={{
            display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24,
            padding: "14px 20px", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 14,
          }}>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>{groups.length}</p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>duplike grup</p>
            </div>
            {saveableBytes > 0 && (
              <div>
                <p style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800, color: "var(--success)", margin: 0 }}>~{fmtSize(saveableBytes)}</p>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>boşaltılabilir</p>
              </div>
            )}
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
                {groups.reduce((s, g) => s + g.length, 0)}
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>toplam dosya</p>
            </div>
          </div>
        )}

        {/* Scan controls */}
        <div className="animate-fade-in-delay-1" style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 16, padding: "18px 22px", marginBottom: 24,
          display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Benzerlik Eşiği
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min={0.80} max={0.99} step={0.01} value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--accent)", minWidth: 48, textAlign: "right" }}>
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <span style={{ fontSize: "0.7rem", color: "#f87171", fontFamily: "var(--font-body)" }}>● ≥99% tam kopya</span>
              <span style={{ fontSize: "0.7rem", color: "#fbbf24", fontFamily: "var(--font-body)" }}>● 95-99% benzer kare</span>
            </div>
          </div>
          <button onClick={runScan} disabled={scanning} style={{
            padding: "11px 28px", borderRadius: 10,
            background: scanning ? "var(--surface-2)" : "var(--accent)",
            color: scanning ? "var(--text-muted)" : "white",
            border: "none", fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: "0.95rem", cursor: scanning ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
          }}>
            {scanning ? (
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/><path d="M21 21l-4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            )}
            {scanning ? "Taranıyor..." : "Tara"}
          </button>
        </div>

        {/* Error */}
        {error && <div style={{ padding: "14px 18px", borderRadius: 12, marginBottom: 20, background: "rgba(213,115,115,0.1)", border: "1px solid rgba(213,115,115,0.25)", color: "var(--error)", fontFamily: "var(--font-body)" }}>{error}</div>}

        {/* Scanning spinner */}
        {scanning && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 48, height: 48, margin: "0 auto 16px", border: "3px solid var(--border)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin-slow 0.8s linear infinite" }} />
            <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>Vektör benzerliği hesaplanıyor...</p>
          </div>
        )}

        {/* No results */}
        {!scanning && groups !== null && groups.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px", background: "rgba(132,201,164,0.1)", border: "1px solid rgba(132,201,164,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--text)", marginBottom: 8 }}>Yinelenen bulunamadı</p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.9rem" }}>%{(threshold * 100).toFixed(0)} eşiğinde benzer grup yok.</p>
          </div>
        )}

        {/* Groups list */}
        {!scanning && groups && groups.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {groups.map((group, i) => (
              <DuplicateGroup
                key={i}
                group={group}
                groupIndex={i}
                onResolved={(ids) => handleResolved(i, ids)}
              />
            ))}
          </div>
        )}

        {/* Empty start state */}
        {!scanning && groups === null && !error && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/></svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Taramaya hazır</p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.88rem" }}>Yukarıdaki "Tara" butonuna bas.</p>
          </div>
        )}
      </main>
    </div>
  );
}
