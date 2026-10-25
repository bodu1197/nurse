/**
 * AI 수집·학습·답변 봇 이름 — robots.txt(src/app/robots.ts)와 Vercel 방화벽(scripts/vercel-firewall-bots.ts)이 **함께 쓰는 단일 목록**.
 * 둘이 어긋나지 않게 여기 하나만 둔다. 🔒 import 를 두지 않는다 — 방화벽 스크립트가 빌드 없이 Node 로 바로 읽는다.
 *
 * 오너 지시 2026-10-25 "무조건 돈이 지출 안되게 확실하게 막아줘" — 이들을 사이트 전체에서 막는다(이유는 robots.ts 주석).
 *
 * 목록 기준: 각 업체가 공개 문서로 이름을 밝힌 것만 적는다.
 * 🔴 **바꾸면 방화벽 스크립트를 `--apply` 로 다시 돌린다** — 배포만으로는 방화벽이 안 바뀐다.
 * 🔴 이름을 빼도 방화벽 통과 목록으로 돌아가지는 않는다 — 해외에서 오면 여전히 국가 차단(403)에 걸린다. 다시 들이려면 통과 규칙에 따로 넣는다.
 * 🔴 영문·숫자·하이픈만 — 방화벽 정규식에 그대로 들어간다(스크립트가 검사하고 멈춘다).
 * 🔴 대소문자만 다른 같은 이름을 두 번 적지 말 것 — robots.txt(RFC 9309 §2.2.1)도 Vercel 방화벽 연산자도 대소문자를 가리지 않는다.
 */
export const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", // OpenAI
  "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", // Anthropic
  "PerplexityBot", "Perplexity-User", // Perplexity
  // 아래 둘은 요청에 실려 오는 봇 이름이 아니라 robots.txt 전용 이름(학습 거부 표시)이다 — 방화벽에는 걸릴 일이 없고 robots.txt 에서만 뜻이 있다.
  "Google-Extended", // Gemini 학습용. 🔴 구글 *검색* 색인과 무관하다 — 검색에는 영향이 없다.
  "Applebot-Extended", // Apple Intelligence 학습용(검색용 Applebot 과 다른 이름)
  "CCBot", // Common Crawl — 여러 LLM 학습셋의 원천
  "Bytespider", "Amazonbot",
  // Meta: 학습용 · Meta AI 가 사용자 요청으로 링크를 읽는 페처 · Meta AI 검색 색인. 일반 링크 미리보기(facebookexternalhit)는 다른 이름이라 그대로다.
  "meta-externalagent", "meta-externalfetcher", "meta-webindexer",
  // 방화벽 통과 목록에 'AI 크롤러'로 같이 들어 있던 셋 — 그 통과 때문에 해외 차단을 건너뛰고 있었다(2026-10-25 이리로 옮김).
  "cohere-ai", "YouBot", "Diffbot",
];
