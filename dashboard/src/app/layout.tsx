import { Suspense } from "react";
import { Cormorant_Garamond, Noto_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import DashboardFormEnhancer from "@/components/DashboardFormEnhancer";
import GlobalToasts from "@/components/GlobalToasts";

const mistUiFont = Noto_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-mist-ui",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

const mistDisplayFont = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-mist-display",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020817",
};

export const metadata: Metadata = {
  title: "Mistblossom Applications Dashboard",
  description: "Панель Mistblossom Vanguard для заявок, профілів і Discord-правил.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className={`${mistUiFont.variable} ${mistDisplayFont.variable}`}>
      <body><DashboardFormEnhancer /><Suspense fallback={null}><GlobalToasts /></Suspense>{children}</body>
    </html>
  );
}
