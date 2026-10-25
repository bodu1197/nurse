import { generateMetadata as jobMetadata, renderJobDetail } from "@/app/jobs/[id]/page";

/**
 * 🔒 **공고 상세의 캐시 전용 라우트**(2026-10-25). 사람이 직접 여는 주소가 아니다 —
 *    프록시(`src/proxy.ts`)가 네 조건을 **전부** 만족하는 요청만 여기로 rewrite 한다. 주소창은 `/jobs/<id>` 그대로다.
 *      ① GET·HEAD  ② 로그인 쿠키 없음  ③ 쿼리스트링 없음(봇은 쿼리를 버리고 온다)  ④ 경로가 /jobs/<uuid>
 *    조건은 lib/url cachedDetailTarget 한 곳에 있고 테스트가 있다.
 *
 * 왜 만들었나: 기존 라우트는 요청마다 `getMyProfile()` 로 쿠키를 읽어 캐시가 원리상 불가능했다. 그래서 ClaudeBot 하나가
 * 하루 약 70만 번 열 때마다 서버리스 함수가 그만큼 깨어나 Vercel 비용이 치솟았다(2026-10-17~25). 방화벽은 아는 봇만 막는다 —
 * 이 캐시는 모르는 봇이 몰려도 같은 공고를 6시간에 한 번만 만든다. 인재 상세(app/talent-cached)와 같은 방식이다.
 *
 * 🔒 **연락처 가림은 바뀌지 않는다.** 여기서 그리는 화면은 지금까지 비로그인에게 주던 것과 같다 — 담당자·전화·이메일·접수 안내는
 *    로그인해야 보이고(JobDetail), 여기선 세션을 아예 안 본다. 즉 캐시에 굳는 HTML 에 연락처가 애초에 없다.
 * 🔴 이 라우트에 세션·개인화를 넣지 마라 — 넣는 순간 그 값이 모두에게 나간다. 헤더(layout)·404(not-found)도 세션을 안 읽는다.
 *
 * 🔎 색인: 메타데이터는 기존 라우트 것을 그대로 쓴다 → canonical 이 `/jobs/<id>` 를 가리켜(요양·간병 수집분은 canonical 없이
 *    noindex) 이 경로 자체는 검색에 잡히지 않는다. 사이트맵에도 없고 어디서도 링크하지 않는다(proxy 가 직접 친 요청을 404 로 막는다).
 */

/**
 * 🔴 6시간이다. **봇의 크롤 간격보다 길어야 절약이 된다** — 유효시간이 같은 주소를 다시 여는 간격보다 짧으면 매번 다시 만들어
 *    캐시가 무의미해진다(형제 프로젝트에서 10분으로 뒀다가 그대로 겪었다). ClaudeBot 때는 노출 공고 1만 2천 건을
 *    하루 약 70만 번 열었다 — 한 장에 평균 수십 번이라 6시간이면 대부분을 캐시가 받는다.
 * 🔒 바뀌는 자리에서 이 한 장을 지운다(lib/data/jobs revalidateCachedJob — 공고 수정·마감·재게시·삭제·탈퇴, 결제·무료 1주·결제 웹훅,
 *    관리자 연장·즉시 종료·병원 이름 변경, 수집 크론 4개가 닫은 공고).
 * 🔒 지우는 자리가 없는 변화는 6시간 늦게 보인다: 마감일이 지나 저절로 내려간 공고, 크론이 다시 열거나 고친 공고, 옆 목록, 병원 평점.
 *    마감일은 화면에 날짜로 찍혀 있고, 지원하려면 로그인해야 해서(→ 동적 라우트 → 404) 잘못 지원되지는 않는다. 6시간 넘게 아무도
 *    안 연 주소는 다음 첫 요청이 옛 화면을 한 번 받고 그 뒤에 새로 만든다(ISR 의 stale-while-revalidate).
 */
export const revalidate = 21600;

// 요양·간병 워크넷 공고는 처음 그릴 때 워크넷 상세(타임아웃 5초)를 기다린다 — 기존 라우트와 같은 값.
export const maxDuration = 30;

/**
 * 🔴 빈 배열이 의도다. 동적 세그먼트는 `generateStaticParams` 가 없으면 위 `revalidate` 를 줘도
 *    매 요청 함수를 깨운다(Next 규약). 빈 배열 + 기본 `dynamicParams: true` = **온디맨드 ISR**.
 * 🔒 빌드 때 공고 1만 2천 건을 미리 굽지 않는다 — 열리지도 않는 공고까지 만들고 배포마다 반복한다.
 */
export async function generateStaticParams() {
  return [];
}

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: Props) {
  // 제목·설명·canonical·robots 은 기존 라우트의 생성기 한 곳에서만 정해지게 한다.
  return jobMetadata({ params });
}

export default async function CachedJobPage({ params }: Props) {
  // 이 경로로는 쿼리스트링이 오지 않는다(프록시가 그렇게 고른다) → 빈 값을 넘긴다.
  return renderJobDetail({ params, searchParams: Promise.resolve({}) }, { gated: false });
}
