"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError("");
    try {
      const { auth_url } = await authApi.login();
      window.location.href = auth_url;
    } catch (e) {
      setError("Giriş başlatılamadı. Backend çalışıyor mu?");
      setIsLoggingIn(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3rem, 8vw, 5rem)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "var(--text)",
              lineHeight: 1,
            }}
          >
            PhotoMind
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.9rem",
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            Cross-Cloud-Image-Manager
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 12,
              padding: "12px 20px",
              color: "var(--error)",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 28px",
            borderRadius: 12,
            background: "white",
            color: "#1a1a2e",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "0.95rem",
            border: "none",
            cursor: isLoggingIn ? "not-allowed" : "pointer",
            opacity: isLoggingIn ? 0.7 : 1,
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            marginTop: 8,
            alignSelf: "center",
          }}
          onMouseEnter={(e) => {
            if (!isLoggingIn) {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 28px rgba(0,0,0,0.35)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
          }}
        >
          {isLoggingIn ? (
            <>
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid #ccc",
                  borderTop: "2px solid #1a1a2e",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin-slow 0.8s linear infinite",
                }}
              />
              Yönlendiriliyor...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google ile Giriş Yap
            </>
          )}
        </button>
      </div>
    </div>
  );
}
