import { generateMetadata as talentMetadata, renderTalentDetail } from "@/app/talent/[id]/page";

/**
 * 🔒 **인재 상세의 캐시 전용 라우트**(2026-08-17). 사람이 직접 여는 주소가 아니다 —
 *    프록시(`src/proxy.ts`)가 네 조건을 **전부** 만족하는 요청만 여기로 rewrite 한다.
 *    주소창은 `/talent/<id>` 그대로다.
 *      ① GET·HEAD  ② 로그인 쿠키 없음  ③ 쿼리스트링 없음  ④ 경로가 /talent/<uuid>
 *
 * 왜 만들었나: 이 화면이 이 사이트에서 가장 많이 열린다 — 7일 실측 **봇 1,244,902건 : 사람 1,008건
 * (961:1)**. 기존 라우트는 요청마다 `getMyProfile()` 로 쿠키를 읽어 캐시가 원리상 불가능했고,
 * 그래서 봇이 훑을 때마다 서버리스 함수가 그만큼 깨어났다. 공개 이력서 7,787건을 주소 하나당
 * **주 191회씩** 다시 만들고 있었다.
 *
 * 🔒 **마스킹 계약은 바뀌지 않는다.** 여기서 그리는 화면은 지금까지 비로그인에게 주던 것과 같다 —
 *    이름·전화·사진은 `canRevealContacts`(광고 중인 병원만)를 통과해야 붙는데 여기선 그 판정이
 *    항상 false 다. 즉 캐시에 굳는 HTML 에 연락처가 애초에 없다. 로그인 사용자는 프록시가
 *    기존 동적 라우트로 보내 지금까지와 똑같이 받는다.
 * 🔴 이 라우트에 세션·개인화를 넣지 마라 — 넣는 순간 그 값이 모두에게 나간다.
 *
 * 🔎 색인: 메타데이터는 기존 라우트 것을 그대로 쓴다 → canonical 이 `/talent/<id>` 를 가리켜
 *    이 경로 자체는 검색에 잡히지 않는다. 사이트맵에도 없고 어디서도 링크하지 않는다.
 */

/**
 * 🔴 6시간이다. **봇의 크롤 간격보다 길어야 절약이 된다** — 같은 주소를 하루 20~30번 훑는데
 *    유효시간이 그 간격보다 짧으면 매번 다시 만들어 캐시가 무의미해진다(형제 프로젝트에서 10분으로
 *    뒀다가 그대로 겪었다). 이력서는 분 단위로 바뀌는 값이 아니다.
 * 🔒 본인이 이력서를 고치거나 **비공개로 내리면** 최대 6시간 낡을 수 있다 — 그래서 그 지점들에
 *    즉시 무효화를 함께 넣었다(mypage/actions.ts 의 saveResume·setResumePublic·deleteResume,
 *    admin/actions.ts 의 강제 비공개).
 */
export const revalidate = 21600;

/**
 * 🔴 빈 배열이 의도다. 동적 세그먼트는 `generateStaticParams` 가 없으면 위 `revalidate` 를 줘도
 *    매 요청 함수를 깨운다(Next 규약). 빈 배열 + 기본 `dynamicParams: true` = **온디맨드 ISR**.
 * 🔒 빌드 때 7,787건을 미리 굽지 않는다 — 열리지도 않는 이력서까지 만들고 배포마다 반복한다.
 */
export async function generateStaticParams() {
  return [];
}

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: Props) {
  // 제목·설명·canonical·robots 은 기존 라우트의 생성기 한 곳에서만 정해지게 한다.
  return talentMetadata({ params });
}

export default async function CachedTalentDetailPage({ params }: Props) {
  // 이 경로로는 쿼리스트링이 오지 않는다(프록시가 그렇게 고른다) → 빈 값을 넘긴다.
  return renderTalentDetail({ params, searchParams: Promise.resolve({}) }, { gated: false });
}
