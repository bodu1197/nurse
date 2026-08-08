import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

/**
 * 🔴 **검색엔진 그룹(`User-agent: *`)에는 Disallow 를 늘리지 말 것.**
 *
 * 이 사이트에서 감추고 싶은 페이지(게시판·리뷰·마이페이지·로그인)는 전부 각 페이지가
 * `robots: { index: false }` 를 선언해 막는다. Disallow 는 그 위에 얹는 보강이 아니라 **정반대로 작동한다** —
 * 크롤러가 아예 못 들어오면 noindex 태그를 읽지 못해, 외부 링크가 하나라도 있으면
 * "제목 없음" 상태의 URL 만 검색결과에 남는다(구글 문서화된 동작).
 *
 * 검색엔진에 여는 것은 **채용공고와 인재정보**다(오너 지시 2026-08-08 — 인재정보의 noindex 를 되돌렸다).
 * 그 범위는 sitemap 과 각 페이지 noindex 로 통제한다.
 *
 * 🔴 그래서 `User-agent: *` 그룹에 `Disallow: /talent` 를 넣으면 **역효과**다. 지금은 색인 대상이라
 *    막을 이유가 없고, 나중에 다시 막게 되더라도 크롤러가 못 들어오면 noindex 를 못 읽어
 *    "제목 없음" 으로 검색결과에 그대로 남는다. 빠지게 하려면 오히려 들어와서 noindex 를 보게 해야 한다.
 *    (레거시 `/job/person/view/{id}` 3,544건은 308 로 /talent 에 접히므로 별개다.)
 */

/**
 * AI 수집·학습 크롤러 — 이들에게만 `/talent` 를 닫는다(오너 확정 2026-08-06).
 *
 * 🔴 위 "Disallow 를 늘리지 말라"와 모순이 아니다. 그 금지의 **이유는 "noindex 를 읽게 해야 한다"** 인데,
 *    이들은 애초에 noindex 를 보지 않는다 — noindex 는 *검색 색인* 지시어이고 이들은 검색 색인기가 아니다.
 *    막아도 잃을 것이 없고, 안 막으면 이력서가 학습·인용 대상이 된다.
 * 🔴 2026-08-08 에 인재정보를 **구글 검색에는 열었지만** 이 목록은 그대로 둔다. 둘은 다른 이야기다 —
 *    검색은 사람을 이 사이트로 데려오지만(광고가 팔린다), 학습 크롤러는 이력서를 퍼가고 끝난다.
 *    이 목록의 `Google-Extended` 는 Gemini *학습용* UA 라 구글 검색 색인과 무관하다.
 *    실측(2026-08-06, 봇 집계 첫날): `/talent/:id` 봇 요청 **124,069회** vs 색인 대상인 `/jobs/:id` 7,062회.
 *    공개 이력서 7,779건의 약 16배 — 전수 스윕이 돌고 있다는 뜻이다.
 *
 * 🔴 `/` 전체가 아니라 **`/talent` 만** 막는다. 채용공고는 오히려 AI 답변에 나와야 한다 —
 *    이 사이트에서 노출이 곧 돈인 쪽은 공고다. "이력서는 감추고 공고는 연다"는 오너 결정과 같은 선이다.
 *
 * 🔴 Allow 를 함께 적지 않는다. robots.txt 는 적히지 않은 경로가 기본 허용이라 Disallow 한 줄이면 충분하고,
 *    `Allow: /` 를 앞에 두면 "먼저 맞는 규칙을 따르는" 옛 크롤러가 /talent 까지 허용으로 읽는다.
 *
 * 목록 기준: 각 업체가 공개 문서로 UA 를 밝힌 것만 적는다. 새 UA 가 생기면 여기에 추가한다.
 * (Bytespider 처럼 robots.txt 를 잘 안 지키는 것도 있다 — 선언은 "허락한 적 없다"는 근거로도 남는다.)
 */
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", // OpenAI
  "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", // Anthropic
  "PerplexityBot", "Perplexity-User", // Perplexity
  "Google-Extended", // Gemini 학습용. 🔴 구글 *검색* 색인과 무관하다 — 검색에는 영향이 없다.
  "Applebot-Extended", // Apple Intelligence 학습용(검색용 Applebot 과 다른 UA)
  "CCBot", // Common Crawl — 여러 LLM 학습셋의 원천이라 이것만 막아도 파급이 크다
  // 🔴 대소문자 구분 없이 매칭된다(RFC 9309 §2.2.1) — 같은 이름을 대소문자만 바꿔 두 번 적지 말 것.
  "Bytespider", "Amazonbot",
  "meta-externalagent", "meta-externalfetcher", // Meta: 학습용 · 사용자 요청 시 페처
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_CRAWLERS, disallow: "/talent" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Host 지시어(얀덱스 확장)는 **스킴 없는 호스트명**을 기대한다. 구글·네이버는 무시하지만
    // 값이 틀린 채로 두면 다음 사람이 이 줄을 믿는다. 정본 강제는 next.config 의 308 이 한다.
    host: new URL(SITE_URL).host,
  };
}
