import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import { COMPANY, LINK_CLASS } from "@/lib/constants";

export const metadata = {
  title: "고객센터 — 널스넷",
  description: "널스넷 이용 문의 · 결제 문의 · 병원 정보 정정 요청",
  robots: { index: false },
};

/**
 * 고객센터.
 *
 * 🔴 만든 이유: 광고 결제가 실패하면 화면이 "결제가 되었다면 고객센터로 문의해 주세요"라고
 *    안내하는데(components/AdPurchase.tsx) 정작 갈 곳이 없었다. 돈이 빠져나간 사람이
 *    연락할 방법을 못 찾는 상태였다.
 *
 * 폼은 두지 않는다 — 문의를 담을 테이블도, 답장을 보낼 메일 발송도 아직 없다.
 * 접수해놓고 아무 답이 없는 것이 연락처만 적어두는 것보다 나쁘다. 메일·전화로 직접 잇는다.
 */
export default async function ContactPage() {
  const profile = await getMyProfile();
  const mailto = (subject: string) => `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}`;

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName, role: profile.role } : null} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">고객센터</h1>
        <p className="mt-2 text-sm text-slate-600">
          이용 중 막히거나 잘못된 정보를 보셨다면 알려주세요. 평일 기준 1~2일 안에 답변드립니다.
        </p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">연락처</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">이메일</dt>
              <dd><a href={`mailto:${COMPANY.email}`} className={LINK_CLASS}>{COMPANY.email}</a></dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-slate-500">전화</dt>
              <dd><a href={`tel:${COMPANY.tel.replace(/-/g, "")}`} className={LINK_CLASS}>{COMPANY.tel}</a></dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">자주 있는 문의</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {/* 제목을 미리 채워 보낸다 — 무엇을 적어야 하는지 몰라 문의를 포기하는 경우가 많다 */}
            <li>
              <a href={mailto("[널스넷] 광고 결제 문의")} className={LINK_CLASS}>광고 결제가 되었는데 반영되지 않았습니다</a>
              <p className="mt-0.5 text-slate-500">결제하신 휴대폰번호와 주문번호(영수증 화면)를 함께 보내주세요.</p>
            </li>
            <li>
              <a href={mailto("[널스넷] 병원 정보 정정 요청")} className={LINK_CLASS}>우리 병원이 다른 계정에 등록되어 있습니다</a>
              <p className="mt-0.5 text-slate-500">사업자등록증과 병원명을 보내주시면 확인 후 연결을 옮겨드립니다.</p>
            </li>
            <li>
              <a href={mailto("[널스넷] 게시물 신고")} className={LINK_CLASS}>허위·비방 리뷰나 게시글을 신고합니다</a>
              <p className="mt-0.5 text-slate-500">해당 글 주소와 사유를 보내주세요. 검토 후 비공개 처리합니다.</p>
            </li>
            <li>
              <a href={mailto("[널스넷] 개인정보 열람·삭제 요청")} className={LINK_CLASS}>내 정보를 지우고 싶습니다</a>
              <p className="mt-0.5 text-slate-500">
                직접 하시려면 <a href="/mypage/account" className={LINK_CLASS}>내 정보 · 계정</a>에서 탈퇴하실 수 있습니다.
              </p>
            </li>
          </ul>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-xs leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-700">{COMPANY.name}</p>
          <p className="mt-1">
            대표 {COMPANY.ceo} · 사업자등록번호 {COMPANY.bizNo}<br />
            {COMPANY.address}<br />
            통신판매신고 {COMPANY.mailOrderNo} · 직업정보제공사업 {COMPANY.jobInfoNo}
          </p>
        </section>

        <div className="mt-6">
          <Button href="/" variant="outline" size="md">홈으로</Button>
        </div>
      </main>
    </>
  );
}
