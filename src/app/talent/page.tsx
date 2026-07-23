import SiteHeader from "@/components/SiteHeader";
import Button from "@/components/Button";
import { getMyProfile } from "@/lib/data/user";

export const metadata = {
  title: "인재정보 — 널스넷",
  description: "이력서를 공개한 간호사 인재를 병원이 검색하고 채용 제안을 보낼 수 있습니다.",
  alternates: { canonical: "/talent" },
};

// 공개 소개 페이지. 실제 인재 검색은 광고 중인 병원만 열람할 수 있어(/mypage/talent),
// 여기서는 무엇인지 설명하고 자격에 따라 알맞은 곳으로 보낸다.
export default async function TalentIntroPage() {
  const p = await getMyProfile();

  const cta = !p ? (
    <div className="flex flex-wrap justify-center gap-2">
      <Button href="/hospital" size="md">병원 회원으로 시작</Button>
      <Button href="/login" variant="outline" size="md">로그인</Button>
    </div>
  ) : p.role === "hospital" ? (
    <Button href="/mypage/talent" size="md">인재 검색하기 →</Button>
  ) : p.role === "admin" ? (
    <Button href="/mypage/talent" size="md">인재 검색(관리자)</Button>
  ) : (
    // 간호사: 스스로가 인재다. 이력서를 공개하면 여기에 노출된다.
    <div className="flex flex-col items-center gap-2">
      <Button href="/mypage/resume" size="md">내 이력서 공개 설정</Button>
      <p className="text-xs text-slate-500">이력서를 공개하면 광고 중인 병원이 나를 찾을 수 있습니다.</p>
    </div>
  );

  return (
    <>
      <SiteHeader user={p ? { displayName: p.displayName } : null} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">간호사 인재정보</h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          이력서를 공개한 간호사 인재를 병원이 직접 검색하고 채용 제안을 보낼 수 있습니다.
          경력·진료과·희망 근무지·근무형태로 원하는 인재를 찾으세요.
        </p>

        <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          {[
            ["🔎 조건 검색", "진료과 · 경력 · 지역 · 근무형태로 필터"],
            ["📄 이력서 열람", "자격증 · 경력 상세 · 희망조건까지"],
            ["📞 바로 연락", "전화 · 문자로 직접 채용 제안"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">{t}</p>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-500">인재 검색은 널스넷에 광고 중인 병원 회원이 이용할 수 있습니다.</p>
        <div className="mt-4">{cta}</div>
      </main>
    </>
  );
}
