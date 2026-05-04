"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/common/Navbar";
import { integrationApi, authApi, SOURCE_CONFIG } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { IntegrationsResponse, SourceKey } from "@/lib/api";

// ─── Permission info box ─────────────────────────────────────

function PermissionInfo() {
  return (
    <div style={{
      padding: "14px 18px",
      borderRadius: 12,
      background: "rgba(251,191,36,0.07)",
      border: "1px solid rgba(251,191,36,0.25)",
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      marginBottom: 32,
    }}>
      <span style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: 1 }}>🔒</span>
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: "0.85rem",
        color: "var(--warning)",
        lineHeight: 1.6,
        margin: 0,
      }}>
        <strong>İzin şeffaflığı:</strong> Yinelenen fotoğrafları temizleyebilmemiz için dosya silme iznine ihtiyaç duyuyoruz.
        İzniniz olmadan hiçbir dosya silinmeyecektir. Bağlantıyı istediğiniz zaman kesebilirsiniz.
      </p>
    </div>
  );
}

// ─── Provider icons (inline SVG) ─────────────────────────────

function GDriveIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.5 18.5L8 12.5L2 12.5L4.5 18.5Z" fill="#4285F4"/>
      <path d="M8 12.5L4.5 18.5H15.5L12 12.5H8Z" fill="#34A853"/>
      <path d="M12 12.5L15.5 18.5L22 8L18.5 2L12 12.5Z" fill="#FBBC05"/>
      <path d="M8 12.5H12L18.5 2H5.5L8 12.5Z" fill="#EA4335"/>
    </svg>
  );
}

function DropboxIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 6L6 9.5L12 13L6 16.5L12 20L18 16.5L12 13L18 9.5L12 6Z" fill="#0061FF"/>
      <path d="M6 9.5L12 6L18 9.5L12 13L6 9.5Z" fill="#0061FF" opacity="0.6"/>
    </svg>
  );
}

function PCloudIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 18C3 18 1.5 16.5 1.5 14.5C1.5 12.8 2.6 11.4 4.2 11C4.1 10.7 4 10.4 4 10C4 7.8 5.8 6 8 6C8.7 6 9.4 6.2 10 6.5C10.9 4.5 13 3 15.5 3C19 3 21.5 5.7 21.5 9C21.5 9.2 21.5 9.4 21.5 9.6C22.4 10.2 23 11.2 23 12.5C23 14.4 21.5 16 19.5 16" stroke="#20BFFF" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M12 12V20M9 17L12 20L15 17" stroke="#20BFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function OneDriveIcon({ size = 22 }: { size?: number }) {
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

// ─── Scope info per provider ─────────────────────────────────
const SCOPE_INFO: Record<SourceKey, { current: string; needed: string }> = {
  gdrive:   { current: "drive.readonly",      needed: "drive (okuma + silme)" },
  dropbox:  { current: "files.content.read",  needed: "files.content.write" },
  pcloud:   { current: "full access (OAuth2)", needed: "Zaten tam erişim, ek scope yok" },
  onedrive: { current: "Files.Read",          needed: "Files.ReadWrite" },
};

// ─── Provider card ────────────────────────────────────────────

interface ProviderCardProps {
  source: SourceKey;
  connected: boolean;
  label: string;
  disabled?: boolean;
  onConnect: (source: SourceKey) => void;
  onRevoke: (source: SourceKey) => void;
  revoking: boolean;
}

function ProviderCard({ source, connected, label, disabled, onConnect, onRevoke, revoking }: ProviderCardProps) {
  const cfg = SOURCE_CONFIG[source];
  const Icon = PROVIDER_ICONS[source];
  const scope = SCOPE_INFO[source];
  const isGdrive = source === "gdrive";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${disabled ? "var(--border)" : connected ? cfg.color + "44" : "var(--border)"}`,
      borderRadius: 16,
      padding: "22px 24px",
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      transition: "border-color 0.2s",
      opacity: disabled ? 0.55 : 1,
    }}>
      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: (disabled || !connected) ? "var(--surface-2)" : cfg.bg,
        border: `1px solid ${connected && !disabled ? cfg.color + "33" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>
        <Icon size={22} />
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h3 style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: "1.05rem", color: "var(--text)", margin: 0,
          }}>
            {label}
          </h3>
          <span style={{
            padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem", fontWeight: 600,
            fontFamily: "var(--font-body)",
            background: disabled
              ? "rgba(136,136,170,0.1)"
              : connected ? "rgba(74,222,128,0.12)" : "var(--surface-2)",
            color: disabled
              ? "var(--text-muted)"
              : connected ? "var(--success)" : "var(--text-muted)",
            border: `1px solid ${disabled ? "var(--border)" : connected ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
          }}>
            {disabled ? "Devre Dışı" : connected ? "Bağlı" : "Bağlı Değil"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{
            padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem",
            fontFamily: "monospace", background: "var(--surface-2)", color: "var(--text-muted)",
          }}>
            Mevcut: {scope.current}
          </span>
          <span style={{
            padding: "2px 8px", borderRadius: 5, fontSize: "0.72rem",
            fontFamily: "monospace", background: "rgba(124,109,250,0.08)", color: "var(--accent)",
          }}>
            Silme için: {scope.needed}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {disabled ? (
            <span style={{
              padding: "8px 14px", borderRadius: 8, fontSize: "0.82rem",
              fontFamily: "var(--font-body)", color: "var(--text-muted)",
              fontStyle: "italic",
            }}>
              Geçici olarak devre dışı
            </span>
          ) : connected ? (
            <button
              onClick={() => onRevoke(source)}
              disabled={revoking}
              style={{
                padding: "8px 16px", borderRadius: 8,
                background: "transparent",
                border: "1px solid rgba(248,113,113,0.4)",
                color: revoking ? "var(--text-muted)" : "var(--error)",
                fontFamily: "var(--font-body)", fontSize: "0.85rem",
                cursor: revoking ? "not-allowed" : "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {revoking && (
                <span style={{
                  width: 12, height: 12,
                  border: "2px solid var(--error)", borderTop: "2px solid transparent",
                  borderRadius: "50%", animation: "spin-slow 0.7s linear infinite",
                }} />
              )}
              Bağlantıyı Kes
            </button>
          ) : isGdrive ? (
            <button
              onClick={() => onConnect(source)}
              style={{
                padding: "8px 16px", borderRadius: 8,
                background: cfg.color, color: "white",
                border: "none", fontFamily: "var(--font-body)", fontSize: "0.85rem",
                cursor: "pointer", transition: "opacity 0.15s",
              }}
            >
              Google ile Bağlan
            </button>
          ) : (
            <button
              onClick={() => onConnect(source)}
              style={{
                padding: "8px 16px", borderRadius: 8,
                background: cfg.color, color: "white",
                border: "none", fontFamily: "var(--font-body)", fontSize: "0.85rem",
                cursor: "pointer", transition: "opacity 0.15s",
              }}
            >
              OAuth ile Bağlan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const [revoking, setRevoking] = useState<SourceKey | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  // OAuth callback sonucu — Dropbox redirect'inden döndükten sonra
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      const label = SOURCE_CONFIG[connected as SourceKey]?.label ?? connected;
      setToast({ type: "success", msg: `${label} başarıyla bağlandı.` });
      // URL'yi temizle
      router.replace("/settings/integrations");
      // Status'u yenile
      integrationApi.status().then(setIntegrations).catch(() => {});
    } else if (error) {
      setToast({ type: "error", msg: `Bağlantı hatası: ${error.replace(/_/g, " ")}` });
      router.replace("/settings/integrations");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!user) return;
    integrationApi.status()
      .then(setIntegrations)
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  const handleRevoke = async (source: SourceKey) => {
    setRevoking(source);
    try {
      await integrationApi.revoke(source);
      setIntegrations((prev) =>
        prev ? { ...prev, [source]: { ...prev[source], connected: false } } : prev,
      );
      setToast({ type: "success", msg: `${SOURCE_CONFIG[source].label} bağlantısı kesildi.` });
    } catch (e: unknown) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Bir hata oluştu" });
    } finally {
      setRevoking(null);
    }
  };

  const handleConnect = async (source: SourceKey) => {
    try {
      if (source === "gdrive") {
        const { auth_url } = await authApi.login();
        window.location.href = auth_url;
      } else if (source === "dropbox") {
        const { auth_url } = await authApi.dropboxLogin();
        window.location.href = auth_url;
      }
    } catch {
      setToast({ type: "error", msg: "Bağlantı başlatılamadı" });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading || !user) return null;

  const sources: SourceKey[] = ["gdrive", "dropbox", "pcloud", "onedrive"];

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 96, paddingBottom: 60, maxWidth: 720, margin: "0 auto", padding: "96px 24px 60px" }}>
        <div className="animate-fade-in" style={{ marginBottom: 40 }}>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "2.2rem",
            fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", marginBottom: 8,
          }}>
            Entegrasyonlar
          </h1>
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.95rem" }}>
            Bağlı bulut hesaplarını yönet. Tüm kaynaklardan tek arama kutusundan fotoğraf ara.
          </p>
        </div>

        <PermissionInfo />

        {fetching ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "3px solid var(--border)", borderTop: "3px solid var(--accent)",
              animation: "spin-slow 0.8s linear infinite",
            }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {sources.map((source) => (
              <ProviderCard
                key={source}
                source={source}
                connected={integrations?.[source]?.connected ?? false}
                label={integrations?.[source]?.label ?? SOURCE_CONFIG[source].label}
                disabled={integrations?.[source]?.disabled ?? false}
                onConnect={handleConnect}
                onRevoke={handleRevoke}
                revoking={revoking === source}
              />
            ))}
          </div>
        )}

        {/* Connected count summary */}
        {integrations && !fetching && (
          <p style={{
            marginTop: 24, fontFamily: "var(--font-body)", fontSize: "0.82rem",
            color: "var(--text-muted)", textAlign: "center",
          }}>
            {sources.filter((s) => integrations[s]?.connected).length} / {sources.length} hesap bağlı
          </p>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, background: "rgba(26,26,36,0.97)",
          border: `1px solid ${toast.type === "success" ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
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
    </>
  );
}
