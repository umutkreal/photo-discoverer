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
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background gradient blobs */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,109,250,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,109,250,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-xl">
        {/* Logo mark */}
        <div
          className="animate-fade-in"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "linear-gradient(135deg, var(--accent), #a78bfa)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
            boxShadow: "0 8px 32px rgba(124,109,250,0.4)",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 19V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2z"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="9" cy="11" r="2" stroke="white" strokeWidth="1.5" />
            <path d="M21 15l-5-5L5 21" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <h1
          className="animate-fade-in-delay-1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "var(--text)",
            marginBottom: 16,
          }}
        >
          Fotoğraflarını
          <br />
          <span style={{ color: "var(--accent)" }}>Kelimelerle</span> Bul
        </h1>

        <p
          className="animate-fade-in-delay-2"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "1.1rem",
            color: "var(--text-muted)",
            lineHeight: 1.7,
            marginBottom: 48,
            maxWidth: 400,
          }}
        >
          Google Drive'ındaki tüm fotoğrafları yapay zeka ile tara.
          &ldquo;Sahilde gün batımı&rdquo; ya da &ldquo;köpekle park&rdquo; — ne aklına gelirse yaz.
        </p>

        {error && (
          <div
            style={{
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 12,
              padding: "12px 20px",
              color: "var(--error)",
              fontSize: "0.9rem",
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="animate-fade-in-delay-3"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 32px",
            borderRadius: 14,
            background: "white",
            color: "#1a1a2e",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "1rem",
            border: "none",
            cursor: isLoggingIn ? "not-allowed" : "pointer",
            opacity: isLoggingIn ? 0.7 : 1,
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
          onMouseEnter={(e) => {
            if (!isLoggingIn) {
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.3)";
          }}
        >
          {isLoggingIn ? (
            <>
              <span
                style={{
                  width: 20,
                  height: 20,
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
              {/* Google logo */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google ile Giriş Yap
            </>
          )}
        </button>

        {/* Feature pills */}
        <div
          className="animate-fade-in-delay-3"
          style={{
            display: "flex",
            gap: 12,
            marginTop: 48,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["CLIP AI Modeli", "Qdrant Vector DB", "Google Drive"].map((tag) => (
            <span
              key={tag}
              style={{
                padding: "6px 14px",
                borderRadius: 100,
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontSize: "0.78rem",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.05em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
