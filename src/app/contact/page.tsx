import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";
import SubmitButton from "@/components/SubmitButton";
import { COMPANY, LINK_CLASS } from "@/lib/constants";
import { submitInquiry } from "@/app/contact/actions";

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
 * 🔴 문의 폼을 뒀다. 전에는 mailto 링크뿐이라 문의가 메일함으로 흩어졌고, 무엇이 처리됐는지
 *    빠뜨린 게 있는지 알 방법이 없었다. 이제 표(inquiries)에 쌓이고 /admin/inquiries 에서 처리한다.
 *    메일·전화는 그대로 남긴다 — 폼을 못 쓰는 상황도 있다.
 */
export default async function ContactPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ ok?: string; error?: string }> }>) {
  const [profile, sp] = await Promise.all([getMyProfile(), searchParams]);
  const mailto = (subject: string) => `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}`;

  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">고객센터</h1>
        <p className="mt-2 text-sm text-slate-600">
          이용 중 막히거나 잘못된 정보를 보셨다면 알려주세요. 평일 기준 1~2일 안에 답변드립니다.
        </p>

        <InquiryForm ok={sp.ok} error={sp.error} defaultName={profile?.displayName} defaultEmail={profile?.email} />

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

const ERRORS: Record<string, string> = {
  kind: "문의 종류를 골라주세요.",
  name: "이름을 적어주세요.",
  email: "답변받을 이메일 주소를 정확히 적어주세요.",
  phone: "연락처는 숫자 9~20자리로 적어주세요.",
  subject: "제목을 적어주세요.",
  body: "내용을 다섯 글자 이상 적어주세요.",
  save: "접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600";

function InquiryForm({ ok, error, defaultName, defaultEmail }: Readonly<{
  ok?: string; error?: string; defaultName?: string; defaultEmail?: string;
}>) {
  return (
    <section id="form" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-bold text-slate-900">1:1 문의</h2>
      <p className="mt-1 text-sm text-slate-500">답변은 적어주신 이메일로 보내드립니다.</p>

      {ok && (
        <p role="status" className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          접수했습니다. 평일 기준 1~2일 안에 답변드립니다.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[error] ?? "접수에 실패했습니다."}
        </p>
      )}

      <form action={submitInquiry} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">문의 종류 <span className="text-red-600">*</span></span>
          <select name="kind" required defaultValue="etc" className={INPUT}>
            <option value="payment">광고·결제 문의</option>
            <option value="hospital">병원 정보 정정</option>
            <option value="report">게시물 신고</option>
            <option value="privacy">개인정보 열람·삭제</option>
            <option value="etc">기타</option>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">이름 <span className="text-red-600">*</span></span>
            <input name="name" required maxLength={50} defaultValue={defaultName ?? ""} className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">이메일 <span className="text-red-600">*</span></span>
            <input name="email" type="email" required maxLength={200} defaultValue={defaultEmail ?? ""} className={INPUT} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">연락처</span>
          <input name="phone" inputMode="tel" maxLength={20} placeholder="010-0000-0000" className={INPUT} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">제목 <span className="text-red-600">*</span></span>
          <input name="subject" required maxLength={200} className={INPUT} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">내용 <span className="text-red-600">*</span></span>
          <textarea name="body" required rows={6} minLength={5} maxLength={5000} className={INPUT}
            placeholder="결제 문의라면 주문번호를, 병원 정정이라면 병원명을 함께 적어주시면 빠릅니다." />
        </label>

        <SubmitButton>문의 보내기</SubmitButton>
      </form>
    </section>
  );
}
