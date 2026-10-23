"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { vercelSafeUrl } from "@/lib/url";

const safe = (event: BeforeSendEvent): BeforeSendEvent | null => {
  const url = vercelSafeUrl(event.url);
  return url ? { ...event, url } : null;
};

/** Vercel Web Analytics(대시보드 Analytics 탭). beforeSend 는 함수라 서버 컴포넌트인 루트 layout 에서
 *  바로 넘길 수 없어 이 클라이언트 껍데기를 둔다. 무엇을 거르는지는 vercelSafeUrl 참고.
 *  관리자 통계(/admin/stats)는 이것과 별개로 proxy 의 trackPageView(lib/track.ts)가 우리 DB 에 쌓는다 — 둘 다 유지. */
export default function VercelAnalytics() {
  return <Analytics beforeSend={safe} />;
}
