import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";

export const metadata = { title: "페이지를 찾을 수 없습니다 — 널스넷", robots: { index: false } };

/**
 * 앱 전역 404. 없으면 Next 기본 화면이 떠서 헤더도 한국어도 없다.
 *
 * 🔴 **여기서 세션을 읽지 마라(2026-08-17).** 종전에는 `getMyProfile()` 로 로그인 이름을 띄웠는데,
 *    Next 는 **정적/ISR 페이지를 만들 때 이 404 화면을 트리에 함께 넣는다** — 그 한 줄 때문에
 *    캐시하려던 페이지가 통째로 "static → dynamic" 으로 되돌아가 **비로그인 요청이 전부 500** 이 났다
 *    (2026-08-17 운영 실측, 즉시 롤백). 세그먼트별 not-found.tsx 를 따로 둬도 루트 것이 트리에
 *    들어가므로 소용없다 — 확인했다.
 * 🔒 대가는 작다: 404 화면의 머리말이 로그인 사용자에게도 "로그인" 으로 보인다. 그 대신
 *    이력서 상세 7,787장이 CDN 에서 나갈 수 있다(봇 대 사람 961:1인 화면이다).
 * 🔒 덤으로 개인정보도 한 겹 안전해진다 — 캐시된 404 에 남의 표시이름이 굳을 여지가 사라진다.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">페이지를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-slate-500">주소가 바뀌었거나 삭제된 페이지입니다.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href="/" size="md">홈으로</Button>
          <Button href="/jobs" variant="outline" size="md">채용공고</Button>
        </div>
      </main>
    </>
  );
}
