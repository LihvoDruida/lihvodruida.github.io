import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mistblossom Applications Dashboard",
  description: "Secure dashboard for reviewing Mistblossom Vanguard guild applications.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
