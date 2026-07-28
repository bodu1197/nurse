import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

/**
 * 🔴 여기서 Disallow 를 늘리지 말 것.
 *
 * 이 사이트에서 감추고 싶은 페이지(인재정보·게시판·리뷰·마이페이지·로그인)는 전부 각 페이지가
 * `robots: { index: false }` 를 선언해 막는다. Disallow 는 그 위에 얹는 보강이 아니라 **정반대로 작동한다** —
 * 크롤러가 아예 못 들어오면 noindex 태그를 읽지 못해, 외부 링크가 하나라도 있으면
 * "제목 없음" 상태의 URL 만 검색결과에 남는다(구글 문서화된 동작).
 *
 * 검색엔진에 여는 것은 채용공고뿐이지만, 그건 sitemap 과 각 페이지 noindex 로 통제한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
