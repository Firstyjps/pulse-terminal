import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = {
  title: "Pulse Terminal · Crypto Macro Intelligence",
  description: "Multi-source flow analysis, derivatives intel, AI assistant.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#04050a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="grain" aria-hidden />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
