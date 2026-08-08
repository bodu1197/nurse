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

  // 인재(이력서)도 싣는다 — 목록·상세의 noindex 를 걷었다(오너 지시 2026-08-08).
  // 🔴 여기와 각 페이지의 robots 는 **반드시 같이** 움직인다. 사이트맵은 "색인해달라" 는 말이라,
  //    한쪽만 바꾸면 사이트가 스스로 모순되는 신호를 보낸다.
  // 한 파일의 URL 상한은 50,000건 — 지금 공고 약 1,300 + 인재 약 7,800 이라 여유가 있다.
  //    넘으면 sitemap index 로 쪼개야 한다.
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
    { url: `${SITE_URL}/talent`, changeFrequency: "daily" as const, priority: 0.9, lastModified: new Date() },
    // 이력서는 공고만큼 자주 바뀌지 않는다(사람이 저장할 때만) — weekly·0.6 으로 공고보다 아래에 둔다.
    ...talent.map((t) => ({
      url: `${SITE_URL}/talent/${t.id}`,
      lastModified: new Date(t.lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
