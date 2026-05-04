"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/common/Navbar";
import { searchApi, thumbnailUrl, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { PhotoResult, SourceKey } from "@/lib/api";

const LIMIT = 12;

// ─── Toast for partial sync errors ─────────────────────────────
function SyncWarningToast({ onDismiss }: { onDismiss: () => void }) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("last_sync_warning");
    if (raw) setWarning(raw);
  }, []);

  if (!warning) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200,
      background: "rgba(26,26,36,0.97)",
      border: "1px solid rgba(251,191,36,0.4)",
      borderRadius: 12,
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      maxWidth: 480,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      animation: "fadeIn 0.3s ease-out",
    }}>
      <span style={{ fontSize: "1.1rem" }}>⚠️</span>
      <p style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--warning)", margin: 0, lineHeight: 1.4 }}>
        {warning}
      </p>
      <button
        onClick={() => {
          localStorage.removeItem("last_sync_warning");
          setWarning(null);
          onDismiss();
        }}
        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem", padding: 4, flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Source filter pills ────────────────────────────────────────
const SOURCES: { key: SourceKey | null; label: string }[] = [
  { key: null,      label: "Tümü"         },
  { key: "gdrive",  label: "Google Drive" },
  { key: "dropbox", label: "Dropbox"      },
];

export default function SearchPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [activeSource, setActiveSource] = useState<SourceKey | null>(null);
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoResult | null>(null);
  const [showToast, setShowToast] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    else inputRef.current?.focus();
  }, [user, loading, router]);

  const search = useCallback(async (q: string, src: SourceKey | null, newOffset = 0, append = false) => {
    if (!q.trim()) return;
    if (newOffset === 0) setIsSearching(true);
    else setLoadingMore(true);
    setError("");

    try {
      const data = await searchApi.search(q, LIMIT, newOffset, src ?? undefined);
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
    setOffset(0);
    setResults([]);
    search(query, activeSource, 0, false);
  };

  const handleSourceChange = (src: SourceKey | null) => {
    setActiveSource(src);
    if (hasSearched && query.trim()) {
      setOffset(0);
      setResults([]);
      search(query, src, 0, false);
    }
  };

  const exampleQueries = [
    "Sahilde gün batımı",
    "Aile yemeği",
    "Köpek parkta",
    "Karlı dağlar",
    "Doğum günü pastası",
    "Şehir gece ışıkları",
  ];

  if (loading || !user) return null;

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 80, minHeight: "100vh" }}>
        {/* Search header */}
        <div style={{
          padding: "32px 24px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          position: "sticky",
          top: 64,
          zIndex: 40,
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <form onSubmit={handleSubmit}>
              <div style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "6px 6px 6px 20px",
                transition: "border-color 0.2s",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "var(--text-muted)" }}>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Fotoğraflarını tarif et..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text)",
                    fontFamily: "var(--font-body)",
                    fontSize: "1.05rem",
                    padding: "8px 0",
                  }}
                />
                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 11,
                    background: query.trim() ? "var(--accent)" : "var(--surface-2)",
                    color: "white",
                    border: "none",
                    cursor: query.trim() ? "pointer" : "not-allowed",
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    transition: "background 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isSearching ? (
                    <span style={{
                      width: 16, height: 16,
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "spin-slow 0.7s linear infinite",
                    }} />
                  ) : null}
                  Ara
                </button>
              </div>
            </form>

            {/* Source filter pills */}
            <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {SOURCES.map(({ key, label }) => {
                const active = activeSource === key;
                const cfg = key ? SOURCE_CONFIG[key] : null;
                return (
                  <button
                    key={String(key)}
                    onClick={() => handleSourceChange(key)}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 100,
                      border: `1px solid ${active ? (cfg?.color ?? "var(--accent)") : "var(--border)"}`,
                      background: active ? (cfg?.bg ?? "rgba(124,109,250,0.15)") : "transparent",
                      color: active ? (cfg?.color ?? "var(--accent)") : "var(--text-muted)",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Example queries */}
            {!hasSearched && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {exampleQueries.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); search(q, activeSource); }}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 100,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
                    }}
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
              padding: "16px 20px",
              borderRadius: 12,
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "var(--error)",
              fontFamily: "var(--font-body)",
              marginBottom: 24,
            }}>
              {error}
            </div>
          )}

          {isSearching && (
            <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 48, height: 48,
                  border: "3px solid var(--border)",
                  borderTop: "3px solid var(--accent)",
                  borderRadius: "50%",
                  animation: "spin-slow 0.8s linear infinite",
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
                {activeSource ? `${SOURCE_CONFIG[activeSource].label} için sonuç yok — "Tümü" filtresini deneyin.` : "Farklı kelimeler deneyin veya önce fotoğraflarınızı indexleyin"}
              </p>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginBottom: 20,
              }}>
                &ldquo;{query}&rdquo; için {results.length} sonuç
                {activeSource && (
                  <span style={{
                    marginLeft: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: SOURCE_CONFIG[activeSource].bg,
                    color: SOURCE_CONFIG[activeSource].color,
                    fontSize: "0.78rem",
                  }}>
                    {SOURCE_CONFIG[activeSource].label}
                  </span>
                )}
              </p>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 16,
              }}>
                {results.map((photo, i) => (
                  <PhotoCard
                    key={photo.file_id}
                    photo={photo}
                    index={i}
                    onClick={() => setSelectedPhoto(photo)}
                  />
                ))}
              </div>

              {hasMore && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
                  <button
                    onClick={() => search(query, activeSource, offset, true)}
                    disabled={loadingMore}
                    style={{
                      padding: "12px 32px",
                      borderRadius: 12,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      cursor: loadingMore ? "not-allowed" : "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {loadingMore ? (
                      <span style={{
                        width: 16, height: 16,
                        border: "2px solid var(--border)",
                        borderTop: "2px solid var(--accent)",
                        borderRadius: "50%",
                        animation: "spin-slow 0.7s linear infinite",
                      }} />
                    ) : null}
                    Daha Fazla Yükle
                  </button>
                </div>
              )}
            </>
          )}

          {!hasSearched && !isSearching && (
            <div style={{ textAlign: "center", padding: "100px 0" }}>
              <div style={{
                width: 80, height: 80,
                borderRadius: "50%",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
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
        <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}

      {showToast && <SyncWarningToast onDismiss={() => setShowToast(false)} />}
    </>
  );
}

// ─── Source Badge ─────────────────────────────────────────────

function SourceBadge({ source }: { source: SourceKey }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <div style={{
      position: "absolute",
      bottom: 8,
      left: 8,
      padding: "2px 8px",
      borderRadius: 5,
      background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(8px)",
      color: cfg.color,
      fontSize: "0.68rem",
      fontFamily: "var(--font-body)",
      fontWeight: 600,
      letterSpacing: "0.03em",
      border: `1px solid ${cfg.color}44`,
    }}>
      {cfg.label.replace("Google ", "G.")}
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
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        cursor: "pointer",
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
        {/* Score badge */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          padding: "3px 8px", borderRadius: 6,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          color: "white", fontSize: "0.72rem", fontFamily: "monospace",
        }}>
          {(photo.score * 100).toFixed(0)}%
        </div>
        {/* Source badge */}
        <SourceBadge source={photo.source} />
      </div>
      <div style={{ padding: "10px 12px" }}>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: "0.82rem", color: "var(--text-muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {photo.filename}
        </p>
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

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 20, maxWidth: 640, width: "100%", overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", background: "var(--surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={photo.filename}
            style={{ width: "100%", maxHeight: 400, objectFit: "contain", display: "block" }}
          />
        </div>

        <div style={{ padding: "20px 24px" }}>
          <p style={{
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem",
            color: "var(--text)", marginBottom: 12, wordBreak: "break-all",
          }}>
            {photo.filename}
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
            <span style={{
              padding: "3px 10px", borderRadius: 6,
              background: "rgba(124,109,250,0.15)", color: "var(--accent)",
              fontSize: "0.8rem", fontFamily: "monospace",
            }}>
              Benzerlik: {(photo.score * 100).toFixed(1)}%
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
                fontSize: "0.78rem", fontFamily: "var(--font-body)",
                overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, whiteSpace: "nowrap",
              }}>
                📁 {photo.folder_path.split("/").slice(-2).join("/")}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a
              href={photo.drive_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                background: cfg.color, color: "white",
                fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem",
                textDecoration: "none", textAlign: "center", transition: "opacity 0.15s",
              }}
            >
              {openLabel}
            </a>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px", borderRadius: 10,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: "var(--text-muted)", fontFamily: "var(--font-display)",
                fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
