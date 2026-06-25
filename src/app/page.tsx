// 널스잡 홈페이지 (Indeed 벤치마크) — 검색 우선 랜딩.
// ponytail: 정적 mock 데이터. 검색/지원은 다음 단계에서 DB·라우팅 연결.

const SPECIALTIES = [
  { name: "중환자실", count: 312, icon: "🫀" },
  { name: "응급실", count: 248, icon: "🚑" },
  { name: "수술실", count: 196, icon: "🔪" },
  { name: "병동", count: 521, icon: "🛏️" },
  { name: "외래", count: 174, icon: "🩺" },
  { name: "정신과", count: 88, icon: "🧠" },
  { name: "투석실", count: 64, icon: "💧" },
  { name: "요양병원", count: 305, icon: "🏥" },
];

const REGIONS = [
  "서울", "경기", "인천", "부산", "대구",
  "대전", "광주", "울산", "세종", "강원",
  "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

type Source = "direct" | "worknet" | "public_data";

const JOBS: {
  hospital: string;
  rating: number;
  reviews: number;
  title: string;
  region: string;
  shift: string;
  salary: string;
  tags: string[];
  source: Source;
}[] = [
  {
    hospital: "서울중앙병원",
    rating: 4.6, reviews: 128,
    title: "중환자실(ICU) 간호사 모집 — 경력 우대",
    region: "서울 송파구", shift: "3교대", salary: "연 4,200~5,000만원",
    tags: ["기숙사 제공", "신규 지원", "4대보험"], source: "direct",
  },
  {
    hospital: "부산세계로병원",
    rating: 4.2, reviews: 54,
    title: "수술실(OR) 간호사 — 신입/경력",
    region: "부산 해운대구", shift: "2교대", salary: "월 320~380만원",
    tags: ["경력 우대", "인센티브"], source: "worknet",
  },
  {
    hospital: "대전우리요양병원",
    rating: 4.0, reviews: 31,
    title: "병동 간호사 (요양) — 야간 전담 가능",
    region: "대전 유성구", shift: "야간전담", salary: "월 360만원~",
    tags: ["야간전담", "주 3일"], source: "public_data",
  },
  {
    hospital: "연세그린병원",
    rating: 4.8, reviews: 210,
    title: "응급실(ER) 간호사 정규직 채용",
    region: "서울 서대문구", shift: "3교대", salary: "연 4,500만원~",
    tags: ["복지 우수", "교육 지원", "신규 지원"], source: "direct",
  },
  {
    hospital: "인천나래의원",
    rating: 3.9, reviews: 18,
    title: "외래 간호사 (Day) — 상근",
    region: "인천 연수구", shift: "주간상근", salary: "월 280~330만원",
    tags: ["주 5일", "정시 퇴근"], source: "worknet",
  },
  {
    hospital: "경기365정신건강병원",
    rating: 4.3, reviews: 42,
    title: "정신과 병동 간호사 — 경력 무관",
    region: "경기 수원시", shift: "3교대", salary: "연 3,900~4,400만원",
    tags: ["경력 무관", "기숙사"], source: "direct",
  },
];

const SOURCE_LABEL: Record<Source, { text: string; cls: string }> = {
  direct: { text: "병원 직접", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  worknet: { text: "워크넷", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  public_data: { text: "공공데이터", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`평점 ${rating}`}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
    </span>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      {/* ── 헤더 ───────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <a href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-600 text-white">N</span>
            <span>널스<span className="text-teal-600">잡</span></span>
          </a>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#jobs" className="hover:text-teal-600">채용 검색</a>
            <a href="#salary" className="hover:text-teal-600">급여</a>
            <a href="#reviews" className="hover:text-teal-600">병원 리뷰</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href="#" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block">로그인</a>
            <a href="#" className="rounded-lg px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">회원가입</a>
            <a href="#hospital" className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700">병원 공고등록</a>
          </div>
        </div>
      </header>

      {/* ── 히어로 + 듀얼 검색바 ───────────── */}
      <section className="bg-gradient-to-b from-teal-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            간호사 채용, <span className="text-teal-600">검색 한 번</span>으로.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
            병원이 직접 올린 공고와 워크넷·공공데이터 공고를 한곳에서. 진료과·지역으로 찾고 간편지원하세요.
          </p>

          <form className="mx-auto mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200 sm:flex-row">
            <label className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="직무·병원·키워드 (예: 중환자실, OO병원)" />
            </label>
            <span className="hidden w-px bg-slate-200 sm:block" />
            <label className="flex items-center gap-2 rounded-xl px-3 py-2.5 sm:w-48">
              <span className="text-slate-400"><PinIcon /></span>
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="지역 (예: 서울)" />
            </label>
            <button type="submit" className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              검색
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-slate-400">인기 검색:</span>
            {["중환자실", "응급실", "수술실", "야간전담", "요양병원", "신규간호사"].map((k) => (
              <a key={k} href="#jobs" className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200 hover:ring-teal-300 hover:text-teal-700">
                {k}
              </a>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        {/* ── 통계 스트립 ──────────────────── */}
        <div className="-mt-6 grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm sm:gap-6 sm:p-6">
          {[
            ["오늘의 공고", "2,213건"],
            ["등록 병원", "1,480곳"],
            ["이번 주 지원", "9,640건"],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-xl font-extrabold text-teal-600 sm:text-3xl">{val}</div>
              <div className="mt-1 text-xs text-slate-500 sm:text-sm">{label}</div>
            </div>
          ))}
        </div>

        {/* ── 인기 진료과 ──────────────────── */}
        <section className="mt-14">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">진료과로 찾기</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SPECIALTIES.map((s) => (
              <a key={s.name} href="#jobs" className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-md">
                <div className="text-2xl">{s.icon}</div>
                <div className="mt-2 font-semibold text-slate-800 group-hover:text-teal-700">{s.name}</div>
                <div className="text-sm text-slate-500">{s.count.toLocaleString()}건</div>
              </a>
            ))}
          </div>
        </section>

        {/* ── 추천 공고 ────────────────────── */}
        <section id="jobs" className="mt-14 scroll-mt-20">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">추천 공고</h2>
            <a href="#" className="text-sm font-semibold text-teal-700 hover:underline">전체 보기 →</a>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {JOBS.map((j, i) => {
              const src = SOURCE_LABEL[j.source];
              return (
                <article key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                        {j.hospital.slice(0, 2)}
                      </span>
                      {j.hospital}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${src.cls}`}>{src.text}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Stars rating={j.rating} />
                    <span>리뷰 {j.reviews}</span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-slate-900">{j.title}</h3>

                  <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5"><span className="text-slate-400"><PinIcon /></span>{j.region}</div>
                    <div className="flex items-center gap-1.5"><span className="text-slate-400">🕒</span>{j.shift}</div>
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800"><span className="text-slate-400">💰</span>{j.salary}</div>
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {j.tags.map((t) => (
                      <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t}</span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <button className="flex-1 rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                      {j.source === "direct" ? "간편지원" : "원본에서 지원 ↗"}
                    </button>
                    <button aria-label="저장" className="rounded-lg border border-slate-200 px-3 py-2 text-slate-500 hover:bg-slate-50">♥</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── 지역별 ───────────────────────── */}
        <section className="mt-14">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">지역으로 찾기</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <a key={r} href="#jobs" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:border-teal-300 hover:text-teal-700">
                {r}
              </a>
            ))}
          </div>
        </section>

        {/* ── 병원 CTA ─────────────────────── */}
        <section id="hospital" className="mt-16 overflow-hidden rounded-3xl bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-2xl font-extrabold sm:text-3xl">병원이세요? 무료로 공고를 등록하세요.</h2>
          <p className="mx-auto mt-3 max-w-xl text-teal-50">
            병원 정보는 한 번만 입력하면 공고마다 자동으로 채워집니다. 상위노출 광고로 더 많은 간호사에게 닿으세요.
          </p>
          <a href="#" className="mt-6 inline-block rounded-xl bg-white px-6 py-3 text-sm font-bold text-teal-700 hover:bg-teal-50">
            병원 회원가입 →
          </a>
        </section>
      </main>

      {/* ── 푸터 ─────────────────────────── */}
      <footer className="mt-16 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <div className="text-lg font-extrabold text-slate-700">널스<span className="text-teal-600">잡</span></div>
              <p className="mt-2 max-w-sm text-xs leading-relaxed">
                간호사·간호조무사 채용 검색 플랫폼. 일부 공고는 고용노동부 워크넷 및 공공데이터포털에서 제공받아 표시합니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-8 text-xs">
              <ul className="space-y-2">
                <li className="font-semibold text-slate-700">서비스</li>
                <li><a href="#jobs" className="hover:text-teal-600">채용 검색</a></li>
                <li><a href="#salary" className="hover:text-teal-600">급여 정보</a></li>
                <li><a href="#reviews" className="hover:text-teal-600">병원 리뷰</a></li>
              </ul>
              <ul className="space-y-2">
                <li className="font-semibold text-slate-700">병원</li>
                <li><a href="#hospital" className="hover:text-teal-600">공고 등록</a></li>
                <li><a href="#" className="hover:text-teal-600">광고 상품</a></li>
              </ul>
              <ul className="space-y-2">
                <li className="font-semibold text-slate-700">고객</li>
                <li><a href="#" className="hover:text-teal-600">이용약관</a></li>
                <li><a href="#" className="hover:text-teal-600">개인정보처리방침</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-400">
            © 2026 널스잡 (NurseJob). 데모 화면 — 표시된 공고·병원·평점은 예시 데이터입니다.
          </div>
        </div>
      </footer>
    </>
  );
}
