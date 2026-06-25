import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    changeFrequency: route === "/" || route === "/jobs" ? "daily" : "weekly",
    priority: route === "/" ? 1 : route === "/jobs" ? 0.9 : 0.5,
  }));
}
