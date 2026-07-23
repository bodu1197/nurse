import type { Metadata } from "next";
import localFont from "next/font/local";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

// Pretendard 자가호스팅(외부요청 0). preload:false + display:swap = 초기 렌더 비차단·지연 로드(속도지표 영향 0).
const pretendard = localFont({
  src: "./fonts/PretendardVariable.subset.woff2",
  weight: "45 920",
  display: "swap",
  preload: false,
  variable: "--font-pretendard",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"],
});

const TITLE = "널스넷 — 간호사 채용, 검색 한 번으로";
const DESCRIPTION =
  "간호사·간호조무사 채용공고를 한곳에서. 진료과·지역·근무형태로 검색하고 간편지원하세요.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // canonical은 여기(루트)에 두지 않는다 — 하위 페이지가 alternates를 선언하지 않으면 그대로 상속돼
  // noindex 페이지들이 전부 "홈이 정본"이라고 말하게 된다. 각 공개 페이지가 자기 canonical을 선언한다.
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "널스넷",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "널스넷",
  alternateName: "NurseNet",
  url: SITE_URL,
  description: DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full antialiased ${pretendard.variable}`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        {children}
      </body>
    </html>
  );
}
