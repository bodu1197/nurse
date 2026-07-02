import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ComingSoon from "@/components/ComingSoon";
import Button from "@/components/Button";
import { getCurrentUser } from "@/lib/data/user";
import { getNurseOccupation } from "@/lib/data/worknet";

const TITLE = "간호사 급여·직업 정보 — 평균연봉·전망·하는 일 | 널스넷";
const DESCRIPTION =
  "간호사 평균연봉과 급여 구간(하위·평균·상위), 직업 만족도·일자리 전망, 하는 일·되는 길·관련 자격까지. 고용노동부 워크넷 공식 직업정보.";

// 데이터를 못 불러오면(키 누락·워크넷 장애) 빈/오류 페이지 색인 방지.
export async function generateMetadata() {
  const occ = await getNurseOccupation();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/salaries" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: "/salaries", type: "website", locale: "ko_KR", siteName: "널스넷" },
    twitter: { title: TITLE, description: DESCRIPTION },
    ...(occ ? {} : { robots: { index: false } }),
  };
}

const won = (n: number) => n.toLocaleString("ko-KR");

function ChipGroup({ title, items }: Readonly<{ title: string; items: string[] }>) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li key={`${title}-${i}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SalariesPage() {
  const [user, occ] = await Promise.all([getCurrentUser(), getNurseOccupation()]);

  if (!occ) {
    return (
      <>
        <SiteHeader user={user} />
        <ComingSoon title="급여 정보" badge="일시 오류" desc="간호사 급여 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />
      </>
    );
  }

  const s = occ.salary;
  const jsonLd = s && {
    "@context": "https://schema.org",
    "@type": "Occupation",
    name: "간호사",
    ...(occ.summary ? { description: occ.summary } : {}),
    estimatedSalary: {
      "@type": "MonetaryAmountDistribution",
      name: "연봉",
      currency: "KRW",
      unitText: "YEAR",
      percentile25: s.low * 10000,
      median: s.mid * 10000,
      percentile75: s.high * 10000,
    },
  };

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      <SiteHeader user={user} />

      <main className="flex-1">
        {/* ── 히어로 ───────────────────────── */}
        <section className="border-b border-slate-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50/50">
          <div className="mx-auto max-w-[880px] px-4 py-10 sm:py-12">
            <p className="text-sm font-semibold text-teal-700">간호사 직업 정보</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">간호사 급여·전망</h1>
            {occ.summary && <p className="mt-3 leading-relaxed text-slate-600">{occ.summary}</p>}
          </div>
        </section>

        <div className="mx-auto max-w-[880px] px-4">
          {/* ── 연봉 수준 ─────────────────────── */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900">연봉 수준</h2>
            {s ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { k: "하위 25%", v: s.low, hl: false },
                    { k: "평균", v: s.mid, hl: true },
                    { k: "상위 25%", v: s.high, hl: false },
                  ].map(({ k, v, hl }) => (
                    <div
                      key={k}
                      className={`rounded-2xl border p-3 text-center sm:p-5 ${hl ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}
                    >
                      <p className="text-xs font-medium text-slate-500">{k}</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900 sm:text-2xl">
                        {won(v)}
                        <span className="ml-0.5 text-xs font-bold text-slate-500 sm:text-sm">만원</span>
                      </p>
                    </div>
                  ))}
                </div>
                {s.year && <p className="mt-2 text-xs text-slate-400">{s.year}년 기준</p>}
              </>
            ) : (
              <p className="mt-3 text-slate-600">{occ.salaryRaw || "급여 정보가 제공되지 않습니다."}</p>
            )}

            {(occ.satisfaction != null || occ.prospect) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {occ.satisfaction != null && (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-medium text-slate-500">직업 만족도</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{occ.satisfaction}%</p>
                  </div>
                )}
                {occ.prospect && (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-medium text-slate-500">일자리 전망</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{occ.prospect}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── 되는 길 ───────────────────────── */}
          {occ.way && (
            <section className="mt-10">
              <h2 className="text-lg font-bold text-slate-900">되는 길</h2>
              <p className="mt-2 leading-relaxed text-slate-600">{occ.way}</p>
            </section>
          )}

          {/* ── 자격·학과 ─────────────────────── */}
          {(occ.certs.length > 0 || occ.majors.length > 0) && (
            <section className="mt-10">
              <h2 className="text-lg font-bold text-slate-900">자격·학과</h2>
              <div className="mt-3 grid gap-6 sm:grid-cols-2">
                <ChipGroup title="관련 자격" items={occ.certs} />
                <ChipGroup title="관련 학과" items={occ.majors} />
              </div>
            </section>
          )}

          {/* ── 직업 프로파일 ─────────────────── */}
          <section className="mt-10">
            <h2 className="text-lg font-bold text-slate-900">간호사 직업 프로파일</h2>
            <div className="mt-3 grid gap-6 sm:grid-cols-2">
              <ChipGroup title="필요 지식" items={occ.knowledge} />
              <ChipGroup title="업무수행 능력" items={occ.abilities} />
              <ChipGroup title="업무 환경" items={occ.environment} />
              <ChipGroup title="성격·흥미" items={[...occ.character, ...occ.interest]} />
              <ChipGroup title="직업 가치관" items={occ.values} />
            </div>
          </section>

          <p className="mt-8 text-xs text-slate-400">직업 정보 출처: 고용노동부 워크넷 한국직업정보</p>

          {/* ── 공고 CTA ──────────────────────── */}
          <section className="my-12 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
            <p className="text-lg font-bold text-slate-900">간호사 채용공고 보러 가기</p>
            <p className="mt-1 text-sm text-slate-600">지역·진료과로 딱 맞는 공고를 찾아보세요.</p>
            <Button href="/jobs" size="lg" className="mt-4">
              채용공고 검색 <span aria-hidden>→</span>
            </Button>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
