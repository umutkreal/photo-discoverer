"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { editApi, integrationApi, SOURCE_CONFIG, thumbnailUrl } from "@/lib/api";
import type { SourceKey, IntegrationsResponse } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EditResult {
  image: string;
  width: number;
  height: number;
  prompt: string;
}

// ─── Preset chips ─────────────────────────────────────────────────────────────

const PRESETS = [
  "Arkaplanı sil",
  "Gökyüzünü maviye çevir",
  "Gece moduna dönüştür",
  "Siyah-beyaz yap",
  "Kontrast ve parlaklığı artır",
  "Dramatik ışık ekle",
  "Portre efekti uygula",
];

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid var(--border)",
          borderTopColor: "var(--accent)",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>AI düzenleme yapılıyor…</span>
    </div>
  );
}

// ─── Save dropdown ───────────────────────────────────────────────────────────

function SaveDropdown({
  result,
  filename,
  integrations,
  onSaved,
}: {
  result: EditResult;
  filename: string;
  integrations: IntegrationsResponse | null;
  onSaved: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<SourceKey | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const connectedSources = integrations
    ? (Object.keys(integrations) as SourceKey[]).filter((k) => integrations[k]?.connected)
    : [];

  const handleSave = async (source: SourceKey) => {
    setSaving(source);
    setOpen(false);
    try {
      await editApi.saveOnCloud({
        image_b64: result.image,
        filename: `edited_${filename}`,
        source,
        folder: "PhotoMind-Edited",
      });
      onSaved(`${SOURCE_CONFIG[source].label} üzerine kaydedildi`);
    } catch (e: unknown) {
      onSaved(`Hata: ${e instanceof Error ? e.message : "bilinmeyen hata"}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!!saving || connectedSources.length === 0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 16px",
          borderRadius: 8,
          background: "var(--accent)",
          color: "white",
          border: "none",
          cursor: connectedSources.length === 0 ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 500,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Kaydediliyor…" : "Buluta Kaydet"}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && connectedSources.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 6,
            minWidth: 190,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 50,
          }}
        >
          {connectedSources.map((src) => {
            const cfg = SOURCE_CONFIG[src];
            return (
              <button
                key={src}
                onClick={() => handleSave(src)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 7,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text)",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EditPage() {
  const searchParams = useSearchParams();
  const cloudFileId = searchParams.get("file_id");
  const cloudSource = searchParams.get("source") as SourceKey | null;

  const [prompt, setPrompt] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCloudMode = !!(cloudFileId && cloudSource);

  useEffect(() => {
    integrationApi.status().then(setIntegrations).catch(() => null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLocalPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setLocalFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLocalPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    setError(null);
  }, []);

  const handleEdit = async () => {
    if (!prompt.trim()) { setError("Düzenleme talimatı girin"); return; }
    if (!isCloudMode && !localFile) { setError("Bir fotoğraf seçin"); return; }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let res: EditResult;
      if (isCloudMode) {
        res = await editApi.edit({
          source: cloudSource!,
          file_id: cloudFileId!,
          prompt: prompt.trim(),
        });
      } else {
        const imageB64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            resolve(dataUrl.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(localFile!);
        });
        res = await editApi.edit({
          source: "local",
          image_b64: imageB64,
          prompt: prompt.trim(),
        });
      }
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI düzenleme başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: SIDEBAR_WIDTH,
          minWidth: 0,
          padding: "40px 40px 60px",
          maxWidth: 900,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.4px" }}>
            AI Fotoğraf Düzenleme
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            Fotoğrafını yükle, ne yapmak istediğini yaz, AI halleder.
          </p>
        </div>

        <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Left panel */}
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            {/* Upload zone / cloud preview */}
            {isCloudMode ? (
              <div
                style={{
                  border: "2px solid var(--accent)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(cloudFileId!, cloudSource!)}
                  alt="cloud photo"
                  style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                />
                <div>
                  <p style={{ fontSize: 13, color: "var(--text)", margin: 0, fontWeight: 500 }}>
                    {SOURCE_CONFIG[cloudSource!]?.label} fotoğrafı
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    ID: {cloudFileId}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  style={{
                    border: `2px dashed ${localPreview ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 12,
                    padding: 24,
                    textAlign: "center",
                    cursor: "pointer",
                    background: "var(--surface)",
                    transition: "border-color 0.15s",
                    minHeight: 200,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {localPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={localPreview}
                      alt="seçilen fotoğraf"
                      style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, objectFit: "contain" }}
                    />
                  ) : (
                    <div>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ display: "block", margin: "0 auto 12px" }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                        Fotoğraf sürükle veya tıkla
                      </p>
                      <p style={{ fontSize: 12, color: "var(--dimmer)", marginTop: 4 }}>PNG, JPG, WEBP</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />

                {localFile && (
                  <button
                    onClick={() => { setLocalFile(null); setLocalPreview(null); setResult(null); }}
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    × Fotoğrafı kaldır
                  </button>
                )}
              </>
            )}

            {/* Prompt */}
            <div style={{ marginTop: 20 }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Düzenleme talimatı
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Örn: arkaplanı sil, gökyüzünü maviye çevir…"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontSize: 14,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleEdit(); }}
              />
            </div>

            {/* Preset chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 20,
                    border: `1px solid ${prompt === p ? "var(--accent)" : "var(--border)"}`,
                    background: prompt === p ? "rgba(139,92,246,0.15)" : "var(--surface)",
                    color: prompt === p ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Edit button */}
            <button
              onClick={handleEdit}
              disabled={loading || (!isCloudMode && !localFile) || !prompt.trim()}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "11px 0",
                borderRadius: 9,
                background: "linear-gradient(135deg, var(--accent), #a78bfa)",
                color: "white",
                border: "none",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || (!isCloudMode && !localFile) || !prompt.trim() ? "not-allowed" : "pointer",
                opacity: loading || (!isCloudMode && !localFile) || !prompt.trim() ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {loading ? "İşleniyor…" : "AI ile Düzenle"}
            </button>

            {error && (
              <p style={{ marginTop: 10, fontSize: 13, color: "var(--error)" }}>{error}</p>
            )}
          </div>

          {/* Right panel — result */}
          <div
            style={{
              flex: "1 1 340px",
              minWidth: 0,
              minHeight: 200,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: loading || !result ? "center" : "flex-start",
              padding: 24,
              gap: 16,
            }}
          >
            {loading ? (
              <Spinner />
            ) : result ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/jpeg;base64,${result.image}`}
                  alt="düzenlenmiş"
                  style={{ maxWidth: "100%", borderRadius: 8, objectFit: "contain" }}
                />

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `data:image/jpeg;base64,${result.image}`;
                      a.download = `edited_${isCloudMode ? cloudFileId : (localFile?.name ?? "photo.jpg")}`;
                      a.click();
                    }}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    İndir
                  </button>

                  <button
                    onClick={() => setResult(null)}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Orijinale Dön
                  </button>

                  <SaveDropdown
                    result={result}
                    filename={isCloudMode ? (cloudFileId ?? "photo.jpg") : (localFile?.name ?? "photo.jpg")}
                    integrations={integrations}
                    onSaved={(msg) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(null), 4000); }}
                  />
                </div>

                {saveMsg && (
                  <p style={{ fontSize: 13, color: "var(--success)", margin: 0, alignSelf: "flex-end" }}>
                    {saveMsg}
                  </p>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.2" style={{ display: "block", margin: "0 auto 10px" }}>
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <p style={{ fontSize: 14, color: "var(--dimmer)", margin: 0 }}>
                  Düzenlenmiş fotoğraf burada görünecek
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
