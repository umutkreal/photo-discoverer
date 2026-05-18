"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// ─── Icons ────────────────────────────────────────────────────

const Logo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
    <rect x="13" y="2" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
    <rect x="2" y="13" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
    <rect x="13" y="13" width="9" height="9" rx="2" fill="white" opacity="0.3"/>
  </svg>
);

const IPanel = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const ISearch = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
);

const IAlbums = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M9 21V9"/>
  </svg>
);

const IDuplicates = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="8" y="8" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const IIntegrations = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const ISettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
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
  { href: "/dashboard",             label: "Panel",         Icon: IPanel         },
  { href: "/search",                label: "Ara",           Icon: ISearch        },
  { href: "/albums",                label: "Albümler",      Icon: IAlbums        },
  { href: "/duplicates",            label: "Yinelenenler",  Icon: IDuplicates    },
  { href: "/settings/integrations", label: "Entegrasyonlar",Icon: IIntegrations  },
];

type MenuItem =
  | { divider: true }
  | { label: string; Icon: () => React.ReactElement; shortcut?: string; arrow?: boolean; href?: string; action?: string; danger?: boolean };

const MENU: MenuItem[] = [
  { label: "Entegrasyonlar", Icon: IIntegrations, href: "/settings/integrations" },
  { label: "Ayarlar",        Icon: ISettings,     href: "/settings/integrations" },
  { label: "Yardım al",      Icon: IHelp,         href: "#" },
  { divider: true },
  { label: "Çıkış yap",      Icon: ILogout,       action: "logout", danger: true },
];

// ─── Constants ───────────────────────────────────────────────

export const SIDEBAR_WIDTH = 240;

const FONT = "-apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Component ───────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: SIDEBAR_WIDTH,
        height: "100vh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        fontFamily: FONT,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border)" }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg, var(--accent), #a78bfa)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Logo />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.3px" }}>
            PhotoMind
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                textDecoration: "none",
                color: active ? "var(--text)" : "var(--text-muted)",
                background: active ? "var(--surface-2)" : "transparent",
                fontSize: 14,
                fontWeight: active ? 500 : 400,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}><Icon /></span>
              {label}
            </Link>
          );
        })}
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

              {/* Email header */}
              <div
                style={{
                  padding: "7px 10px 9px",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  borderBottom: "1px solid var(--border)",
                  marginBottom: 4,
                  fontFamily: FONT,
                }}
              >
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
                      if (action === "logout") {
                        e.preventDefault();
                        setMenuOpen(false);
                        logout();
                      } else {
                        setMenuOpen(false);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 7,
                      fontSize: 13.5,
                      color: danger ? "var(--error)" : "var(--text-muted)",
                      cursor: "pointer",
                      textDecoration: "none",
                      fontFamily: FONT,
                      transition: "background 0.1s, color 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.background = danger ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.06)";
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
              gap: 10,
              padding: "12px 12px",
              width: "100%",
              background: menuOpen ? "rgba(255,255,255,0.04)" : "transparent",
              border: "none",
              borderTop: "1px solid var(--border)",
              cursor: "pointer",
              transition: "background 0.12s",
              fontFamily: FONT,
            }}
            onMouseEnter={(e) => {
              if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt={user.name} style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0 }} />
            ) : (
              <div
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, color: "white", flexShrink: 0,
                }}
              >
                {user.name[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            </div>
            <span style={{ color: "var(--dimmer)", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 15l5-5 5 5"/>
              </svg>
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
