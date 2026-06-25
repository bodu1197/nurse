import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

const TITLE = "널스넷 — 간호사 채용, 검색 한 번으로";
const DESCRIPTION =
  "간호사·간호조무사 채용공고를 한곳에서. 진료과·지역·근무형태로 검색하고 간편지원하세요.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "널스넷",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
