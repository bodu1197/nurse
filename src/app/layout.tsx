import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import { FONT_PRELOAD_HREF } from "./fonts";
import "./globals.css";

// 폰트는 globals.css → fonts.css 의 @font-face 로 자가호스팅(외부요청 0).
// next/font/local 은 unicode-range 를 못 다뤄서 직접 선언한다.

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
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {/* 상용 한글 벌만 미리 받는다. CSS를 다 읽고 나서야 받기 시작하던 걸 앞당겨, 글꼴이
            바뀌는 게 눈에 보이기 전에 도착시킨다. 희귀 벌은 필요할 때만 받게 둔다.
            <head> 를 직접 열지 않는다 — Next 가 metadata·CSS 를 넣는 자리와 순서를 다투게
            된다. React 19 가 이 link 를 알아서 head 로 올린다(실측: 초기 HTML 에 나옴).
            ReactDOM.preload() 로는 안 된다 — 서버 컴포넌트에서는 RSC 페이로드에만 실리고
            초기 HTML head 에는 안 나와서, 정작 필요한 첫 렌더에 효과가 없다(실측). */}
        <link
          rel="preload"
          href={FONT_PRELOAD_HREF}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        {children}
      </body>
    </html>
  );
}
