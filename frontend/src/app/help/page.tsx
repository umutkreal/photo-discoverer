"use client";

import Sidebar from "@/components/common/Sidebar";

// ─── Feature sections data ────────────────────────────────────

const SECTIONS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    color: "#7C6AF7",
    title: "Arama",
    subtitle: "/search",
    description: "Fotoğraflarını doğal dille ara. \"Deniz kenarında gün batımı\" ya da \"2022 aile toplantısı\" gibi cümlelerle tüm bulut hesaplarındaki fotoğraflara ulaş.",
    steps: [
      "Arama kutusuna ne aradığını yaz",
      "Filtreler ile yıl, kamera veya kaynak bazlı daralt",
      "Sonuca tıkla — fotoğrafı doğrudan AI Düzenle'ye gönderebilirsin",
    ],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
      </svg>
    ),
    color: "#5BA4F5",
    title: "AI Düzenle",
    subtitle: "/edit",
    description: "Bulut fotoğraflarını ya da cihazından yüklediğin görselleri yapay zeka ile düzenle. Sonucu kaydır — önce orijinali, sonra düzenlenmiş hali görürsün.",
    steps: [
      "Fotoğraf seç: buluttan ara veya cihazından yükle",
      "İşlem türünü seç (Inpainting, Stil Transferi, Upscale…)",
      "Parametreleri ayarla ve Çalıştır'a bas",
      "Slider'ı sağa çekerek önce/sonra karşılaştır",
      "Beğendiysen indir veya buluta kaydet",
    ],
    ops: [
      { label: "Inpainting",       desc: "Seçili alanı yeni içerikle doldur" },
      { label: "Outpainting",      desc: "Görüntüyü kenarlara doğru genişlet" },
      { label: "Stil Transferi",   desc: "Promptla görüntünün stilini dönüştür" },
      { label: "Arka Plan Kaldır", desc: "Şeffaf PNG çıktısı al" },
      { label: "Metin ile Düzenle",desc: "Serbest dil talimatıyla düzenle" },
      { label: "Restorasyon",      desc: "Çizik ve hasarı onar" },
      { label: "Çözünürlük Artır", desc: "2× veya 4× upscale" },
    ],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/><path d="M9 21V9"/>
      </svg>
    ),
    color: "#4FC08D",
    title: "Albümler",
    subtitle: "/albums",
    description: "Fotoğraflarını özel koleksiyonlarda grupla. Arama sonuçlarından doğrudan herhangi bir fotoğrafı albüme ekleyebilirsin.",
    steps: [
      "Yeni albüm oluştur ve bir isim ver",
      "Arama sayfasından fotoğraf seçip albüme ekle",
      "Albüme tıkla — içindeki tüm fotoğraflar listelenir",
    ],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="8" y="8" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    ),
    color: "#E879A0",
    title: "Yinelenenler",
    subtitle: "/duplicates",
    description: "Bulut hesaplarındaki tekrarlı fotoğrafları AI ile tespit et, hangisini silip hangisini saklayacağını sen belirle.",
    steps: [
      "Tara butonuna bas — benzerlik eşiğini ayarlayabilirsin",
      "Gruplar halinde gösterilen tekrarlı fotoğrafları incele",
      "Her grupta saklamak istediğini seç, diğerlerini sil",
    ],
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
    color: "#F5A623",
    title: "Hesabım",
    subtitle: "/account",
    description: "Bulut hesaplarını bağla, fotoğraflarını indeksle ve senkronize et.",
    steps: [
      "Bulut Hesapları bölümünden kullanmak istediğin tüm hesapları bağla (Google Drive, Dropbox, pCloud, OneDrive)",
      "Tüm hesapları bağladıktan sonra İndeksleme başlat — fotoğraflar AI tarafından vektörize edilir (ilk seferinde birkaç dakika sürebilir)",
      "İndeksleme tamamlandıktan sonra Arama sayfasından fotoğraflarına ulaşabilirsin",
      "Buluta yeni fotoğraf ekledikten veya sildikten sonra Senkronize Et butonunu kullanarak indeksi güncelle",
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{
        flex: 1, marginLeft: "var(--sidebar-w)", transition: "margin-left 0.2s ease",
        minWidth: 0, padding: "48px 24px 64px",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}>
        <div style={{ width: "100%", maxWidth: 680 }}>

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px",
              background: "linear-gradient(135deg, var(--accent), #525252)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
                <rect x="13" y="2" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
                <rect x="2" y="13" width="9" height="9" rx="2" fill="white" opacity="0.6"/>
                <rect x="13" y="13" width="9" height="9" rx="2" fill="white" opacity="0.3"/>
              </svg>
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 800,
              letterSpacing: "-0.04em", color: "var(--text)", margin: "0 0 10px",
            }}>
              PhotoMind nedir?
            </h1>
            <p style={{
              fontFamily: "var(--font-body)", fontSize: "0.95rem", color: "var(--text-muted)",
              lineHeight: 1.7, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto",
            }}>
              Birden fazla bulut hesabındaki fotoğraflarını tek yerden yönet, yapay zeka ile ara ve düzenle.
              Google Drive, Dropbox, pCloud ve OneDrive desteklenir.
            </p>
          </div>

          {/* Sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {SECTIONS.map((s) => (
              <div key={s.title} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "20px 24px 16px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: `${s.color}1a`, color: s.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
                        {s.title}
                      </span>
                      <code style={{
                        fontFamily: "var(--font-body)", fontSize: "0.75rem",
                        color: s.color, opacity: 0.8,
                        background: `${s.color}18`, padding: "1px 7px", borderRadius: 5,
                      }}>
                        {s.subtitle}
                      </code>
                    </div>
                    <p style={{
                      fontFamily: "var(--font-body)", fontSize: "0.85rem",
                      color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.5,
                    }}>
                      {s.description}
                    </p>
                  </div>
                </div>

                {/* Steps */}
                <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {s.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: `${s.color}20`, color: s.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--font-body)", fontSize: "0.72rem", fontWeight: 700,
                        marginTop: 1,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-body)", fontSize: "0.875rem",
                        color: "var(--text-muted)", lineHeight: 1.55,
                      }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Ops grid (AI Edit only) */}
                {"ops" in s && s.ops && (
                  <div style={{
                    padding: "0 24px 20px",
                    display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8,
                  }}>
                    {s.ops.map((op) => (
                      <div key={op.label} style={{
                        padding: "10px 12px", borderRadius: 10,
                        background: "var(--bg)", border: "1px solid var(--border)",
                      }}>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                          {op.label}
                        </div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                          {op.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick start */}
          <div style={{
            marginTop: 24,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 16, padding: "22px 24px",
          }}>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "0.92rem", fontWeight: 700,
              color: "var(--text)", margin: "0 0 14px",
            }}>
              Hızlı Başlangıç
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { n: 1, text: "Hesabım sayfasından bir bulut hesabı bağla" },
                { n: 2, text: "İndeksleme başlat — fotoğrafların AI tarafından işlenir" },
                { n: 3, text: "Arama sayfasına git ve doğal dille fotoğraflarını bul" },
                { n: 4, text: "Beğendiğini AI Düzenle ile geliştir veya albüme ekle" },
              ].map(({ n, text }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: "var(--accent-grad)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontSize: "0.8rem", fontWeight: 700, color: "#fff",
                  }}>
                    {n}
                  </div>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
