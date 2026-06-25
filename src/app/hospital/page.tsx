import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";

const HOSP_TITLE = "병원 서비스 — 간호사 채용 무료 등록 | 널스넷";
const HOSP_DESC = "병원 채용담당자를 위한 간호사 채용 서비스. 사업자 인증 후 공고를 무료로 등록하고 79,000여 개 병원 데이터 기반으로 간호사를 만나보세요.";

export const metadata = {
  title: HOSP_TITLE,
  description: HOSP_DESC,
  alternates: { canonical: "/hospital" },
  openGraph: { type: "website", locale: "ko_KR", siteName: "널스넷", url: "/hospital", title: HOSP_TITLE, description: HOSP_DESC },
  twitter: { card: "summary_large_image", title: HOSP_TITLE, description: HOSP_DESC },
};

const STEPS = [
  { n: "1", t: "병원 회원가입", d: "이메일로 간단히 가입합니다." },
  { n: "2", t: "사업자 인증", d: "국세청 사업자등록 진위확인으로 병원을 인증합니다." },
  { n: "3", t: "공고 등록 (무료)", d: "병원을 검색·선택하면 정보가 자동 입력됩니다." },
];

export default async function HospitalPage() {
  const p = await getMyProfile();

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <p className="text-sm font-semibold text-teal-700">병원 채용담당자님께</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">간호사 채용, 무료로 시작하세요</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            전국 79,000여 개 병원 데이터를 기반으로, 사업자 인증을 마친 병원만 공고를 등록합니다.
            인증된 병원의 공고는 간호사에게 신뢰를 줍니다.
          </p>

          <div className="mt-8">
            {!p ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a href="/signup" className="rounded-[20px] bg-teal-600 px-7 py-3 text-base font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">병원 회원가입</a>
                <a href="/login" className="rounded-[20px] border border-slate-300 px-7 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50">로그인</a>
              </div>
            ) : p.role === "hospital" ? (
              <a href="/mypage/jobs/new" className="inline-flex items-center gap-2 rounded-[20px] bg-teal-600 px-7 py-3 text-base font-bold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
                공고 등록하기 <span aria-hidden>→</span>
              </a>
            ) : (
              <p className="rounded-xl bg-slate-50 px-5 py-4 text-sm text-slate-500">
                공고 등록은 병원 회원만 가능합니다. 병원 계정으로 로그인해 주세요.
              </p>
            )}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-4xl gap-6 px-4 py-14 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-teal-600 font-bold text-white">{s.n}</span>
                <h2 className="mt-3 font-bold text-slate-900">{s.t}</h2>
                <p className="mt-1 text-sm text-slate-500">{s.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
