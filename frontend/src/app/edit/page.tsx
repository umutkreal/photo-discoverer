"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar, { SIDEBAR_WIDTH } from "@/components/common/Sidebar";
import { editApi, thumbnailUrl, integrationApi, searchApi } from "@/lib/api";
import type { SourceKey, IntegrationsResponse, NewEditRequest, PhotoResult } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type OpId =
  | "inpainting" | "outpainting" | "style_transfer" | "background_remove"
  | "text_edit" | "restore" | "upscale";

type ViewMode  = "compare" | "before" | "after";
type MaskMode  = "brush" | "box" | "smart";
type MaskTool  = "brush" | "eraser" | "rect" | "circle";

interface Operation {
  id: OpId; label: string; icon: string; description: string;
  color: string; params: string[]; model: string;
}

interface EditParams {
  prompt: string; description: string;
  strength: number; steps: number; scale: number;
  outpaint_mode: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const OPERATIONS: Operation[] = [
  { id: "inpainting",        label: "Inpainting",         icon: "✦", description: "Masked alanı yeni içerikle doldur",       color: "#7C6AF7", params: ["prompt","mask","strength"], model: "black-forest-labs/flux-fill-pro"      },
  { id: "outpainting",       label: "Outpainting",        icon: "⊞", description: "Görüntüyü kenarından genişlet",           color: "#5BA4F5", params: ["outpaint_mode","prompt","steps"], model: "black-forest-labs/flux-fill-pro"  },
  { id: "style_transfer",    label: "Stil Transferi",     icon: "◫", description: "Promptla görüntünün stilini dönüştür",   color: "#4FC08D", params: ["prompt"],                   model: "black-forest-labs/flux-kontext-pro"  },
  { id: "background_remove", label: "Arka Plan Kaldır",   icon: "⬡", description: "Arka planı kaldır, şeffaf PNG çıkar",     color: "#E879A0", params: [],                           model: "bria/remove-background"              },
  { id: "text_edit",         label: "Metin ile Düzenle",  icon: "✎", description: "Doğal dil talimatıyla serbest düzenle",   color: "#F472B6", params: ["prompt"],                   model: "black-forest-labs/flux-kontext-max"  },
  { id: "restore",           label: "Restorasyon",        icon: "◎", description: "Çizik, hasar, solmayı onar",              color: "#F5A623", params: ["description"],              model: "flux-kontext-apps/restore-image"     },
  { id: "upscale",           label: "Çözünürlük Artır",  icon: "⊕", description: "2× veya 4× çözünürlük artır",            color: "#50B8E7", params: ["scale"],                    model: "philz1337x/clarity-pro-upscaler"    },
];


const PROMPT_PLACEHOLDERS: Partial<Record<OpId, string>> = {
  inpainting:      "Seçili alanı doldur: mavi gökyüzü…",
  outpainting:     "Zoom out 2x, extend left, add sky above…",
  style_transfer:  "Stili dönüştür: empresyonist resim gibi…",
  text_edit:       "Ne yapmak istediğini yaz…",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function oc(op: Operation | undefined, alpha = 1): string {
  const color = op?.color ?? "#383838";
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
      height: 64, flexShrink: 0,
      display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
      gap: 16, padding: "0 24px",
      background: "var(--bg)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Left — change image */}
      <div>
        {hasImage && (
          <button
            onClick={onChangeImage}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 14px", borderRadius: 8, border: 0,
              background: "transparent", color: "var(--dimmer)",
              fontFamily: "var(--body)", fontSize: 14, cursor: "pointer",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--dimmer)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Fotoğraf Değiştir
          </button>
        )}
      </div>

      {/* Center — view toggle (plain text, underline active) */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {(["compare","before","after"] as ViewMode[]).map((v, i) => (
          <React.Fragment key={v}>
            {i > 0 && (
              <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
            )}
            <button
              onClick={() => setViewMode(v)}
              style={{
                padding: "6px 16px", border: 0, background: "transparent",
                color: viewMode === v ? "var(--text)" : "var(--dimmer)",
                fontFamily: "var(--body)", fontSize: 15,
                fontWeight: viewMode === v ? 500 : 400,
                cursor: "pointer", transition: "color 0.12s",
                borderBottom: viewMode === v ? "1px solid rgba(255,255,255,0.45)" : "1px solid transparent",
              }}
            >
              {v === "compare" ? "Karşılaştır" : v === "before" ? "Önce" : "Sonra"}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Right — zoom + download + save */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={() => setZoom(Math.max(0.25, zoom - 0.1))} style={zoomBtnStyle}>−</button>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--dim)", minWidth: 46, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.1))} style={zoomBtnStyle}>+</button>

        <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <button
          onClick={download}
          disabled={!resultImage}
          style={{
            width: 36, height: 36, border: 0, background: "transparent",
            color: resultImage ? "var(--dim)" : "var(--dimmer)",
            cursor: resultImage ? "pointer" : "not-allowed",
            display: "grid", placeItems: "center", borderRadius: 8,
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => { if (resultImage) (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = resultImage ? "var(--dim)" : "var(--dimmer)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        <button style={{
          height: 36, padding: "0 18px", border: 0, borderRadius: 8,
          background: "linear-gradient(180deg, #8b92a8 0%, #636a7a 40%, #535a68 100%)",
          color: "#eef0f6", fontFamily: "var(--body)", fontSize: 14, fontWeight: 600,
          cursor: "pointer",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)",
        }}>
          Buluta Kaydet
        </button>
      </div>
    </header>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 34, height: 34, background: "transparent", border: 0, borderRadius: 7,
  color: "var(--dim)", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 18,
};

// ─── CompareCanvas ────────────────────────────────────────────────────────────

function CompareCanvas({
  beforeUrl, resultImage, op, viewMode, zoom, isGenerating, hasResult,
}: {
  beforeUrl: string | null; resultImage: string | null;
  op: Operation | undefined; viewMode: ViewMode; zoom: number;
  isGenerating: boolean; hasResult: boolean;
}) {
  const [pos, setPos] = useState(50);
  const [drag, setDrag] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const [resultDims, setResultDims] = useState<{w:number,h:number}|null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const calcDisplaySize = (nw: number, nh: number) => {
    const maxW = Math.min(900, window.innerWidth - 460 - 80);
    const maxH = window.innerHeight * 0.78;
    let w = nw, h = nh;
    if (w > maxW) { h = Math.round(h * maxW / w); w = Math.round(maxW); }
    if (h > maxH) { w = Math.round(w * maxH / h); h = Math.round(maxH); }
    return { w, h };
  };

  const handleBeforeLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { w, h } = calcDisplaySize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
    setBoxW(w);
    setBoxH(h);
  }, []);

  const handleResultLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { w, h } = calcDisplaySize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
    setResultDims({ w, h });
  }, []);

  useEffect(() => {
    if (!resultImage) setResultDims(null);
  }, [resultImage]);

  // Always-on listeners — use dragRef so there's no frame-delay timing gap
  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const cx = "touches" in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      setPos(Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100)));
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      setDrag(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, []);

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
        <div>
          {(() => {
            const dispW = resultDims ? resultDims.w : boxW;
            const dispH = resultDims ? resultDims.h : boxH;
            const resultIsLarger = resultDims != null && (resultDims.w > boxW || resultDims.h > boxH);
            return (
          <div
            ref={wrapRef}
            style={{
              position: "relative",
              width: dispW || undefined,
              height: dispH || undefined,
              borderRadius: 10, overflow: "hidden",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
              background: "#000",
              transform: `scale(${zoom})`,
              transformOrigin: "center",
              transition: "transform 0.18s ease",
            }}
          >
            {/* BEFORE layer — onLoad sets explicit container dimensions */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beforeUrl}
              alt="before"
              draggable={false}
              onLoad={handleBeforeLoad}
              style={{
                display: "block",
                width: (boxW || resultIsLarger) ? "100%" : "auto",
                height: (boxH || resultIsLarger) ? "100%" : "auto",
                maxWidth: boxW ? "none" : "min(900px, calc(100vw - 460px - 80px))",
                maxHeight: boxH ? "none" : "78vh",
                objectFit: resultIsLarger ? "contain" : undefined,
                userSelect: "none", pointerEvents: "none",
              }}
            />

            {/* Solid backdrop — prevents before image showing through transparent result (e.g. background_remove PNG) */}
            {showAfter && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 1,
                background: "var(--bg)",
                clipPath: afterClip, WebkitClipPath: afterClip,
              }} />
            )}

            {/* AFTER layer */}
            {showAfter && resultImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultImage}
                alt="after"
                draggable={false}
                onLoad={handleResultLoad}
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain", userSelect: "none", pointerEvents: "none",
                  clipPath: afterClip, WebkitClipPath: afterClip,
                  zIndex: 2,
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
                {/* Line — left% is relative to parent, which is what we want */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: 2,
                  left: `calc(${pos}% - 1px)`,
                  background: "rgba(255,255,255,0.85)",
                  zIndex: 5, pointerEvents: "none",
                }} />

                {/* Handle — sibling, same left% anchor */}
                <button
                  draggable={false}
                  onMouseDown={(e) => { e.preventDefault(); dragRef.current = true; setDrag(true); }}
                  onTouchStart={() => { dragRef.current = true; setDrag(true); }}
                  style={{
                    position: "absolute", top: "50%",
                    left: `${pos}%`,
                    transform: `translate(-50%, -50%) scale(${drag ? 1.1 : 1})`,
                    width: 36, height: 36, borderRadius: "50%",
                    background: "#fff", border: 0, color: "#111",
                    cursor: "ew-resize", display: "grid", placeItems: "center",
                    zIndex: 6,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
                    transition: "transform 0.1s",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6" transform="translate(6,0)"/>
                  </svg>
                </button>
              </>
            )}
          </div>
          ); })()}
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
              <span style={{ fontSize: 15, fontWeight: 500 }}>{op.label}</span>
            </>
          ) : (
            <span style={{ fontSize: 15, color: "var(--dim)" }}>Bir işlem seçin…</span>
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
                <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: "var(--text)" }}>{o.label}</span>
                <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{o.description}</span>
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


// ─── Parameter components ─────────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500,
      letterSpacing: "0.08em", color: "var(--dim)", textTransform: "uppercase", marginBottom: 8,
    }}>
      <span>{children}</span>
      {hint && <span style={{ fontSize: 12, color: "var(--dimmer)", letterSpacing: "0.04em", fontWeight: 400 }}>{hint}</span>}
    </div>
  );
}

function ParamPrompt({ op, value, onChange }: { op: Operation; value: string; onChange: (v: string) => void }) {
  const placeholder = PROMPT_PLACEHOLDERS[op.id] ?? "Ne yapmak istediğinizi açıklayın…";
  return (
    <div>
      <FieldLabel hint={`${value.length}/500`}>Prompt</FieldLabel>
      <textarea
        rows={3} maxLength={500} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", background: "var(--surface)", border: `1px solid ${value ? oc(op, 0.4) : "var(--border)"}`,
          borderRadius: 8, padding: "12px 14px", fontFamily: "inherit", fontSize: 15,
          color: "var(--text)", resize: "none", outline: "none", boxSizing: "border-box",
          lineHeight: 1.5, transition: "border-color 0.15s",
        }}
      />
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
          borderRadius: 8, padding: "12px 14px", fontFamily: "inherit", fontSize: 15,
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

function ParamSelect({ op, label, options, value, onChange }: {
  op: Operation; label: string; options: string[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: `1px solid ${oc(op, 0.35)}`, background: "var(--surface)",
          color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12,
          cursor: "pointer", outline: "none",
        }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
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
                fontFamily: "var(--mono)", fontSize: 13, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mask Canvas Modal ────────────────────────────────────────────────────────

function MaskCanvasModal({ imageUrl, onClose, onConfirm }: {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (maskB64: string) => void;
}) {
  const [tool, setTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(15);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const isDown = useRef(false);
  const saved = useRef<ImageData | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const history = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = Math.min(window.innerWidth * 0.88, 1100);
      const maxH = window.innerHeight * 0.76;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxW) { h = Math.round(h * maxW / w); w = Math.round(maxW); }
      if (h > maxH) { w = Math.round(w * maxH / h); h = Math.round(maxH); }
      setDisplaySize({ w, h });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const canvasXY = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pushHistory = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    history.current.push(ctx.getImageData(0, 0, displaySize.w, displaySize.h));
    if (history.current.length > 40) history.current.shift();
    setCanUndo(true);
  }, [displaySize]);

  const undo = useCallback(() => {
    const snap = history.current.pop();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (snap) {
      ctx.putImageData(snap, 0, 0);
    } else {
      ctx.clearRect(0, 0, displaySize.w, displaySize.h);
    }
    setCanUndo(history.current.length > 0);
  }, [displaySize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDown.current = true;
    const p = canvasXY(e);
    origin.current = p;
    const ctx = canvasRef.current!.getContext("2d")!;
    pushHistory();
    if (tool === "brush" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    } else {
      saved.current = ctx.getImageData(0, 0, displaySize.w, displaySize.h);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDown.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = canvasXY(e);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;

    const BRUSH  = "rgba(80, 60, 240, 0.82)";
    const SHAPE  = "rgb(80, 60, 240)";
    if (tool === "brush") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = BRUSH;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (tool === "rect" && saved.current) {
      ctx.putImageData(saved.current, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = SHAPE;
      ctx.fillRect(origin.current.x, origin.current.y, p.x - origin.current.x, p.y - origin.current.y);
    } else if (tool === "circle" && saved.current) {
      ctx.putImageData(saved.current, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      const rx = Math.abs(p.x - origin.current.x) / 2;
      const ry = Math.abs(p.y - origin.current.y) / 2;
      const cx = Math.min(p.x, origin.current.x) + rx;
      const cy = Math.min(p.y, origin.current.y) + ry;
      ctx.fillStyle = SHAPE;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handleMouseUp = useCallback(() => {
    isDown.current = false;
    saved.current = null;
    canvasRef.current?.getContext("2d")?.beginPath();
  }, []);

  const clearMask = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    pushHistory();
    ctx.clearRect(0, 0, displaySize.w, displaySize.h);
  };

  const applyMask = () => {
    if (!canvasRef.current) return;
    const src = canvasRef.current.getContext("2d")!
      .getImageData(0, 0, displaySize.w, displaySize.h);
    const exp = document.createElement("canvas");
    exp.width = displaySize.w;
    exp.height = displaySize.h;
    const ectx = exp.getContext("2d")!;
    const out = ectx.createImageData(displaySize.w, displaySize.h);
    for (let i = 0; i < src.data.length; i += 4) {
      const v = src.data[i + 3] > 10 ? 255 : 0; // painted → white, transparent → black
      out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    ectx.putImageData(out, 0, 0);
    onConfirm(exp.toDataURL("image/png").split(",")[1]);
  };

  const MASK_TOOLS: { id: MaskTool; title: string; icon: React.ReactNode }[] = [
    { id: "brush", title: "Fırça", icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1 3.5 1 1.66 0 3-1.34 3-3s-1.34-3.04-1.5-3.04z"/>
      </svg>
    )},
    { id: "eraser", title: "Silgi", icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/><path d="M6 11l7 7"/>
      </svg>
    )},
    { id: "rect", title: "Dikdörtgen", icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
    )},
    { id: "circle", title: "Elips", icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="12" rx="10" ry="7"/>
      </svg>
    )},
  ];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(4,4,8,0.94)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
      }}
      onMouseUp={handleMouseUp}
    >
      <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", letterSpacing: "0.06em", margin: 0 }}>
        Düzenlenecek alanı boyayın — koyu = düzenle
      </p>

      {displaySize.w > 0 && (
        <div style={{
          position: "relative", borderRadius: 10, overflow: "hidden",
          boxShadow: "0 24px 64px -16px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" draggable={false}
            style={{ display: "block", width: displaySize.w, height: displaySize.h }}
          />
          <canvas
            ref={canvasRef} width={displaySize.w} height={displaySize.h}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            style={{ position: "absolute", inset: 0, cursor: "crosshair", userSelect: "none" }}
          />
        </div>
      )}

      {/* Horizontal toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(16,16,22,0.98)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: "10px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        {MASK_TOOLS.map((t) => (
          <button key={t.id} title={t.title} onClick={() => setTool(t.id)} style={{
            width: 44, height: 44, border: 0, borderRadius: 10,
            background: tool === t.id ? "rgba(124,110,250,0.25)" : "transparent",
            color: tool === t.id ? "#b8adff" : "rgba(255,255,255,0.45)",
            cursor: "pointer", display: "grid", placeItems: "center", transition: "all 0.12s",
            boxShadow: tool === t.id ? "0 0 0 1px rgba(124,110,250,0.45)" : "none",
          }}>{t.icon}</button>
        ))}

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <button onClick={undo} title="Geri Al (Ctrl+Z)" disabled={!canUndo} style={{
          width: 44, height: 44, border: 0, borderRadius: 10, background: "transparent",
          color: canUndo ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.15)",
          cursor: canUndo ? "pointer" : "not-allowed", display: "grid", placeItems: "center", transition: "color 0.12s",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M3 13C5.5 6.5 14 4 20 8"/>
          </svg>
        </button>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <input
          type="number" min={1} max={200} value={brushSize}
          onChange={(e) => setBrushSize(Math.max(1, Math.min(200, Number(e.target.value))))}
          style={{
            width: 54, background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
            color: "rgba(255,255,255,0.9)", fontFamily: "var(--mono)", fontSize: 15,
            fontWeight: 600, textAlign: "center", padding: "0 4px", height: 44,
            outline: "none", boxSizing: "border-box",
          }}
        />

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <button onClick={clearMask} title="Temizle" style={{
          width: 44, height: 44, border: 0, borderRadius: 10, background: "transparent",
          color: "rgba(255,255,255,0.45)", cursor: "pointer", display: "grid", placeItems: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <button onClick={onClose} style={{
          height: 44, padding: "0 18px", borderRadius: 10, border: 0,
          background: "transparent", color: "rgba(255,255,255,0.45)", fontFamily: "var(--body)",
          fontSize: 13, cursor: "pointer",
        }}>İptal</button>

        <button onClick={applyMask} style={{
          height: 44, padding: "0 22px", borderRadius: 10, border: 0,
          background: "rgba(100,88,200,0.55)",
          color: "rgba(255,255,255,0.9)", fontFamily: "var(--body)", fontSize: 13, fontWeight: 600,
          cursor: "pointer", marginLeft: 2,
        }}>Uygula</button>
      </div>
    </div>
  );
}

// ─── ParamMask ────────────────────────────────────────────────────────────────

function ParamMask({ op, imageUrl, maskB64, onOpenCanvas, onClearMask }: {
  op: Operation;
  imageUrl: string | null; maskB64: string | null;
  onOpenCanvas: () => void; onClearMask: () => void;
}) {
  return (
    <div>
      <FieldLabel hint="Zorunlu">Mask çiz</FieldLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onOpenCanvas} style={miniBtn}>
          {maskB64 ? "Tuvale aç · Düzenle" : "Tuvale aç"}
        </button>
        {maskB64 && (
          <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${maskB64}`} alt="mask"
              style={{ width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 6, opacity: 0.8, display: "block" }}
            />
            <button
              onClick={onClearMask}
              title="Temizle"
              style={{
                position: "absolute", top: 4, right: 4,
                width: 20, height: 20, borderRadius: 4, border: 0,
                background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.7)",
                cursor: "pointer", display: "grid", placeItems: "center", fontSize: 11,
              }}
            >×</button>
          </div>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "6px 11px", background: "var(--surface-3)",
  border: "1px solid var(--border)", borderRadius: 7,
  color: "var(--text)", fontFamily: "var(--mono)", fontSize: 13,
  letterSpacing: "0.04em", cursor: "pointer",
};

// ─── AI Edit Panel ────────────────────────────────────────────────────────────

function AIEditPanel({
  selectedId, setSelectedId, params, setParam,
  maskMode, setMaskMode, imageUrl, maskB64, onOpenMask, onClearMask,
  onSubmit, isGenerating, isQueued, genMs,
}: {
  selectedId: OpId | null;
  setSelectedId: (id: OpId) => void;
  params: EditParams;
  setParam: (k: keyof EditParams, v: EditParams[keyof EditParams]) => void;
  maskMode: MaskMode;
  setMaskMode: (m: MaskMode) => void;
  imageUrl: string | null;
  maskB64: string | null;
  onOpenMask: () => void;
  onClearMask: () => void;
  onSubmit: () => void;
  isGenerating: boolean;
  isQueued: boolean;
  genMs: number;
}) {
  const op = OPERATIONS.find((o) => o.id === selectedId);

  return (
    <aside style={{
      width: 460, flexShrink: 0, height: "100%",
      background: "var(--bg)", borderLeft: "1px solid rgba(255,255,255,0.05)",
      display: "flex", flexDirection: "column", fontFamily: "var(--body)",
    }}>
      {/* Accent strip */}
      <div style={{
        height: 1,
        background: op ? `linear-gradient(90deg, transparent, ${oc(op)}, transparent)` : "transparent",
        opacity: 0.7,
      }} />

      {/* Header */}
      <header style={{
        padding: "18px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left — active model name */}
        <span style={{
          fontFamily: "'Eightgon', sans-serif",
          fontSize: 13, letterSpacing: "0.04em",
          color: op ? oc(op, 0.75) : "var(--dimmer)",
          transition: "color 0.2s",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: 220,
        }}>
          {op ? op.model : "—"}
        </span>

        {/* Right — timer */}
        {isGenerating && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)", flexShrink: 0 }}>
            {(genMs / 1000).toFixed(1)}s…
          </span>
        )}
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, padding: "22px 24px 26px" }}>
        {/* Operation */}
        <div>
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
                label="Restorasyon İpucu" placeholder="Çizikleri düzelt, renkleri iyileştir…"
                value={params.description} onChange={(v) => setParam("description", v)}
              />
            )}
            {op.params.includes("mask") && (
              <ParamMask
                op={op}
                imageUrl={imageUrl} maskB64={maskB64}
                onOpenCanvas={onOpenMask} onClearMask={onClearMask}
              />
            )}
            {op.params.includes("strength") && (
              <ParamSlider op={op} label="Güç" min={0} max={1} step={0.05}
                value={params.strength} onChange={(v) => setParam("strength", v)}
                format={(v) => v.toFixed(2)} />
            )}
            {op.params.includes("outpaint_mode") && (
              <ParamSelect op={op} label="Mod" value={params.outpaint_mode} onChange={(v) => setParam("outpaint_mode", v)}
                options={["Zoom out 1.5x","Zoom out 2x","Make square","Left outpaint","Right outpaint","Top outpaint","Bottom outpaint"]} />
            )}
            {op.params.includes("steps") && (
              <ParamSlider op={op} label="Adımlar" min={1} max={50} step={1}
                value={params.steps} onChange={(v) => setParam("steps", v)}
                format={(v) => `${v}`} />
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
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text)" }}>Parametre gerekmez</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--dim)", marginTop: 3 }}>{op.description}.</div>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={!op || isGenerating || isQueued}
          style={{
            width: "100%", height: 54, borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            fontFamily: "var(--body)", fontSize: 16, fontWeight: 600,
            cursor: !op || isGenerating || isQueued ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, marginTop: 4,
            background: isQueued
              ? "linear-gradient(180deg, #5a8a6a 0%, #3d6b50 50%, #336045 100%)"
              : op
                ? "linear-gradient(180deg, #9aa2b2 0%, #737a8a 35%, #5e6474 65%, #525769 100%)"
                : "linear-gradient(180deg, #3a3d47 0%, #2e3039 100%)",
            color: isQueued ? "#c8f0d8" : op ? "#f0f2f8" : "var(--dimmer)",
            boxShadow: op && !isQueued
              ? "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.5)"
              : isQueued
                ? "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.3)"
                : "inset 0 1px 0 rgba(255,255,255,0.04)",
            transition: "opacity 0.15s",
            opacity: isGenerating ? 0.75 : 1,
          }}
        >
          {isQueued ? "✓ Sıraya Alındı" : isGenerating ? "Oluşturuluyor…" : op ? `${op.label} Çalıştır` : "Önce bir işlem seçin"}
          {op && !isGenerating && !isQueued && (
            <span style={{ display: "flex", gap: 3 }}>
              <kbd style={kbdStyle}>⌘</kbd>
              <kbd style={kbdStyle}>↵</kbd>
            </span>
          )}
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
            <span style={{ fontSize: 14, color: "var(--violet)", textShadow: "0 0 8px rgba(56,56,56,0.4)" }}>✦</span>
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
                    boxShadow: "0 4px 14px -4px rgba(56,56,56,0.3)",
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
                        boxShadow: "0 4px 14px -4px rgba(56,56,56,0.3)",
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
                    el.style.background = "rgba(255,255,255,0.04)";
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
    prompt: "", description: "", strength: 0.85, steps: 50, scale: 2,
    outpaint_mode: "Zoom out 2x",
  });
  const setParam = (k: keyof EditParams, v: EditParams[keyof EditParams]) =>
    setParamsState((p) => ({ ...p, [k]: v }));
  const [maskMode, setMaskMode] = useState<MaskMode>("brush");
  const [maskB64, setMaskB64] = useState<string | null>(null);
  const [maskOpen, setMaskOpen] = useState(false);

  // Canvas / view
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [beforeFullImage, setBeforeFullImage] = useState<string | null>(null);
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
        edit_provider: "replicate",
        islem: selectedId,
        prompt: op.params.includes("prompt") ? params.prompt || undefined : undefined,
        guc: op.params.includes("strength") ? params.strength : undefined,
        outpaint_modu: op.params.includes("outpaint_mode") ? params.outpaint_mode : undefined,
        adimlar: op.params.includes("steps") ? params.steps : undefined,
        olcek: op.params.includes("scale") ? params.scale as 2 | 4 : undefined,
        aciklama: op.params.includes("description") ? params.description || undefined : undefined,
        maske_b64: op.params.includes("mask") ? maskB64 ?? undefined : undefined,
      };

      const res = await editApi.edit(body);

      if (res.hata) throw new Error(res.hata);

      setResultImage(`data:${res.mime_type};base64,${res.sonuc_b64}`);
      if (res.gorsel_b64) setBeforeFullImage(`data:image/jpeg;base64,${res.gorsel_b64}`);
      setHasResult(true);
      setIsQueued(true);
      setTimeout(() => setIsQueued(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI düzenleme başarısız");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedId, isGenerating, activeImage, params]);

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
            onChangeImage={() => { setPickedImage(null); setHasResult(false); setResultImage(null); setBeforeFullImage(null); setMaskB64(null); }}
          />
          {!activeImage ? (
            <ImagePicker onPick={(img) => { setPickedImage(img); setHasResult(false); setResultImage(null); setBeforeFullImage(null); setMaskB64(null); }} />
          ) : (
            <CompareCanvas
              beforeUrl={beforeFullImage ?? beforeUrl} resultImage={resultImage}
              op={OPERATIONS.find((o) => o.id === selectedId)}
              viewMode={viewMode} zoom={zoom}
              isGenerating={isGenerating} hasResult={hasResult}
            />
          )}

          {/* Error toast */}
          {error && (
            <div style={{
              position: "absolute", bottom: 28,
              left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 12,
              background: "rgba(22,14,14,0.97)",
              border: "1px solid rgba(220,60,60,0.35)",
              borderRadius: 12, padding: "12px 16px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              zIndex: 20, maxWidth: 420, width: "max-content",
              animation: "toast-in 0.2s ease-out",
            }}>
              <style>{`@keyframes toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "rgba(220,60,60,0.15)",
                display: "grid", placeItems: "center",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(240,80,80,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <span style={{ fontSize: 13, color: "rgba(255,200,200,0.9)", fontFamily: "var(--body)", lineHeight: 1.4 }}>
                {error}
              </span>
              <button onClick={() => setError(null)} style={{
                marginLeft: 4, flexShrink: 0, width: 22, height: 22, borderRadius: 6,
                background: "transparent", border: 0,
                color: "rgba(255,255,255,0.3)", cursor: "pointer",
                display: "grid", placeItems: "center", fontSize: 15, lineHeight: 1,
              }}>×</button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <AIEditPanel
          selectedId={selectedId} setSelectedId={setSelectedId}
          params={params} setParam={setParam}
          maskMode={maskMode} setMaskMode={setMaskMode}
          imageUrl={beforeUrl} maskB64={maskB64}
          onOpenMask={() => { if (beforeUrl) setMaskOpen(true); }}
          onClearMask={() => setMaskB64(null)}
          onSubmit={handleSubmit}
          isGenerating={isGenerating} isQueued={isQueued} genMs={genMs}
        />

        {/* Mask canvas modal */}
        {maskOpen && beforeUrl && (
          <MaskCanvasModal
            imageUrl={beforeUrl}
            onClose={() => setMaskOpen(false)}
            onConfirm={(b64) => { setMaskB64(b64); setMaskOpen(false); }}
          />
        )}
      </div>
    </div>
  );
}
