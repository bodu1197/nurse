import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/constants";
import { FONT_PRELOAD_HREF } from "./fonts";
import "./globals.css";

// 폰트는 globals.css → fonts.css 의 @font-face 로 자가호스팅(외부요청 0).
// next/font/local 은 unicode-range 를 못 다뤄서 직접 선언한다.

// 🔴 제목·설명·키워드는 **레거시 널스넷(nursenet.co.kr)에서 그대로 가져온다**(오너 확정 2026-07-30).
//    수년간 그 문구로 색인·순위가 쌓였다. 여기서 "더 나은 카피"로 바꾸면 그 축적을 버리는 것이다.
//    바꿔야 할 일이 생기면 레거시와 함께 바꾼다 — 한쪽만 바꾸면 두 사이트가 다른 말을 한다.
const TITLE = "널스넷 - 간호사 간호조무사 병원 구인 구직 NO.1";
const DESCRIPTION =
  "상급종합병원부터 동네 병원까지 채용, 연봉, 리뷰, 면접 후기! 간호사·조무사는 '널스넷'에서 확인하세요";
// 레거시 meta[name=keywords] 원문. 빈 항목 하나(", ,")만 덜어냈다 — 값이 아니라 오타다.
const KEYWORDS = [
  "간호사 커뮤니티", "병원구인구직", "간호사구인", "간호조무사모집", "의료취업",
  "취업", "간호조무사구인구직", "월급", "연봉", "취업사이트",
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: KEYWORDS,
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

// 레거시와 같은 값. 모바일 주소창 색이 사이트마다 튀지 않게 한다.
export const viewport = { themeColor: "#0044ff" };

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
      {/* pb-14: 모바일 하단 탭(SiteHeader)이 화면 아래에 고정돼 있어, 그만큼 비워두지 않으면
          목록 마지막 줄과 「더 보기」 버튼이 탭 밑에 깔려 손이 닿지 않는다. */}
      <body className="min-h-full flex flex-col bg-white pb-14 text-slate-900 sm:pb-0">
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
        {/* 푸터는 전 화면 공용 — 홈에만 있던 것을 여기로 올렸다. 각 페이지의 <main>이 flex-1이라
            내용이 짧아도 바닥에 붙는다. */}
        <SiteFooter />
      </body>
    </html>
  );
}
