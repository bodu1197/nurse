import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/constants";
import { getSitemapJobs } from "@/lib/data/jobs";
import { getSitemapTalent } from "@/lib/data/talent";

// 1시간마다 다시 만든다. 더 길게 잡으면 그 사이 노출이 끝난 공고 URL 이 사이트맵에 남아
// 크롤러가 404 를 받는다(상세는 요청 시각 기준으로 만료를 판정한다). 요청마다 조회하지도 않는다.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    changeFrequency: (route === "/" ? "daily" : "weekly") as "daily" | "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));

  // 공고와 인재를 함께 싣는다 — 인재정보도 색인 대상이 됐다(오너 확정 2026-07-30, 근거는
  // lib/constants.ts PUBLIC_ROUTES 주석). 둘은 서로 독립이라 같이 조회한다.
  const [jobs, talent] = await Promise.all([getSitemapJobs(), getSitemapTalent()]);
  return [
    ...statics,
    { url: `${SITE_URL}/jobs`, changeFrequency: "daily" as const, priority: 0.9, lastModified: new Date() },
    ...jobs.map((j) => ({
      url: `${SITE_URL}/jobs/${j.id}`,
      lastModified: new Date(j.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    // 이력서는 공고만큼 자주 바뀌지 않는다 — weekly·0.6 으로 크롤 예산을 공고 쪽에 남긴다.
    ...talent.map((t) => ({
      url: `${SITE_URL}/talent/${t.profile_id}`,
      lastModified: new Date(t.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
