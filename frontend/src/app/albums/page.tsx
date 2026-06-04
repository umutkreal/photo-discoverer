"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { albumApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { Album } from "@/lib/api";

export default function AlbumsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [albums, setAlbums]     = useState<Album[]>([]);
  const [fetching, setFetching] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    albumApi.list()
      .then((r) => setAlbums(r.albums))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setError("");
    try {
      const album = await albumApi.create(newName.trim());
      setAlbums((prev) => [album, ...prev]);
      setNewName(""); setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu");
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu albümü silmek istediğinizden emin misiniz?")) return;
    try {
      await albumApi.delete(id);
      setAlbums((prev) => prev.filter((a) => a.album_id !== id));
    } catch {}
  };

  if (loading || !user) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, padding: "40px 40px 60px", maxWidth: 860 }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 36, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", marginBottom: 6 }}>
              Albümler
            </h1>
            <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.95rem" }}>
              Farklı bulutlardaki fotoğrafları bir araya getir.
            </p>
          </div>
          <button onClick={() => setShowForm((v) => !v)} style={{
            padding: "10px 20px", borderRadius: 10, background: "var(--accent)",
            color: "white", border: "none", fontFamily: "var(--font-display)",
            fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
            Yeni Albüm
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="animate-fade-in" style={{
            background: "var(--surface)", border: "1px solid var(--border-2)",
            borderRadius: 14, padding: "18px 20px", marginBottom: 24,
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Albüm adı..."
              style={{
                flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 9,
                background: "var(--bg)", border: "1px solid var(--border)",
                color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "0.95rem", outline: "none",
              }}
            />
            <button type="submit" disabled={creating || !newName.trim()} style={{
              padding: "9px 20px", borderRadius: 9, background: "var(--accent)",
              color: "white", border: "none", fontFamily: "var(--font-display)",
              fontWeight: 600, fontSize: "0.88rem",
              cursor: creating || !newName.trim() ? "not-allowed" : "pointer",
            }}>
              {creating ? "Oluşturuluyor..." : "Oluştur"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{
              padding: "9px 14px", borderRadius: 9, background: "transparent",
              border: "1px solid var(--border)", color: "var(--text-muted)",
              fontFamily: "var(--font-body)", fontSize: "0.88rem", cursor: "pointer",
            }}>
              İptal
            </button>
            {error && <span style={{ color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.82rem" }}>{error}</span>}
          </form>
        )}

        {/* Loading */}
        {fetching && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{ width: 36, height: 36, border: "3px solid var(--border)", borderTop: "3px solid var(--accent)", borderRadius: "50%", animation: "spin-slow 0.8s linear infinite" }} />
          </div>
        )}

        {/* Empty */}
        {!fetching && albums.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="6" width="18" height="14" rx="2" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <path d="M3 10h18" stroke="var(--text-muted)" strokeWidth="1.5"/>
                <path d="M8 3l4 3 4-3" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)", marginBottom: 8 }}>Henüz albüm yok</p>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Arama sonuçlarından fotoğraf ekleyerek albüm oluşturabilirsin.
            </p>
          </div>
        )}

        {/* Album grid */}
        {!fetching && albums.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {albums.map((album, i) => (
              <div key={album.album_id} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, overflow: "hidden",
                animation: `fadeIn 0.4s ease-out ${i * 0.05}s both`,
                transition: "border-color 0.2s, transform 0.2s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
              >
                <Link href={`/albums/${album.album_id}`} style={{ textDecoration: "none", display: "block" }}>
                  <div style={{
                    height: 120, background: "var(--surface-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="6" width="18" height="14" rx="2" stroke="var(--border-2)" strokeWidth="1.5"/>
                      <path d="M3 10h18" stroke="var(--border-2)" strokeWidth="1.5"/>
                      <path d="M8 3l4 3 4-3" stroke="var(--border-2)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div style={{ padding: "14px 16px 10px" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", color: "var(--text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {album.name}
                    </p>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {album.photo_count} fotoğraf · {album.created_at.slice(0, 10)}
                    </p>
                  </div>
                </Link>
                <div style={{ padding: "0 16px 12px", display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => handleDelete(album.album_id)} style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", fontSize: "0.75rem", fontFamily: "var(--font-body)", padding: "2px 0",
                  }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.color = "var(--error)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
