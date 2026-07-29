import { redirect } from "next/navigation";

export const metadata = { title: "인재 검색 — 널스넷", robots: { index: false } };

/**
 * 인재 검색은 /talent 한 곳이다.
 *
 * 🔴 전에는 같은 일을 하는 화면이 둘이었다 — 헤더 '인재정보'(/talent)는 키워드·근무부서·직종·
 *    시도·시군구·경력 + 패싯까지 있는데, 마이페이지 사이드바 '인재 검색'(여기)은 진료과·시도·경력
 *    3개뿐이었다. 병원은 사이드바(빈약한 쪽)를 자기 전용 도구로 믿고 쓰다가 "검색이 잘 안 된다"고
 *    느꼈고, 더 좋은 쪽이 헤더에 있다는 걸 몰랐다. 게다가 이쪽 카드는 전화번호만 그려서
 *    이메일만 적어둔 인재(실측: 전화 6,817 < 이메일 7,257)에게는 연락 수단이 아예 안 보였다.
 *    /talent 의 상세는 전화·이메일을 모두 보여준다(TalentDetail).
 *
 * 파일을 지우지 않고 리다이렉트로 남긴다 — 북마크·기존 링크가 끊기지 않게.
 * 열람 자격(광고 중인 병원) 판정은 /talent 가 같은 함수(canRevealContacts)로 한다.
 */
export default function MypageTalentRedirect() {
  redirect("/talent");
}
