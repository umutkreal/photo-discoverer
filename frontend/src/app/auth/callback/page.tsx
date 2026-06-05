"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Backend /auth/callback zaten token döndürüyor
    // Ama biz Next.js callback page'den backend'e yönlendiriyoruz
    // Bu sayfa aslında backend callback'ten sonra token ile geri geldiğimizde kullanılabilir
    // Şu an backend direkt JSON döndürdüğü için, token'ı query params ile alabiliriz
    // ya da backend'i yönlendirip buraya token'ı taşırız.

    // Seçenek: Backend'e token + redirect URL ekle (önerilir)
    // Şimdilik: URL'de token var mı kontrol et
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    const name = params.get("name");
    const email = params.get("email");
    const picture = params.get("picture");

    if (token && email) {
      localStorage.setItem("access_token", token);
      localStorage.setItem(
        "user",
        JSON.stringify({ email, name: name || "", picture: picture || "" })
      );
      router.push("/account");
    } else {
      // Eğer backend callback'e girdik ama token yok, kontrol et
      setStatus("error");
      setErrorMsg(
        "Token alınamadı. Backend'in /auth/callback endpoint'ini frontend'e yönlendirecek şekilde güncelleyin."
      );
    }
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {status === "loading" ? (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid var(--border)",
              borderTop: "3px solid var(--accent)",
              borderRadius: "50%",
              animation: "spin-slow 0.8s linear infinite",
            }}
          />
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            Giriş tamamlanıyor...
          </p>
        </>
      ) : (
        <div
          style={{
            maxWidth: 480,
            padding: 32,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--error)",
              marginBottom: 12,
            }}
          >
            Hata
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            {errorMsg}
          </p>
          <div
            style={{
              marginTop: 20,
              padding: "12px 16px",
              background: "var(--surface-2)",
              borderRadius: 10,
              textAlign: "left",
            }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: 8 }}>
              Backend &apos;auth.py&apos; dosyasındaki REDIRECT_URI&apos;yi şu şekilde güncelleyin:
            </p>
            <code
              style={{
                color: "var(--accent)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
              }}
            >
              REDIRECT_URI = &quot;http://localhost:3000/auth/callback&quot;
            </code>
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: 20,
              padding: "10px 24px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
            }}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      )}
    </div>
  );
}
