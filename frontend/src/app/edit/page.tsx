"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { editApi, thumbnailUrl, integrationApi, searchApi } from "@/lib/api";
import type { SourceKey, IntegrationsResponse, NewEditRequest, PhotoResult } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type OpId =
  | "inpainting" | "outpainting" | "object_remove" | "background_swap"
  | "restore" | "face_restore" | "upscale" | "style_transfer";

type ViewMode  = "compare" | "before" | "after";
type MaskMode  = "brush" | "box" | "smart";

interface Operation {
  id: OpId; label: string; icon: string; desc: string;
  color: string; params: string[]; eta: number; cost: number;
}

interface EditParams {
  prompt: string; description: string;
  strength: number; direction: string; pixels: number; scale: number;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const OPERATIONS: Operation[] = [
  { id: "inpainting",      label: "Inpainting",      icon: "✦", desc: "Masked alan içini doldur",           color: "#7C6AF7", params: ["prompt","mask","strength"], eta: 14, cost: 0.018 },
  { id: "outpainting",     label: "Outpainting",     icon: "⊕", desc: "Görüntüyü kenarından genişlet",      color: "#5BA4F5", params: ["prompt","direction","pixels"], eta: 18, cost: 0.022 },
  { id: "object_remove",   label: "Nesne Sil",       icon: "✕", desc: "Nesneyi sil, arka planı doldur",     color: "#F56E6E", params: ["mask"],                       eta: 9,  cost: 0.012 },
  { id: "background_swap", label: "Arka Plan",       icon: "▪", desc: "Metin promptu ile arka planı değiştir", color: "#4FC08D", params: ["prompt"],                 eta: 11, cost: 0.014 },
  { id: "restore",         label: "Restorasyon",     icon: "◎", desc: "Çizik, hasar, solmayı onar",         color: "#F5A623", params: ["description"],                eta: 8,  cost: 0.010 },
  { id: "face_restore",    label: "Yüz İyileştir",   icon: "◈", desc: "Bulanık yüzleri netleştir",          color: "#E879A0", params: [],                             eta: 6,  cost: 0.008 },
  { id: "upscale",         label: "Çözünürlük Artır",icon: "↑", desc: "2× veya 4× çözünürlük artır",        color: "#50B8E7", params: ["scale"],                      eta: 12, cost: 0.015 },
  { id: "style_transfer",  label: "Stil Aktarımı",   icon: "✧", desc: "Metin promptu ile sanatsal stil uygula", color: "#A78BFA", params: ["prompt"],                eta: 16, cost: 0.020 },
];

const PROVIDERS = [
  { id: "replicate",  label: "Replicate",     model: "flux-fill-pro",    badge: "Aktif",   connected: true  },
  { id: "fal",        label: "fal.ai",        model: "flux-dev-inpaint", badge: "Yakında", connected: false },
  { id: "stability",  label: "Stability AI",  model: "sd-3-turbo",       badge: "Yakında", connected: false },
];

const PROMPT_PRESETS: Partial<Record<OpId, string[]>> = {
  background_swap: ["güneşli sahil, altın saat", "açık gri stüdyo arka planı", "yumuşak bokeh ormanlık"],
  inpainting:      ["küçük seramik vazo, yabanıl çiçekler", "ahşap masa dokusu", "uyuyan kedi"],
  outpainting:     ["sahneyi doğal şekilde devam ettir", "açık gökyüzüne uzat", "daha fazla ön plan ekle"],
  style_transfer:  ["suluboya, yumuşak fırça", "studio ghibli anime tarzı", "karanlık film noir"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function oc(op: Operation | undefined, alpha = 1): string {
  const color = op?.color ?? "#7c6dfa";
  return alpha === 1 ? color : hexToRgba(color, alpha);
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

function TopBar({
  viewMode, setViewMode, zoom, setZoom, resultImage, filename, hasImage, onChangeImage,
}: {
  viewMode: ViewMode; setViewMode: (v: ViewMode) => void;
  zoom: number; setZoom: (z: number) => void;
  resultImage: string | null; filename: string;
  hasImage: boolean; onChangeImage: () => void;
}) {
  const download = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `edited_${filename}`;
    a.click();
  };

  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
      gap: 16, padding: "0 20px",
      background: "var(--surface)", borderBottom: "1px solid var(--border)",
    }}>
      {/* Left — change image button */}
      <div>
        {hasImage && (
          <button
            onClick={onChangeImage}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "transparent", color: "var(--text-muted)",
              fontFamily: "var(--body)", fontSize: 12.5, cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Fotoğraf Değiştir
          </button>
        )}
      </div>

      {/* Center — view toggle */}
      <div style={{
        display: "flex", gap: 2,
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: 9, padding: 3,
      }}>
        {(["compare","before","after"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              padding: "6px 14px", borderRadius: 6, border: 0,
              background: viewMode === v ? "rgba(255,255,255,0.06)" : "transparent",
              color: viewMode === v ? "var(--text)" : "var(--dim)",
              fontFamily: "var(--body)", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {v === "compare" ? "Karşılaştır" : v === "before" ? "Önce" : "Sonra"}
          </button>
        ))}
      </div>

      {/* Right — zoom + download */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 1,
          background: "var(--bg-2)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 2,
        }}>
          <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))} style={zoomBtnStyle}>−</button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", minWidth: 42, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} style={zoomBtnStyle}>+</button>
        </div>
        <button
          onClick={download}
          disabled={!resultImage}
          style={{
            width: 32, height: 32, borderRadius: 8, border: "1px solid transparent",
            background: "transparent", color: resultImage ? "var(--dim)" : "var(--dimmer)",
            cursor: resultImage ? "pointer" : "not-allowed",
            display: "grid", placeItems: "center",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button
          style={{
            height: 32, padding: "0 14px", border: 0, borderRadius: 8,
            background: "var(--violet)", color: "#fff",
            fontFamily: "var(--body)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 14px -4px rgba(124,109,250,0.4)",
          }}
        >
          Buluta Kaydet
        </button>
      </div>
    </header>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 26, height: 26, background: "transparent", border: 0, borderRadius: 5,
  color: "var(--dim)", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 14,
};

// ─── CompareCanvas ────────────────────────────────────────────────────────────

function CompareCanvas({
  beforeUrl, resultImage, op, viewMode, zoom, isGenerating, hasResult,
}: {
  beforeUrl: string | null; resultImage: string | null;
  op: Operation | undefined; viewMode: ViewMode; zoom: number;
  isGenerating: boolean; hasResult: boolean;
}) {
  const [pos, setPos] = useState(48);
  const [drag, setDrag] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const p = ((cx - rect.left) / rect.width) * 100;
      setPos(Math.max(0, Math.min(100, p)));
    };
    const up = () => setDrag(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, [drag]);

  const showAfter = hasResult || isGenerating;
  const showSlider = viewMode === "compare" && showAfter && !isGenerating;

  let afterClip = "inset(0 0 0 0)";
  if (viewMode === "before") afterClip = "inset(0 100% 0 0)";
  else if (viewMode === "compare") afterClip = `inset(0 ${100 - pos}% 0 0)`;

  return (
    <div style={{
      flex: 1, minHeight: 0, position: "relative", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    }}>
      <style>{`
        @keyframes edt-scan {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(200%);  }
        }
        @keyframes edt-grid-pulse {
          0%, 100% { opacity: 0.04; }
          50%       { opacity: 0.10; }
        }
      `}</style>

      {!beforeUrl ? (
        /* Empty state */
        <div style={{ textAlign: "center", color: "var(--dimmer)" }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }}>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em" }}>
            Arama sayfasından bir fotoğraf seçin
          </p>
        </div>
      ) : (
        <div style={{ maxWidth: "calc(100% - 64px)", maxHeight: "calc(100% - 64px)", display: "flex" }}>
          <div
            ref={wrapRef}
            style={{
              position: "relative",
              maxWidth: "min(900px, calc(100vw - 460px - 80px))",
              maxHeight: "78vh",
              borderRadius: 10, overflow: "hidden",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
              background: "#000",
              transform: `scale(${zoom})`,
              transformOrigin: "center",
              transition: "transform 0.18s ease",
            }}
          >
            {/* BEFORE layer */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beforeUrl}
              alt="before"
              draggable={false}
              style={{ display: "block", maxWidth: "100%", maxHeight: "78vh", userSelect: "none", pointerEvents: "none" }}
            />

            {/* AFTER layer */}
            {showAfter && resultImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultImage}
                alt="after"
                draggable={false}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "cover", userSelect: "none", pointerEvents: "none",
                  clipPath: afterClip, WebkitClipPath: afterClip,
                }}
              />
            )}

            {/* Progress overlay */}
            {isGenerating && (
              <div style={{ position: "absolute", inset: 0, zIndex: 6, overflow: "hidden", pointerEvents: "none" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  backdropFilter: "blur(14px) saturate(1.2)",
                  WebkitBackdropFilter: "blur(14px) saturate(1.2)",
                  background: "rgba(8,8,12,0.18)",
                }} />
                <div style={{
                  position: "absolute", left: 0, right: 0, height: 64,
                  background: `linear-gradient(180deg, transparent 0%, ${oc(op)} 50%, transparent 100%)`,
                  opacity: 0.45, filter: "blur(4px)", mixBlendMode: "screen",
                  animation: "edt-scan 2.2s ease-in-out infinite",
                }} />
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `linear-gradient(${oc(op)} 1px, transparent 1px), linear-gradient(90deg, ${oc(op)} 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  mixBlendMode: "screen",
                  animation: "edt-grid-pulse 2.4s ease-in-out infinite",
                }} />
              </div>
            )}

            {/* Compare slider */}
            {showSlider && (
              <>
                <div
                  style={{
                    position: "absolute", top: 0, bottom: 0, width: 2,
                    background: "rgba(255,255,255,0.85)",
                    boxShadow: "0 0 14px rgba(124,109,250,0.6)",
                    transform: `translateX(calc(${pos}% - 1px))`,
                    zIndex: 5, pointerEvents: "none",
                  }}
                >
                  <button
                    onMouseDown={() => setDrag(true)}
                    onTouchStart={() => setDrag(true)}
                    style={{
                      position: "absolute", top: "50%", left: "50%",
                      transform: `translate(-50%, -50%) scale(${drag ? 1.1 : 1})`,
                      width: 36, height: 36, borderRadius: "50%",
                      background: "#fff", border: 0, color: "#111",
                      cursor: "ew-resize", display: "grid", placeItems: "center",
                      pointerEvents: "auto",
                      boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                      transition: "transform 0.12s",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6" transform="translate(6,0)"/>
                    </svg>
                  </button>
                </div>
                <span style={{
                  position: "absolute", top: 12, left: 12, zIndex: 4,
                  fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.1em",
                  padding: "4px 9px", borderRadius: 5,
                  background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)",
                }}>ÖNCE</span>
                <span style={{
                  position: "absolute", top: 12, right: 12, zIndex: 4,
                  fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.1em",
                  padding: "4px 9px", borderRadius: 5,
                  background: oc(op), color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(6px)",
                }}>SONRA · {op?.label}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Operation Dropdown ───────────────────────────────────────────────────────

function OperationDropdown({ op, selectedId, setSelectedId }: {
  op: Operation | undefined;
  selectedId: OpId | null;
  setSelectedId: (id: OpId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", background: "var(--bg-2)",
          border: `1px solid ${open && op ? oc(op, 0.4) : "var(--border)"}`,
          borderRadius: 10, padding: "10px 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {op ? (
            <>
              <span style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: oc(op, 0.14), color: oc(op),
                display: "grid", placeItems: "center", fontSize: 13,
              }}>{op.icon}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{op.label}</span>
            </>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--dim)" }}>Bir işlem seçin…</span>
          )}
        </span>
        <svg
          width="9" height="9" viewBox="0 0 12 12" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--dim)" }}
        >
          <path d="M2 4.5L6 8L10 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 100,
          background: "var(--surface-3)", border: "1px solid var(--border-2)",
          borderRadius: 11, overflow: "hidden",
          boxShadow: "0 18px 50px -12px rgba(0,0,0,0.6)",
          animation: "aip-slide 0.14s ease-out",
        }}>
          <style>{`
            @keyframes aip-slide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
          `}</style>
          {OPERATIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => { setSelectedId(o.id); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 11,
                padding: "9px 11px", background: selectedId === o.id ? "rgba(255,255,255,0.045)" : "transparent",
                border: 0, borderBottom: "1px solid rgba(255,255,255,0.03)",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (selectedId !== o.id) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (selectedId !== o.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                background: hexToRgba(o.color, 0.12), color: o.color,
                display: "grid", placeItems: "center", fontSize: 14,
              }}>{o.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{o.label}</span>
                <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", marginTop: 1 }}>{o.desc}</span>
              </span>
              {selectedId === o.id && (
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: o.color, display: "grid", placeItems: "center",
                  fontSize: 9, color: "#fff",
                }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Provider Pill ────────────────────────────────────────────────────────────

function ProviderPill({ provider, setProvider, op }: {
  provider: string; setProvider: (p: string) => void; op: Operation | undefined;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const prov = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", background: "var(--bg-2)",
          border: "1px solid var(--border)", borderRadius: 10,
          cursor: "pointer", fontFamily: "inherit", color: "var(--text)",
          transition: "border-color 0.15s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: prov.connected ? "var(--green)" : "var(--dimmer)",
            boxShadow: prov.connected ? "0 0 7px rgba(74,222,128,0.6)" : "none",
          }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{prov.label}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>/ {prov.model}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {op && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)" }}>
              ~${op.cost.toFixed(3)} · ~{op.eta}s
            </span>
          )}
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--dim)" }}>
            <path d="M2 4.5L6 8L10 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 100,
          background: "var(--surface-3)", border: "1px solid var(--border-2)",
          borderRadius: 10, overflow: "hidden",
          boxShadow: "0 18px 50px -12px rgba(0,0,0,0.6)",
          animation: "aip-slide 0.14s ease-out",
        }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              disabled={!p.connected}
              onClick={() => { if (p.connected) { setProvider(p.id); setOpen(false); } }}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", background: "transparent",
                border: 0, borderBottom: "1px solid rgba(255,255,255,0.03)",
                cursor: p.connected ? "pointer" : "not-allowed",
                fontFamily: "inherit", color: "var(--text)", opacity: p.connected ? 1 : 0.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: p.connected ? "var(--green)" : "var(--dimmer)",
                  boxShadow: p.connected ? "0 0 7px rgba(74,222,128,0.6)" : "none",
                }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>/ {p.model}</span>
              </span>
              <span style={{
                fontFamily: "var(--mono)", fontSize: 9, fontWeight: 500,
                padding: "2px 7px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase",
                background: p.connected ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                color: p.connected ? "var(--green)" : "var(--dim)",
              }}>{p.badge}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Parameter components ─────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
      letterSpacing: "0.1em", color: "var(--dim)", textTransform: "uppercase", marginBottom: 8,
    }}>
      <span>{children}</span>
      {hint && <span style={{ fontSize: 9.5, color: "var(--dimmer)", letterSpacing: "0.06em", fontWeight: 400 }}>{hint}</span>}
    </div>
  );
}

function ParamPrompt({ op, value, onChange }: { op: Operation; value: string; onChange: (v: string) => void }) {
  const presets = PROMPT_PRESETS[op.id] ?? [];
  return (
    <div>
      <FieldLabel hint={`${value.length}/500`}>Prompt</FieldLabel>
      <textarea
        rows={3} maxLength={500} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ne yapmak istediğinizi açıklayın…"
        style={{
          width: "100%", background: "var(--surface)", border: `1px solid ${value ? oc(op, 0.4) : "var(--border)"}`,
          borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13,
          color: "var(--text)", resize: "none", outline: "none", boxSizing: "border-box",
          lineHeight: 1.5, transition: "border-color 0.15s",
        }}
      />
      {presets.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
          {presets.map((p) => (
            <button
              key={p} onClick={() => onChange(p)}
              style={{
                padding: "5px 10px", borderRadius: 999,
                border: `1px solid ${value === p ? oc(op, 0.5) : "var(--border)"}`,
                background: value === p ? oc(op, 0.08) : "var(--surface)",
                color: value === p ? oc(op) : "var(--dim)",
                fontFamily: "var(--mono)", fontSize: 10.5, cursor: "pointer", transition: "all 0.12s",
              }}
            >{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParamText({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13,
          color: "var(--text)", outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function ParamSlider({ op, label, min, max, step, value, onChange, format }: {
  op: Operation; label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            flex: 1, appearance: "none", WebkitAppearance: "none" as React.CSSProperties["WebkitAppearance"],
            height: 4, borderRadius: 2, outline: "none", cursor: "pointer",
            background: `linear-gradient(to right, ${oc(op)} 0%, ${oc(op)} ${pct}%, var(--border-2) ${pct}%, var(--border-2) 100%)`,
          }}
        />
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", minWidth: 42, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {format(value)}
        </span>
      </div>
    </div>
  );
}

function ParamSeg({ op, label, options, value, onChange }: {
  op: Operation; label: string;
  options: { value: string | number; label: string }[];
  value: string | number; onChange: (v: string | number) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{
        display: "flex", background: "var(--surface)",
        border: "1px solid var(--border)", borderRadius: 8, padding: 3, gap: 2,
      }}>
        {options.map((o) => {
          const sel = o.value === value;
          return (
            <button
              key={String(o.value)} onClick={() => onChange(o.value)}
              style={{
                flex: 1, padding: "6px 7px", borderRadius: 6, border: 0,
                background: sel ? oc(op, 0.10) : "transparent",
                color: sel ? oc(op) : "var(--dim)",
                fontFamily: "var(--mono)", fontSize: 10.5, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function ParamMask({ op, maskMode, setMaskMode }: { op: Operation; maskMode: MaskMode; setMaskMode: (m: MaskMode) => void }) {
  const modes = [
    { id: "brush" as MaskMode, label: "Fırça", icon: "✏", desc: "Düzenlenecek alanı boyayın" },
    { id: "box"   as MaskMode, label: "Kutu",  icon: "▢", desc: "Dikdörtgen seçim yapın"    },
    { id: "smart" as MaskMode, label: "Akıllı",icon: "◈", desc: "Nesneye tıklayın"          },
  ];
  const active = modes.find((m) => m.id === maskMode) ?? modes[0];
  return (
    <div>
      <FieldLabel hint="Zorunlu">Maske</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 10 }}>
        {modes.map((m) => {
          const sel = maskMode === m.id;
          return (
            <button key={m.id} onClick={() => setMaskMode(m.id)} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "7px 8px", borderRadius: 8,
              background: sel ? oc(op, 0.12) : "var(--surface)",
              border: `1px solid ${sel ? oc(op, 0.4) : "var(--border)"}`,
              color: sel ? oc(op) : "var(--dim)",
              fontFamily: "inherit", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
              transition: "all 0.12s",
            }}>
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{
        background: "var(--surface)", border: `1px dashed ${oc(op, 0.3)}`,
        borderRadius: 9, padding: 12, display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: oc(op, 0.16), color: oc(op),
            display: "grid", placeItems: "center", fontSize: 13,
          }}>{active.icon}</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{active.label} modu</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{active.desc}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={miniBtn}>Tuvale aç</button>
          <button style={{ ...miniBtn, background: "transparent", color: "var(--dim)" }}>Temizle</button>
        </div>
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "6px 11px", background: "var(--surface-3)",
  border: "1px solid var(--border)", borderRadius: 7,
  color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10.5,
  letterSpacing: "0.04em", cursor: "pointer",
};

// ─── AI Edit Panel ────────────────────────────────────────────────────────────

function AIEditPanel({
  selectedId, setSelectedId, params, setParam, provider, setProvider,
  maskMode, setMaskMode, onSubmit, isGenerating, genMs,
}: {
  selectedId: OpId | null;
  setSelectedId: (id: OpId) => void;
  params: EditParams;
  setParam: (k: keyof EditParams, v: EditParams[keyof EditParams]) => void;
  provider: string;
  setProvider: (p: string) => void;
  maskMode: MaskMode;
  setMaskMode: (m: MaskMode) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  genMs: number;
}) {
  const op = OPERATIONS.find((o) => o.id === selectedId);

  return (
    <aside style={{
      width: 420, flexShrink: 0, height: "100%",
      background: "var(--surface)", borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column", fontFamily: "var(--body)",
    }}>
      {/* Accent strip */}
      <div style={{
        height: 1,
        background: op ? `linear-gradient(90deg, transparent, ${oc(op)}, transparent)` : "transparent",
        opacity: 0.7,
      }} />

      {/* Header */}
      <header style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 13, color: "var(--violet)", textShadow: "0 0 8px rgba(124,109,250,0.4)" }}>✦</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.005em" }}>AI Düzenle</span>
        {isGenerating && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)" }}>
            {(genMs / 1000).toFixed(1)}s…
          </span>
        )}
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "18px 20px 22px" }}>
        {/* Operation */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FieldLabel>İşlem</FieldLabel>
          <OperationDropdown op={op} selectedId={selectedId} setSelectedId={setSelectedId} />
        </div>

        {/* Params box */}
        {op && op.params.length > 0 && (
          <div style={{
            padding: 14, background: "var(--bg-2)", border: "1px solid var(--border)",
            borderRadius: 12, display: "flex", flexDirection: "column", gap: 14, position: "relative",
            animation: "aip-fade 0.18s ease-out",
          }}>
            <style>{`
              @keyframes aip-fade { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
              input[type="range"]::-webkit-slider-thumb { appearance:none; width:14px; height:14px; border-radius:50%; background:#fff; border:0; box-shadow:0 1px 4px rgba(0,0,0,0.5); cursor:grab; }
              input[type="range"]::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#fff; border:0; box-shadow:0 1px 4px rgba(0,0,0,0.5); }
            `}</style>
            {/* Top gradient stripe */}
            <div style={{
              position: "absolute", top: 0, left: 12, right: 12, height: 1,
              background: `linear-gradient(90deg, transparent, ${oc(op)}, transparent)`, opacity: 0.5,
            }} />

            {op.params.includes("prompt") && (
              <ParamPrompt op={op} value={params.prompt} onChange={(v) => setParam("prompt", v)} />
            )}
            {op.params.includes("description") && (
              <ParamText
                label="Restorasyon İpucu" placeholder="Çizikleri onar, renkleri iyileştir…"
                value={params.description} onChange={(v) => setParam("description", v)}
              />
            )}
            {op.params.includes("mask") && (
              <ParamMask op={op} maskMode={maskMode} setMaskMode={setMaskMode} />
            )}
            {op.params.includes("strength") && (
              <ParamSlider op={op} label="Güç" min={0} max={1} step={0.05}
                value={params.strength} onChange={(v) => setParam("strength", v)}
                format={(v) => v.toFixed(2)} />
            )}
            {op.params.includes("direction") && (
              <ParamSeg op={op} label="Yön"
                options={[{ value: "left", label: "← Sol" }, { value: "right", label: "Sağ →" }, { value: "up", label: "↑ Üst" }, { value: "down", label: "↓ Alt" }]}
                value={params.direction} onChange={(v) => setParam("direction", v as string)} />
            )}
            {op.params.includes("pixels") && (
              <ParamSlider op={op} label="Genişlet" min={64} max={512} step={64}
                value={params.pixels} onChange={(v) => setParam("pixels", v)}
                format={(v) => `${v}px`} />
            )}
            {op.params.includes("scale") && (
              <ParamSeg op={op} label="Ölçek"
                options={[{ value: 2, label: "2×" }, { value: 4, label: "4×" }]}
                value={params.scale} onChange={(v) => setParam("scale", v as number)} />
            )}
          </div>
        )}

        {/* Empty state — no params ops */}
        {op && op.params.length === 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--bg-2)", border: `1px solid ${oc(op, 0.3)}`,
            borderRadius: 12, padding: 14, animation: "aip-fade 0.18s ease-out",
          }}>
            <span style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: oc(op, 0.14), color: oc(op),
              display: "grid", placeItems: "center", fontSize: 14,
            }}>{op.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Parametre gerekmez</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)", marginTop: 3 }}>{op.desc}.</div>
            </div>
          </div>
        )}

        <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

        {/* Provider */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FieldLabel>Sağlayıcı</FieldLabel>
          <ProviderPill provider={provider} setProvider={setProvider} op={op} />
        </div>

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={!op || isGenerating}
          style={{
            width: "100%", height: 46, border: 0, borderRadius: 11,
            fontFamily: "var(--body)", fontSize: 13.5, fontWeight: 600,
            cursor: !op || isGenerating ? "not-allowed" : "pointer",
            position: "relative", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, marginTop: 4,
            background: op
              ? `linear-gradient(135deg, ${oc(op)}, ${oc(op, 0.7)})`
              : "rgba(255,255,255,0.04)",
            color: op ? "#fff" : "var(--dim)",
            boxShadow: op ? `0 8px 28px -8px ${oc(op, 0.55)}, inset 0 1px 0 rgba(255,255,255,0.1)` : "none",
            transition: "all 0.18s",
            overflow: "hidden",
          }}
        >
          <span style={{ zIndex: 1 }}>
            {isGenerating ? "Oluşturuluyor…" : op ? `${op.label} Uygula` : "Önce bir işlem seçin"}
          </span>
          {op && !isGenerating && (
            <span style={{ display: "flex", gap: 3, zIndex: 1 }}>
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>↵</kbd>
            </span>
          )}
          {isGenerating && (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "aip-shimmer 1.4s linear infinite",
              pointerEvents: "none",
            }} />
          )}
          <style>{`
            @keyframes aip-shimmer { from { background-position:100% 0; } to { background-position:-100% 0; } }
          `}</style>
        </button>
      </div>
    </aside>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
  padding: "2px 5px", borderRadius: 4,
  background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(255,255,255,0.15)", lineHeight: 1.1,
};

// ─── Image Picker ─────────────────────────────────────────────────────────────

interface PickedImage {
  source: SourceKey | "local";
  file_id?: string;
  previewUrl: string;
  b64?: string;
}

function ImagePicker({ onPick }: { onPick: (img: PickedImage) => void }) {
  const [tab, setTab]           = useState<"cloud" | "local">("cloud");
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<PhotoResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localB64, setLocalB64] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchApi.search(q, 20);
      setResults(res.results);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLocalPreview(dataUrl);
      setLocalB64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLocalPreview(dataUrl);
      setLocalB64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
      backgroundSize: "22px 22px",
    }}>
      <div style={{
        width: 580, maxHeight: "calc(100vh - 120px)",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "var(--violet)", textShadow: "0 0 8px rgba(124,109,250,0.4)" }}>✦</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.3px" }}>Fotoğraf Seç</span>
          </div>
          <div style={{ display: "flex" }}>
            {([["cloud","Buluttan Seç"],["local","Cihazdan Yükle"]] as [string,string][]).map(([id,lbl]) => (
              <button
                key={id}
                onClick={() => setTab(id as "cloud"|"local")}
                style={{
                  padding: "9px 18px", border: 0, borderRadius: 0,
                  background: "transparent",
                  color: tab === id ? "var(--text)" : "var(--dim)",
                  fontFamily: "var(--body)", fontSize: 13.5,
                  fontWeight: tab === id ? 500 : 400,
                  cursor: "pointer",
                  borderBottom: `2px solid ${tab === id ? "var(--violet)" : "transparent"}`,
                  transition: "all 0.15s",
                  marginBottom: -1,
                }}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>
          {tab === "cloud" ? (
            <div>
              <form
                onSubmit={(e) => { e.preventDefault(); doSearch(query); }}
                style={{ display: "flex", gap: 8, marginBottom: 16 }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Fotoğraf ara… (ör: deniz, tatil, aile)"
                  style={{
                    flex: 1, background: "var(--bg-2)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 14px", color: "var(--text)",
                    fontFamily: "var(--body)", fontSize: 13, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "10px 18px", borderRadius: 8, border: 0,
                    background: "var(--violet)", color: "#fff",
                    fontFamily: "var(--body)", fontSize: 13,
                    fontWeight: 500, cursor: "pointer",
                    boxShadow: "0 4px 14px -4px rgba(124,109,250,0.5)",
                  }}
                >Ara</button>
              </form>

              {loading && (
                <div style={{ textAlign: "center", color: "var(--dim)", padding: "40px 0", fontFamily: "var(--mono)", fontSize: 12 }}>
                  Aranıyor…
                </div>
              )}

              {!loading && results.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {results.map((r) => (
                    <button
                      key={`${r.source}-${r.file_id}`}
                      onClick={() => onPick({ source: r.source, file_id: r.file_id, previewUrl: thumbnailUrl(r.file_id, r.source) })}
                      style={{
                        padding: 0, border: "2px solid transparent", borderRadius: 8,
                        overflow: "hidden", cursor: "pointer",
                        background: "var(--surface-2)", transition: "border-color 0.12s",
                        aspectRatio: "1",
                      }}
                      title={r.filename}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--violet)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailUrl(r.file_id, r.source)}
                        alt={r.filename}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {!loading && results.length === 0 && !query && (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ display: "block", margin: "0 auto 12px", color: "var(--dimmer)", opacity: 0.5 }}>
                    <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dimmer)", margin: 0, letterSpacing: "0.06em" }}>
                    Arama yaparak fotoğraflarınıza göz atın
                  </p>
                </div>
              )}

              {!loading && results.length === 0 && query && (
                <div style={{ textAlign: "center", color: "var(--dim)", padding: "40px 0", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.05em" }}>
                  Sonuç bulunamadı
                </div>
              )}
            </div>
          ) : (
            <div>
              {localPreview ? (
                <div style={{ textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={localPreview} alt="preview"
                    style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10, marginBottom: 16, display: "block", margin: "0 auto 16px" }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button
                      onClick={() => { setLocalPreview(null); setLocalB64(null); if (fileRef.current) fileRef.current.value = ""; }}
                      style={{ ...pickerBtnSecondary }}
                    >Değiştir</button>
                    <button
                      onClick={() => { if (localB64) onPick({ source: "local", previewUrl: localPreview!, b64: localB64 }); }}
                      style={{
                        padding: "9px 22px", background: "var(--violet)", border: 0, borderRadius: 8,
                        color: "#fff", fontFamily: "var(--body)", fontSize: 13,
                        fontWeight: 500, cursor: "pointer",
                        boxShadow: "0 4px 14px -4px rgba(124,109,250,0.5)",
                      }}
                    >Bu Fotoğrafı Kullan</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  style={{
                    border: "2px dashed var(--border-2)", borderRadius: 12,
                    padding: "56px 40px", textAlign: "center", cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = "var(--violet)";
                    el.style.background = "rgba(124,109,250,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = "var(--border-2)";
                    el.style.background = "transparent";
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ display: "block", margin: "0 auto 14px", color: "var(--dimmer)" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p style={{ fontFamily: "var(--body)", fontSize: 14, fontWeight: 500, color: "var(--text)", margin: "0 0 6px" }}>
                    Dosya sürükleyip bırakın veya tıklayın
                  </p>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dimmer)", margin: 0, letterSpacing: "0.05em" }}>
                    PNG, JPG, WebP — Max 20 MB
                  </p>
                </div>
              )}
              <input
                ref={fileRef} type="file" accept="image/*"
                onChange={onFileChange} style={{ display: "none" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pickerBtnSecondary: React.CSSProperties = {
  padding: "9px 16px", background: "var(--surface-2)",
  border: "1px solid var(--border)", borderRadius: 8,
  color: "var(--text-muted)", fontFamily: "var(--body)", fontSize: 13,
  cursor: "pointer",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EditPage() {
  const searchParams = useSearchParams();
  const cloudFileId = searchParams.get("file_id");
  const cloudSource = searchParams.get("source") as SourceKey | null;

  // Panel state
  const [selectedId, setSelectedId] = useState<OpId | null>(null);
  const [params, setParamsState] = useState<EditParams>({
    prompt: "", description: "", strength: 0.85, direction: "right", pixels: 256, scale: 2,
  });
  const setParam = (k: keyof EditParams, v: EditParams[keyof EditParams]) =>
    setParamsState((p) => ({ ...p, [k]: v }));
  const [provider, setProvider] = useState("replicate");
  const [maskMode, setMaskMode] = useState<MaskMode>("brush");

  // Canvas / view
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [genStart, setGenStart] = useState(0);
  const [genMs, setGenMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Integrations (for save dropdown)
  const [integrations, setIntegrations] = useState<IntegrationsResponse | null>(null);
  useEffect(() => { integrationApi.status().then(setIntegrations).catch(() => null); }, []);

  // Timer during generation
  useEffect(() => {
    if (!isGenerating) return;
    const id = setInterval(() => setGenMs(Date.now() - genStart), 100);
    return () => clearInterval(id);
  }, [isGenerating, genStart]);

  // Image picked via picker (overrides URL params)
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);

  const activeImage: PickedImage | null =
    pickedImage ??
    (cloudFileId && cloudSource
      ? { source: cloudSource, file_id: cloudFileId, previewUrl: thumbnailUrl(cloudFileId, cloudSource) }
      : null);

  const beforeUrl = activeImage?.previewUrl ?? null;
  const filename = activeImage?.file_id ?? "photo.jpg";

  const handleSubmit = useCallback(async () => {
    if (!selectedId || isGenerating) return;
    if (!activeImage) {
      setError("Düzenlemek için önce bir fotoğraf seçin.");
      return;
    }

    setIsGenerating(true);
    setHasResult(false);
    setResultImage(null);
    setError(null);
    const t0 = Date.now();
    setGenStart(t0);
    setGenMs(0);

    try {
      const op = OPERATIONS.find((o) => o.id === selectedId)!;
      const body: NewEditRequest = {
        source: activeImage.source === "local" ? "gdrive" : activeImage.source,
        file_id: activeImage.file_id ?? "",
        image_b64: activeImage.b64,
        edit_provider: provider,
        islem: selectedId,
        prompt: op.params.includes("prompt") ? params.prompt || undefined : undefined,
        guc: op.params.includes("strength") ? params.strength : undefined,
        yon: op.params.includes("direction") ? params.direction : undefined,
        genisletme_px: op.params.includes("pixels") ? params.pixels : undefined,
        olcek: op.params.includes("scale") ? params.scale as 2 | 4 : undefined,
        aciklama: op.params.includes("description") ? params.description || undefined : undefined,
      };

      const res = await editApi.edit(body);

      if (res.hata) throw new Error(res.hata);

      setResultImage(`data:image/jpeg;base64,${res.sonuc_b64}`);
      setHasResult(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI düzenleme başarısız");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedId, isGenerating, activeImage, provider, params]);

  // Cmd+Enter / Ctrl+Enter hotkey
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleSubmit]);

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      <Sidebar />

      <div style={{
        marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease", height: "100vh",
        display: "flex", overflow: "hidden",
      }}>
        {/* Main canvas area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <TopBar
            viewMode={viewMode} setViewMode={setViewMode}
            zoom={zoom} setZoom={setZoom}
            resultImage={resultImage} filename={filename}
            hasImage={!!activeImage}
            onChangeImage={() => { setPickedImage(null); setHasResult(false); setResultImage(null); }}
          />
          {!activeImage ? (
            <ImagePicker onPick={(img) => { setPickedImage(img); setHasResult(false); setResultImage(null); }} />
          ) : (
            <CompareCanvas
              beforeUrl={beforeUrl} resultImage={resultImage}
              op={OPERATIONS.find((o) => o.id === selectedId)}
              viewMode={viewMode} zoom={zoom}
              isGenerating={isGenerating} hasResult={hasResult}
            />
          )}

          {/* Error bar */}
          {error && (
            <div style={{
              position: "absolute", bottom: 24, left: "calc(var(--sidebar-w) + 24px)",
              background: "var(--surface)", border: "1px solid var(--error)",
              borderRadius: 10, padding: "10px 16px",
              color: "var(--error)", fontSize: 13, fontFamily: "var(--body)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 20,
            }}>
              {error}
              <button onClick={() => setError(null)} style={{
                marginLeft: 12, background: "none", border: "none",
                color: "var(--error)", cursor: "pointer", fontSize: 14, opacity: 0.7,
              }}>×</button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <AIEditPanel
          selectedId={selectedId} setSelectedId={setSelectedId}
          params={params} setParam={setParam}
          provider={provider} setProvider={setProvider}
          maskMode={maskMode} setMaskMode={setMaskMode}
          onSubmit={handleSubmit}
          isGenerating={isGenerating} genMs={genMs}
        />
      </div>
    </div>
  );
}
