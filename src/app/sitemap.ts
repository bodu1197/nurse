import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/constants";
import { getSitemapJobs } from "@/lib/data/jobs";

// 1시간마다 다시 만든다. 더 길게 잡으면 그 사이 노출이 끝난 공고 URL 이 사이트맵에 남아
// 크롤러가 404 를 받는다(상세는 요청 시각 기준으로 만료를 판정한다). 요청마다 조회하지도 않는다.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    changeFrequency: (route === "/" ? "daily" : "weekly") as "daily" | "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));

  // 🔴 인재(이력서)는 싣지 않는다 — 목록·상세 모두 noindex 다(오너 확정 2026-08-06,
  //    근거는 lib/constants.ts PUBLIC_ROUTES 주석). 사이트맵은 "색인해달라" 는 말이라,
  //    noindex 페이지를 여기 넣으면 사이트가 스스로 모순되는 신호를 보낸다.
  const jobs = await getSitemapJobs();
  return [
    ...statics,
    { url: `${SITE_URL}/jobs`, changeFrequency: "daily" as const, priority: 0.9, lastModified: new Date() },
    ...jobs.map((j) => ({
      url: `${SITE_URL}/jobs/${j.id}`,
      lastModified: new Date(j.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
