"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// ─── Icons ────────────────────────────────────────────────────

const Logo = () => (
  <svg width="27" height="27" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
    <rect x="13" y="2" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
    <rect x="2" y="13" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
    <rect x="13" y="13" width="9" height="9" rx="2" fill="white" opacity="0.3"/>
  </svg>
);


const ISearch = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
);

const IAlbums = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M9 21V9"/>
  </svg>
);

const IDuplicates = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="8" y="8" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const IEdit = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
  </svg>
);


const IUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);

const IHelp = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <path d="M12 17h.01"/>
  </svg>
);

const ILogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const IChevron = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// ─── Nav items ────────────────────────────────────────────────

const NAV = [
  { href: "/search",     label: "Ara",          Icon: ISearch     },
  { href: "/edit",       label: "AI Düzenle",   Icon: IEdit       },
  { href: "/albums",     label: "Albümler",     Icon: IAlbums     },
  { href: "/duplicates", label: "Yinelenenler", Icon: IDuplicates },
];

type MenuItem =
  | { divider: true }
  | { label: string; Icon: () => React.ReactElement; shortcut?: string; arrow?: boolean; href?: string; action?: string; danger?: boolean };

const MENU: MenuItem[] = [
  { label: "Hesabım",   Icon: IUser,    href: "/account" },
  { label: "Yardım al", Icon: IHelp,   href: "#" },
  { divider: true },
  { label: "Çıkış yap", Icon: ILogout, action: "logout", danger: true },
];

// ─── Constants ───────────────────────────────────────────────

export const SIDEBAR_WIDTH           = 288;
export const SIDEBAR_COLLAPSED_WIDTH = 77;

// Icon zone width for nav links (accounts for 8px margin on each side)
const ICON_ZONE_W = SIDEBAR_COLLAPSED_WIDTH - 16;

const FONT = "var(--font-body)";

// ─── Component ───────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "1";
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  // Sync CSS variable and persist
  useEffect(() => {
    const w = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
    document.documentElement.style.setProperty("--sidebar-w", `${w}px`);
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Close account menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const w = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const slideStyle = {
    overflow: "hidden" as const,
    maxWidth: collapsed ? 0 : 200,
    opacity: collapsed ? 0 : 1,
    transition: "max-width 0.2s ease, opacity 0.15s ease",
    whiteSpace: "nowrap" as const,
  };

  return (
    <aside
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: w,
        height: "100vh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        fontFamily: FONT,
        transition: "width 0.2s ease",
      }}
    >
      {/* Logo / Sidebar toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        title={collapsed ? "Open sidebar" : "Close sidebar"}
        style={{
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          minHeight: 75,
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "background 0.12s",
          fontFamily: FONT,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        {/* Fixed icon zone — always centered in SIDEBAR_COLLAPSED_WIDTH */}
        <span style={{
          width: SIDEBAR_COLLAPSED_WIDTH,
          height: 75,
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}>
          <div style={{
            width: 51, height: 51, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, var(--accent), #525252)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Logo />
          </div>
        </span>
        {/* Sliding text */}
        <span style={{ ...slideStyle, fontSize: 15, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.3px", paddingRight: 16 }}>
          PhotoMind
        </span>
      </button>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                margin: "0 8px",
                padding: 0,
                borderRadius: 8,
                textDecoration: "none",
                color: active ? "var(--text)" : "var(--text-muted)",
                background: active ? "var(--surface-2)" : "transparent",
                overflow: "hidden",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              {/* Fixed icon zone */}
              <span style={{
                width: ICON_ZONE_W,
                height: 39,
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity: active ? 1 : 0.7,
              }}>
                <Icon />
              </span>
              {/* Sliding label */}
              <span style={{
                ...slideStyle,
                fontSize: 14,
                fontWeight: active ? 500 : 400,
                paddingRight: 10,
              }}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />
      </nav>

      {/* Account button */}
      {user && (
        <div style={{ position: "relative" }}>
          {/* Dropdown menu */}
          {menuOpen && (
            <div
              ref={menuRef}
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: 10,
                width: 218,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 6,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
                zIndex: 100,
                animation: "sbMenuIn 0.14s ease",
              }}
            >
              <style>{`@keyframes sbMenuIn { from { opacity:0; transform:translateY(6px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

              <div style={{
                padding: "7px 10px 9px",
                fontSize: 11, color: "var(--text-muted)",
                borderBottom: "1px solid var(--border)",
                marginBottom: 4, fontFamily: FONT,
              }}>
                {user.email}
              </div>

              {MENU.map((item, i) => {
                if ("divider" in item) {
                  return <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
                }
                const { label, Icon, href, action, danger, arrow } = item;
                return (
                  <a
                    key={i}
                    href={action ? undefined : (href ?? "#")}
                    onClick={(e) => {
                      if (action === "logout") { e.preventDefault(); setMenuOpen(false); logout(); }
                      else setMenuOpen(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 7,
                      fontSize: 13.5,
                      color: danger ? "var(--error)" : "var(--text-muted)",
                      cursor: "pointer", textDecoration: "none",
                      fontFamily: FONT, transition: "background 0.1s, color 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.background = danger ? "rgba(213,115,115,0.1)" : "rgba(255,255,255,0.06)";
                      if (!danger) el.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.background = "transparent";
                      el.style.color = danger ? "var(--error)" : "var(--text-muted)";
                    }}
                  >
                    <Icon />
                    <span style={{ flex: 1 }}>{label}</span>
                    {arrow && <IChevron />}
                  </a>
                );
              })}
            </div>
          )}

          {/* Account row */}
          <button
            ref={btnRef}
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 0,
              width: "100%",
              background: menuOpen ? "rgba(255,255,255,0.04)" : "transparent",
              border: "none",
              borderTop: "1px solid var(--border)",
              cursor: "pointer",
              transition: "background 0.12s",
              fontFamily: FONT,
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            {/* Fixed avatar zone */}
            <span style={{
              width: SIDEBAR_COLLAPSED_WIDTH,
              minHeight: 68,
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}>
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt={user.name} style={{ width: 52, height: 52, borderRadius: "50%" }} />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, color: "white",
                }}>
                  {user.name[0].toUpperCase()}
                </div>
              )}
            </span>
            {/* Sliding name/email/chevron */}
            <span style={{ ...slideStyle, flex: 1, minWidth: 0, display: "flex", alignItems: "center", paddingRight: 12 }}>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </div>
              </span>
              <span style={{ color: "var(--dimmer)", flexShrink: 0, marginLeft: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 15l5-5 5 5"/>
                </svg>
              </span>
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
