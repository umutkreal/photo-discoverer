"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { indexApi, syncApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { IndexResult, SyncResult } from "@/lib/api";

type Status = "idle" | "loading" | "success" | "error";

interface ActionState {
  status: Status;
  message?: string;
  data?: IndexResult | SyncResult;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [folderInput, setFolderInput] = useState("");
  const [limitInput, setLimitInput] = useState("500");
  const [indexState, setIndexState] = useState<ActionState>({ status: "idle" });
  const [syncState, setSyncState] = useState<ActionState>({ status: "idle" });

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const handleIndex = async () => {
    setIndexState({ status: "loading" });
    try {
      const result = await indexApi.start({
        folder_id: folderInput.trim() || undefined,
        limit: parseInt(limitInput) || 500,
      });
      setIndexState({ status: "success", data: result, message: result.message });
    } catch (e: unknown) {
      setIndexState({ status: "error", message: e instanceof Error ? e.message : "Hata oluştu" });
    }
  };

  const handleSync = async () => {
    setSyncState({ status: "loading" });
    try {
      const result = await syncApi.run();
      setSyncState({ status: "success", data: result, message: result.message });
      // Provider-level errors → toast on search page
      if (result.errors && result.errors.length > 0) {
        const sources = [...new Set(result.errors.map((e) => e.source).filter(Boolean))];
        const msg = sources.length > 0
          ? `${sources.join(", ")} bağlantısı senkronizasyon sırasında hata verdi. Entegrasyonlar sayfasından yeniden bağlanmayı deneyin.`
          : "Bazı sağlayıcılarda senkronizasyon hatası oluştu.";
        localStorage.setItem("last_sync_warning", msg);
      } else {
        localStorage.removeItem("last_sync_warning");
      }
    } catch (e: unknown) {
      setSyncState({ status: "error", message: e instanceof Error ? e.message : "Hata oluştu" });
    }
  };

  if (loading || !user) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", minWidth: 0, padding: "40px 40px 60px", maxWidth: 760 }}>
        {/* Header */}
        <div className="animate-fade-in" style={{ marginBottom: 48 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.2rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              marginBottom: 8,
            }}
          >
            Panel
          </h1>
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "0.95rem" }}>
            Drive fotoğraflarını indexle, senkronize et.
          </p>
        </div>

        {/* Quick action - Search */}
        <div
          className="animate-fade-in-delay-1"
          onClick={() => router.push("/search")}
          style={{
            padding: "20px 24px",
            borderRadius: 16,
            background: "var(--accent-grad)",
            border: "1px solid var(--border-2)",
            cursor: "pointer",
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 16,
            transition: "transform 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-2)";
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2"/>
              <path d="M21 21l-4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
              Fotoğraf Ara
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Doğal dille indexlenmiş fotoğrafları bul →
            </p>
          </div>
        </div>

        {/* Index Section */}
        <Section
          className="animate-fade-in-delay-2"
          title="Tam İndeksleme"
          description="Drive'ı baştan tarar, tüm fotoğrafları CLIP ile vektöre çevirir ve Qdrant'a kaydeder. İlk kullanımda çalıştırın."
          badge="POST /index"
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Google Drive Klasör ID (opsiyonel)</label>
              <input
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs..."
                style={inputStyle}
              />
            </div>
            <div style={{ width: 120 }}>
              <label style={labelStyle}>Limit</label>
              <input
                type="number"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                min={1}
                max={10000}
                style={inputStyle}
              />
            </div>
          </div>

          <ActionButton
            label="İndekslemeyi Başlat"
            loadingLabel="İndeksleniyor..."
            status={indexState.status}
            onClick={handleIndex}
            color="var(--accent)"
          />

          {indexState.status !== "idle" && (
            <ResultCard state={indexState} />
          )}
        </Section>

        {/* Sync Section */}
        <Section
          title="Delta Senkronizasyon"
          description="Son indexlemeden bu yana değişen fotoğrafları tespit eder: yenileri ekler, silinenleri kaldırır."
          badge="POST /sync"
        >
          <ActionButton
            label="Senkronize Et"
            loadingLabel="Senkronize ediliyor..."
            status={syncState.status}
            onClick={handleSync}
            color="#10b981"
          />

          {syncState.status !== "idle" && (
            <ResultCard state={syncState} />
          )}
        </Section>
      </main>
    </div>
  );
}

// ─── Sub components ───────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
  marginBottom: 6,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: "0.9rem",
  outline: "none",
};

function Section({
  title, description, badge, children, className,
}: {
  title: string; description: string; badge: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: 28,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            {title}
          </h2>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, maxWidth: 480 }}>
            {description}
          </p>
        </div>
        <span style={{
          padding: "4px 10px",
          borderRadius: 6,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          fontSize: "0.72rem",
          fontFamily: "monospace",
          flexShrink: 0,
          marginLeft: 16,
        }}>
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function ActionButton({
  label, loadingLabel, status, onClick, color,
}: {
  label: string; loadingLabel: string; status: Status; onClick: () => void; color: string;
}) {
  const busy = status === "loading";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: "12px 24px",
        borderRadius: 10,
        background: busy ? "var(--surface-2)" : color,
        color: busy ? "var(--text-muted)" : "white",
        border: "none",
        cursor: busy ? "not-allowed" : "pointer",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: "0.95rem",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {busy && (
        <span style={{
          width: 16, height: 16,
          border: "2px solid rgba(255,255,255,0.3)",
          borderTop: "2px solid white",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spin-slow 0.7s linear infinite",
        }} />
      )}
      {busy ? loadingLabel : label}
    </button>
  );
}

function ResultCard({ state }: { state: ActionState }) {
  const isSuccess = state.status === "success";
  const isError = state.status === "error";
  const data = state.data as IndexResult & SyncResult | undefined;

  return (
    <div style={{
      marginTop: 16,
      padding: "14px 18px",
      borderRadius: 12,
      background: isError ? "rgba(213,115,115,0.08)" : "rgba(132,201,164,0.08)",
      border: `1px solid ${isError ? "rgba(213,115,115,0.25)" : "rgba(132,201,164,0.25)"}`,
    }}>
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: "0.9rem",
        color: isError ? "var(--error)" : "var(--success)",
        marginBottom: data ? 10 : 0,
      }}>
        {state.message}
      </p>
      {isSuccess && data && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {data.indexed !== undefined && (
            <Stat label="İndekslendi" value={data.indexed} />
          )}
          {data.total_found !== undefined && (
            <Stat label="Bulunan" value={data.total_found} />
          )}
          {data.added !== undefined && (
            <Stat label="Eklendi" value={data.added} />
          )}
          {data.deleted !== undefined && (
            <Stat label="Silindi" value={data.deleted} />
          )}
        </div>
      )}
      {isSuccess && data?.errors && data.errors.length > 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--warning)", marginTop: 8, fontFamily: "var(--font-body)" }}>
          ⚠️ {data.errors.length} dosyada hata oluştu
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
        {value}
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {label}
      </p>
    </div>
  );
}
