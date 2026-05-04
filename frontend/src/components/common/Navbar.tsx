"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navLinks = [
    { href: "/dashboard", label: "Panel" },
    { href: "/search", label: "Ara" },
    { href: "/duplicates", label: "Yinelenenler" },
    { href: "/settings/integrations", label: "Entegrasyonlar" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        background: "rgba(10,10,15,0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          marginRight: 40,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "linear-gradient(135deg, var(--accent), #a78bfa)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="9" cy="11" r="2" stroke="white" strokeWidth="1.8"/>
            <path d="M21 15l-5-5L5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>
          PhotoSearch
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {navLinks.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                textDecoration: "none",
                fontFamily: "var(--font-body)",
                fontSize: "0.9rem",
                fontWeight: active ? 500 : 400,
                color: active ? "var(--text)" : "var(--text-muted)",
                background: active ? "var(--surface-2)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* User */}
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right", display: "none" }} className="sm:block">
            <p style={{ fontSize: "0.85rem", color: "var(--text)", fontFamily: "var(--font-body)" }}>
              {user.name}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {user.email}
            </p>
          </div>
          {user.picture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.picture}
              alt={user.name}
              style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid var(--border)" }}
            />
          )}
          <button
            onClick={logout}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              fontSize: "0.82rem",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--error)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--error)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
            }}
          >
            Çıkış
          </button>
        </div>
      )}
    </nav>
  );
}
