"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/common/Sidebar";
import { integrationApi, authApi, indexApi, syncApi, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { IntegrationsResponse, SourceKey, IndexResult } from "@/lib/api";

// ─── Provider icons ───────────────────────────────────────────

function GDriveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.5 18.5L8 12.5L2 12.5L4.5 18.5Z" fill="#4285F4"/>
      <path d="M8 12.5L4.5 18.5H15.5L12 12.5H8Z" fill="#34A853"/>
      <path d="M12 12.5L15.5 18.5L22 8L18.5 2L12 12.5Z" fill="#FBBC05"/>
      <path d="M8 12.5H12L18.5 2H5.5L8 12.5Z" fill="#EA4335"/>
    </svg>
  );
}

function DropboxIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 6L6 9.5L12 13L6 16.5L12 20L18 16.5L12 13L18 9.5L12 6Z" fill="#0049C2"/>
    </svg>
  );
}

function PCloudIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 18C3 18 1.5 16.5 1.5 14.5C1.5 12.8 2.6 11.4 4.2 11C4.1 10.7 4 10.4 4 10C4 7.8 5.8 6 8 6C8.7 6 9.4 6.2 10 6.5C10.9 4.5 13 3 15.5 3C19 3 21.5 5.7 21.5 9C21.5 9.2 21.5 9.4 21.5 9.6C22.4 10.2 23 11.2 23 12.5C23 14.4 21.5 16 19.5 16" stroke="#20BFFF" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M12 12V20M9 17L12 20L15 17" stroke="#20BFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function OneDriveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 15C2 15 4 10 9 10C10 7 13 5 16 6.5C18 7.5 19 9.5 19 9.5C21.5 9.5 23 11 23 13.5C23 16 21 17 19 17H5C3 17 2 16 2 15Z" fill="#0078D4"/>
    </svg>
  );
}

const PROVIDER_ICONS: Record<SourceKey, React.ComponentType<{ size?: number }>> = {
  gdrive:   GDriveIcon,
  dropbox:  DropboxIcon,
  pcloud:   PCloudIcon,
  onedrive: OneDriveIcon,
};

const SOURCES: SourceKey[] = ["gdrive", "dropbox", "pcloud", "onedrive"];

// ─── Page ─────────────────────────────────────────────────────

export default function HesabimPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const [fetchingInt,  setFetchingInt]  = useState(true);
  const [revoking,     setRevoking]     = useState<SourceKey | null>(null);

  const [limitInput, setLimitInput] = useState("500");
  const [indexState,  setIndexState]  = useState<{
    status: "idle" | "loading" | "success" | "error"; data?: IndexResult; msg?: string;
  }>({ status: "idle" });

  const [syncState, setSyncState] = useState<{
    status: "idle" | "loading" | "success" | "error"; msg?: string;
  }>({ status: "idle" });

  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearState, setClearState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    integrationApi.status()
      .then(setIntegrations)
      .catch(() => {})
      .finally(() => setFetchingInt(false));
  }, [user]);

  // OAuth callback handling
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error     = searchParams.get("error");
    if (connected) {
      const label = SOURCE_CONFIG[connected as SourceKey]?.label ?? connected;
      showToast("success", `${label} başarıyla bağlandı.`);
      router.replace("/account");
      integrationApi.status().then(setIntegrations).catch(() => {});
    } else if (error) {
      showToast("error", `Bağlantı hatası: ${error.replace(/_/g, " ")}`);
      router.replace("/account");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const showToast = (type: "success" | "error", msg: string) => setToast({ type, msg });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleConnect = async (source: SourceKey) => {
    try {
      let auth_url: string;
      if      (source === "gdrive")   ({ auth_url } = await authApi.login());
      else if (source === "dropbox")  ({ auth_url } = await authApi.dropboxLogin());
      else if (source === "pcloud")   ({ auth_url } = await authApi.pcloudLogin());
      else if (source === "onedrive") ({ auth_url } = await authApi.onedriveLogin());
      else return;
      window.location.href = auth_url;
    } catch {
      showToast("error", "Bağlantı başlatılamadı");
    }
  };

  const handleRevoke = async (source: SourceKey) => {
    setRevoking(source);
    try {
      await integrationApi.revoke(source);
      setIntegrations((prev) =>
        prev ? { ...prev, [source]: { ...prev[source], connected: false } } : prev,
      );
      showToast("success", `${SOURCE_CONFIG[source].label} bağlantısı kesildi.`);
    } catch (e: unknown) {
      showToast("error", e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setRevoking(null);
    }
  };

  const handleClearIndex = async () => {
    setClearState("loading");
    try {
      const data = await indexApi.clear();
      setShowClearModal(false);
      setClearState("idle");
      showToast("success", `İndeks temizlendi — ${data.deleted_points} kayıt silindi.`);
    } catch (e: unknown) {
      setClearState("error");
      setTimeout(() => setClearState("idle"), 2500);
    }
  };

  const handleIndex = async () => {
    setIndexState({ status: "loading" });
    try {
      const data = await indexApi.start({
        limit: Number(limitInput) || 500,
      });
      setIndexState({ status: "success", data });
    } catch (e: unknown) {
      setIndexState({ status: "error", msg: e instanceof Error ? e.message : "Hata oluştu" });
    }
  };

  const handleSync = async () => {
    setSyncState({ status: "loading" });
    try {
      const data = await syncApi.run();
      if (data.errors?.length) {
        localStorage.setItem("last_sync_warning", data.errors.map((e) => e.error).join(", "));
      }
      setSyncState({ status: "success", msg: `+${data.added ?? 0} eklendi, −${data.deleted ?? 0} silindi` });
    } catch (e: unknown) {
      setSyncState({ status: "error", msg: e instanceof Error ? e.message : "Hata oluştu" });
    }
  };

  if (loading || !user) return null;

  const connectedCount = SOURCES.filter((s) => integrations?.[s]?.connected).length;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{
        flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease",
        minWidth: 0, padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center",
      }}>

        <div style={{ width: "100%", maxWidth: 640 }}>
        {/* ── Profil ── */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
          padding: "24px", display: "flex", alignItems: "center", gap: 20, marginBottom: 20,
          animation: "fadeIn 0.3s ease-out",
        }}>
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt={user.name}
              style={{ width: 60, height: 60, borderRadius: "50%", flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 60, height: 60, borderRadius: "50%", background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 700, color: "white", flexShrink: 0,
            }}>
              {user.name[0].toUpperCase()}
            </div>
          )}
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
              {user.name}
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.88rem", color: "var(--text-muted)", margin: 0 }}>
              {user.email}
            </p>
          </div>
        </div>

        {/* ── Bulut Hesapları ── */}
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.92rem", fontWeight: 600, color: "var(--text)", margin: 0 }}>
              Bulut Hesapları
            </h2>
            <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {connectedCount} / {SOURCES.length} bağlı
            </span>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
            {fetchingInt ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "36px 0" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  border: "3px solid var(--border)", borderTop: "3px solid var(--accent)",
                  animation: "spin-slow 0.8s linear infinite",
                }} />
              </div>
            ) : SOURCES.map((source, i) => {
              const integration = integrations?.[source];
              const Icon        = PROVIDER_ICONS[source];
              const cfg         = SOURCE_CONFIG[source];
              const connected   = integration?.connected ?? false;
              const disabled    = integration?.disabled  ?? false;
              const isLight     = cfg.light;
              const textColor   = isLight ? "#000" : "#fff";
              const mutedColor  = isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";
              const borderColor = isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)";
              const iconBg      = isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.15)";
              return (
                <div key={source} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "13px 18px",
                  background: cfg.srcBg,
                  borderBottom: i < SOURCES.length - 1 ? `1px solid ${borderColor}` : "none",
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: iconBg, border: `1px solid ${borderColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={17} />
                  </div>

                  <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.88rem", fontWeight: 600, color: textColor }}>
                    {cfg.label}
                  </span>

                  {disabled && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 5, fontSize: "0.7rem", fontWeight: 600,
                      fontFamily: "var(--font-body)", marginRight: 8,
                      background: isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.1)",
                      color: mutedColor, border: `1px solid ${borderColor}`,
                    }}>
                      Devre Dışı
                    </span>
                  )}

                  {!disabled && (
                    <button
                      onClick={() => connected ? handleRevoke(source) : handleConnect(source)}
                      disabled={revoking === source}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: "0.78rem",
                        fontFamily: "var(--font-body)",
                        background: connected ? "#000" : (isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)"),
                        border: connected
                          ? "1px solid rgba(213,115,115,0.5)"
                          : `1px solid ${borderColor}`,
                        color: connected ? "var(--error)" : textColor,
                        cursor:     revoking === source ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        display:    "flex", alignItems: "center", gap: 5,
                        transition: "all 0.15s",
                      }}
                    >
                      {revoking === source && (
                        <span style={{
                          width: 11, height: 11,
                          border: "2px solid currentColor", borderTop: "2px solid transparent",
                          borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
                        }} />
                      )}
                      {connected
                        ? "Bağlantıyı Kes"
                        : source === "gdrive" ? "Google ile Bağlan" : "OAuth ile Bağlan"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Veri Yönetimi ── */}
        <section>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "0.92rem", fontWeight: 600, color: "var(--text)", margin: "0 0 10px" }}>
            Veri Yönetimi
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* İndeksleme */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px", display: "flex", flexDirection: "column" }}>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", margin: "0 0 4px" }}>
                İndeksleme
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
                Fotoğrafları AI ile vektörize eder.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
                <input
                  type="number" placeholder="Limit (varsayılan 500)"
                  min={1} max={10000} value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  style={{
                    padding: "7px 10px", borderRadius: 8,
                    background: "var(--bg)", border: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "var(--font-body)", fontSize: "0.8rem", outline: "none",
                  }}
                />
              </div>
              <button
                onClick={handleIndex}
                disabled={indexState.status === "loading"}
                style={{
                  padding: "9px 0", borderRadius: 9, border: "none",
                  background: "var(--accent-grad)", color: "#fff",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.83rem",
                  cursor: indexState.status === "loading" ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {indexState.status === "loading" && (
                  <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.35)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
                )}
                {indexState.status === "loading" ? "İndeksleniyor..." : "Başlat"}
              </button>
              {indexState.status === "success" && indexState.data && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.73rem", color: "var(--success)", margin: "10px 0 0", textAlign: "center" }}>
                  ✓ {indexState.data.indexed} indekslendi / {indexState.data.total_found} bulundu
                </p>
              )}
              {indexState.status === "error" && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.73rem", color: "var(--error)", margin: "10px 0 0", textAlign: "center" }}>
                  {indexState.msg}
                </p>
              )}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10 }}>
                <button
                  onClick={() => setShowClearModal(true)}
                  style={{
                    width: "100%", padding: "7px 0", borderRadius: 8,
                    background: "transparent", border: "1px solid rgba(213,115,115,0.35)",
                    color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "0.78rem",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(213,115,115,0.08)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  İndeksi Sıfırla
                </button>
              </div>
            </div>

            {/* Senkronizasyon */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px", display: "flex", flexDirection: "column" }}>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", margin: "0 0 4px" }}>
                Senkronizasyon
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
                Silinen ve yeni eklenen dosyaları günceller.
              </p>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleSync}
                disabled={syncState.status === "loading"}
                style={{
                  padding: "9px 0", borderRadius: 9,
                  background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.83rem",
                  cursor: syncState.status === "loading" ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {syncState.status === "loading" && (
                  <span style={{ width: 12, height: 12, border: "2px solid var(--border)", borderTop: "2px solid var(--accent)", borderRadius: "50%", animation: "spin-slow 0.7s linear infinite" }} />
                )}
                {syncState.status === "loading" ? "Senkronize ediliyor..." : "Senkronize Et"}
              </button>
              {syncState.status === "success" && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.73rem", color: "var(--success)", margin: "10px 0 0", textAlign: "center" }}>
                  ✓ {syncState.msg}
                </p>
              )}
              {syncState.status === "error" && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.73rem", color: "var(--error)", margin: "10px 0 0", textAlign: "center" }}>
                  {syncState.msg}
                </p>
              )}
            </div>

          </div>
        </section>
        </div>
      </main>

      {showClearModal && (
        <div
          onClick={() => { if (clearState !== "loading") setShowClearModal(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, animation: "fadeIn 0.2s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)", border: "1px solid rgba(213,115,115,0.35)",
              borderRadius: 20, padding: "32px", maxWidth: 360, width: "100%",
              textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: "50%", margin: "0 auto 18px",
              background: "rgba(213,115,115,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.05rem", color: "var(--text)", marginBottom: 10 }}>
              İndeksi Sıfırla
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.87rem", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 28 }}>
              Tüm indexlenmiş veriler silinecek. Bu işlem geri alınamaz. Tekrar aramak için yeniden indexleme yapman gerekecek.
            </p>
            {clearState === "error" && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--error)", marginBottom: 12 }}>
                Bir hata oluştu, tekrar dene.
              </p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowClearModal(false)}
                disabled={clearState === "loading"}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 11,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  color: "var(--text-muted)", fontFamily: "var(--font-display)",
                  fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
                }}
              >
                İptal
              </button>
              <button
                onClick={handleClearIndex}
                disabled={clearState === "loading"}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 11,
                  background: "rgba(213,115,115,0.15)", border: "1px solid rgba(213,115,115,0.5)",
                  color: "var(--error)", fontFamily: "var(--font-display)",
                  fontWeight: 600, fontSize: "0.9rem",
                  cursor: clearState === "loading" ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {clearState === "loading" && (
                  <span style={{
                    width: 14, height: 14,
                    border: "2px solid rgba(213,115,115,0.3)", borderTop: "2px solid var(--error)",
                    borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
                  }} />
                )}
                {clearState === "loading" ? "Temizleniyor…" : "Evet, Sıfırla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, background: "rgba(21,21,21,0.97)",
          border: `1px solid ${toast.type === "success" ? "rgba(132,201,164,0.4)" : "rgba(213,115,115,0.4)"}`,
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeIn 0.3s ease-out",
        }}>
          <span>{toast.type === "success" ? "✅" : "❌"}</span>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: "0.85rem",
            color: toast.type === "success" ? "var(--success)" : "var(--error)", margin: 0,
          }}>
            {toast.msg}
          </p>
        </div>
      )}
    </div>
  );
}
