import type { Metadata } from "next";
import { Epilogue } from "next/font/google";
import "./globals.css";

const epilogue = Epilogue({
  subsets: ["latin"],
  variable: "--font-epilogue",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PhotoMind — Cross-Cloud Image Manager",
  description: "Google Drive, Dropbox, OneDrive ve pCloud fotoğraflarını yapay zeka ile doğal dilde ara",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={epilogue.variable}>
      <body>{children}</body>
    </html>
  );
}
