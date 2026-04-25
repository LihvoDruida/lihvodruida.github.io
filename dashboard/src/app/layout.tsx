import type { Metadata, Viewport } from "next";
import "./globals.css";
import DashboardFormEnhancer from "@/components/DashboardFormEnhancer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020817",
};

export const metadata: Metadata = {
  title: "Mistblossom Applications Dashboard",
  description: "Secure dashboard for reviewing Mistblossom Vanguard guild applications.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body><DashboardFormEnhancer />{children}</body>
    </html>
  );
}
