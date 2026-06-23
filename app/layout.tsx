import type { Metadata, Viewport } from "next";
import PwaRegistrar from "../src/components/system/PwaRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "신흥현대 ERP",
  description: "신흥현대서비스 ERP 업무 관리 시스템",
  applicationName: "신흥현대 ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "신흥현대 ERP",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/pwa-icon.svg", type: "image/svg+xml" },
      { url: "/genesis-mark.png", type: "image/png" },
    ],
    apple: [{ url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
  lang="ko"
  className="h-full antialiased"
>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
