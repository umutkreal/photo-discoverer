"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/common/Navbar";
import { photoApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { DuplicatePhoto, SourceKey } from "@/lib/api";

// ─── Delete confirmation modal ────────────────────────────────

interface DeleteModalProps {
  photo: DuplicatePhoto;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteModal({ photo, onConfirm, onCancel, deleting }: DeleteModalProps) {
  const cfg = SOURCE_CONFIG[photo.source];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleting) onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, deleting]);

  return (
    <div
      onClick={() => !deleting && onCancel()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 20, maxWidth: 440, width: "100%", padding: "28px 28px 24px",
        }}
      >
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{
            fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 700,
            color: "var(--text)", margin: "0 0 8px",
          }}>
            Kalıcı Olarak Sil?
          </h3>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "0.88rem", color: "var(--text-muted)",
            lineHeight: 1.5, margin: 0,
          }}>
            Bu işlem <strong style={{ color: "var(--text)" }}>{photo.filename}</strong> dosyasını{" "}
            <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span> hesabınızdan
            kalıcı olarak silecektir. Bu işlem geri alınamaz.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--text-muted)", fontFamily: "var(--font-display)",
              fontWeight: 600, fontSize: "0.9rem", cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              background: deleting ? "var(--surface-2)" : "var(--error)",
              border: "none", color: deleting ? "var(--text-muted)" : "white",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
              cursor: deleting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {deleting && (
              <span style={{
                width: 14, height: 14,
                border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white",
                borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
              }} />
            )}
            {deleting ? "Siliniyor..." : "Evet, Sil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Photo card in duplicate group ────────────────────────────

interface DupeCardProps {
  photo: DuplicatePhoto;
  isDeleted: boolean;
  onDeleteClick: () => void;
}

function DupeCard({ photo, isDeleted, onDeleteClick }: DupeCardProps) {
  const [imgError, setImgError] = useState(false);
  const cfg = SOURCE_CONFIG[photo.source];
  const imgSrc = thumbnailUrl(photo.file_id, photo.source);

  if (isDeleted) {
    return (
      <div style={{
        borderRadius: 14, overflow: "hidden", background: "var(--surface-2)",
        border: "1px solid var(--border)", opacity: 0.4,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: 220, padding: 24,
      }}>
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Silindi
        </p>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden", background: "var(--surface)",
      border: `1px solid ${cfg.color}33`,
      display: "flex", flexDirection: "column",
    }}>
      {/* Image */}
      <div style={{ position: "relative", paddingBottom: "75%", background: "var(--surface-2)", flexShrink: 0 }}>
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={photo.filename}
            onError={() => setImgError(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z" stroke="var(--border)" strokeWidth="1.5"/>
              <circle cx="9" cy="11" r="2" stroke="var(--border)" strokeWidth="1.5"/>
            </svg>
          </div>
        )}
        {/* Source badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          padding: "3px 8px", borderRadius: 5,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
          color: cfg.color, fontSize: "0.7rem", fontFamily: "var(--font-body)", fontWeight: 700,
          border: `1px solid ${cfg.color}44`,
        }}>
          {cfg.label.replace("Google ", "G.")}
        </div>
        {/* Similarity badge */}
        {photo.score < 1.0 && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            padding: "3px 8px", borderRadius: 5,
            background: "rgba(0,0,0,0.75)", color: "white",
            fontSize: "0.7rem", fontFamily: "monospace",
          }}>
            {(photo.score * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "0.82rem", color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
        }}>
          {photo.filename}
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {photo.file_size > 0 && (
            <span style={{
              padding: "2px 7px", borderRadius: 4, fontSize: "0.72rem",
              fontFamily: "monospace", background: "var(--surface-2)", color: "var(--text-muted)",
            }}>
              {photo.file_size >= 1_000_000
                ? `${(photo.file_size / 1_000_000).toFixed(1)} MB`
                : `${Math.round(photo.file_size / 1000)} KB`}
            </span>
          )}
          {photo.folder_path && (
            <span style={{
              padding: "2px 7px", borderRadius: 4, fontSize: "0.72rem",
              fontFamily: "var(--font-body)", background: "var(--surface-2)", color: "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, whiteSpace: "nowrap",
            }}>
              📁 {photo.folder_path.split("/").pop() || photo.folder_path}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <a
            href={photo.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: "7px 0", borderRadius: 8,
              background: cfg.bg, color: cfg.color,
              fontFamily: "var(--font-body)", fontSize: "0.8rem", fontWeight: 600,
              textDecoration: "none", textAlign: "center", transition: "opacity 0.15s",
            }}
          >
            Kaynakta Gör
          </a>
          <button
            onClick={onDeleteClick}
            style={{
              flex: 1, padding: "7px 0", borderRadius: 8,
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.8rem",
              fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Duplicate group ──────────────────────────────────────────

function DuplicateGroup({ group, groupIndex }: { group: DuplicatePhoto[]; groupIndex: number }) {
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<DuplicatePhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      await photoApi.delete(pendingDelete.source, pendingDelete.file_id);
      setDeleted((prev) => new Set([...prev, pendingDelete.file_id]));
      setPendingDelete(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = group.filter((p) => !deleted.has(p.file_id)).length;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 20, padding: "20px 24px", marginBottom: 20,
      animation: `fadeIn 0.4s ease-out ${groupIndex * 0.06}s both`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: "0.8rem", fontWeight: 700,
          color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Grup #{groupIndex + 1}
        </span>
        <span style={{
          padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem",
          background: "rgba(248,113,113,0.1)", color: "var(--error)",
          border: "1px solid rgba(248,113,113,0.25)",
          fontFamily: "var(--font-body)",
        }}>
          {group.length} kopya
        </span>
        {deleted.size > 0 && (
          <span style={{
            padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem",
            background: "rgba(74,222,128,0.1)", color: "var(--success)",
            border: "1px solid rgba(74,222,128,0.25)",
            fontFamily: "var(--font-body)",
          }}>
            {deleted.size} silindi
          </span>
        )}
        {activeCount <= 1 && deleted.size > 0 && (
          <span style={{
            padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem",
            background: "rgba(74,222,128,0.15)", color: "var(--success)",
            fontFamily: "var(--font-body)", fontWeight: 600,
          }}>
            ✓ Temizlendi
          </span>
        )}
      </div>

      {error && (
        <p style={{
          padding: "8px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)",
          color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.82rem", marginBottom: 12,
        }}>
          {error}
        </p>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(group.length, 3)}, 1fr)`,
        gap: 12,
      }}>
        {group.map((photo) => (
          <DupeCard
            key={photo.file_id}
            photo={photo}
            isDeleted={deleted.has(photo.file_id)}
            onDeleteClick={() => setPendingDelete(photo)}
          />
        ))}
      </div>

      {pendingDelete && (
        <DeleteModal
          photo={pendingDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => !deleting && setPendingDelete(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DuplicatesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [groups, setGroups] = useState<DuplicatePhoto[][] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [threshold, setThreshold] = useState(0.97);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const runScan = async () => {
    setScanning(true);
    setError("");
    setGroups(null);
    try {
      const data = await photoApi.duplicates(threshold);
      setGroups(data.groups);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Tarama hatası");
    } finally {
      setScanning(false);
    }
  };

  if (loading || !user) return null;

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 96, paddingBottom: 60, maxWidth: 900, margin: "0 auto", padding: "96px 24px 60px" }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 800,
            letterSpacing: "-0.03em", color: "var(--text)", marginBottom: 8,
          }}>
            Yinelenenler
          </h1>
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.95rem" }}>
            Farklı bulutlardaki benzer fotoğrafları yan yana karşılaştır ve istediğini sil.
          </p>
        </div>

        {/* Scan controls */}
        <div className="animate-fade-in-delay-1" style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 16, padding: "20px 24px", marginBottom: 28,
          display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{
              display: "block", fontSize: "0.78rem", color: "var(--text-muted)",
              fontFamily: "var(--font-body)", marginBottom: 6,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              Benzerlik Eşiği
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                min={0.85}
                max={0.99}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)", cursor: "pointer" }}
              />
              <span style={{
                fontFamily: "monospace", fontSize: "0.9rem", color: "var(--accent)",
                minWidth: 48, textAlign: "right",
              }}>
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
              Yüksek eşik = sadece çok yakın kopyalar. Düşük eşik = daha fazla sonuç.
            </p>
          </div>

          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              padding: "12px 28px", borderRadius: 10,
              background: scanning ? "var(--surface-2)" : "var(--accent)",
              color: scanning ? "var(--text-muted)" : "white",
              border: "none", fontFamily: "var(--font-display)", fontWeight: 600,
              fontSize: "0.95rem", cursor: scanning ? "not-allowed" : "pointer",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            }}
          >
            {scanning ? (
              <span style={{
                width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)",
                borderTop: "2px solid white", borderRadius: "50%",
                animation: "spin-slow 0.7s linear infinite",
              }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/>
                <path d="M21 21l-4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            {scanning ? "Taranıyor..." : "Tara"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 24,
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
            color: "var(--error)", fontFamily: "var(--font-body)",
          }}>
            {error}
          </div>
        )}

        {/* Scanning state */}
        {scanning && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 48, height: 48, margin: "0 auto 16px",
                border: "3px solid var(--border)", borderTop: "3px solid var(--accent)",
                borderRadius: "50%", animation: "spin-slow 0.8s linear infinite",
              }} />
              <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}>
                Vektör benzerliği hesaplanıyor...
              </p>
            </div>
          </div>
        )}

        {/* No results */}
        {!scanning && groups !== null && groups.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
              background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--text)", marginBottom: 8 }}>
              Yinelenen bulunamadı
            </p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              %{(threshold * 100).toFixed(0)} eşiğinde benzer fotoğraf grubu yok.
            </p>
          </div>
        )}

        {/* Results */}
        {!scanning && groups && groups.length > 0 && (
          <>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: "0.85rem",
              color: "var(--text-muted)", marginBottom: 20,
            }}>
              {groups.length} yinelenen grup bulundu — toplam{" "}
              {groups.reduce((sum, g) => sum + g.length, 0)} fotoğraf
            </p>
            {groups.map((group, i) => (
              <DuplicateGroup key={i} group={group} groupIndex={i} />
            ))}
          </>
        )}

        {/* Empty start state */}
        {!scanning && groups === null && !error && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <rect x="14" y="14" width="6" height="6" rx="1.5" stroke="var(--text-muted)" strokeWidth="1.5"/>
              </svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>
              Taramaya hazır
            </p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Yukarıdaki "Tara" butonuna bas. İndekslenmiş tüm fotoğraflar karşılaştırılacak.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
