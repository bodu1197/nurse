import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/constants";
import { getNurseOccupation } from "@/lib/data/worknet";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: string[] = [...PUBLIC_ROUTES];
  // /salaries 는 워크넷 데이터가 있을 때만 등재 — 데이터 없으면 페이지가 noindex라 sitemap 충돌 방지.
  if (await getNurseOccupation()) routes.push("/salaries");

  return routes.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
