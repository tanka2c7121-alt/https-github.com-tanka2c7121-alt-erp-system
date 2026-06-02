import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP System",
  description: "ERP 업무 관리 시스템",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
