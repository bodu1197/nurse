import { SIDO_LIST, SIDO_SIGUNGU } from "./koreaRegions.ts";
import { canonicalSido } from "./jobRegion.ts";
import { DEPT_ANY } from "./resumeOptions.ts";

/**
 * 🤖 AI 자동매치 — 이력서 ↔ 공고를 축별로 맞춘다. dolpagu(C:\dev\talent) src/lib/jobs/match.ts 이식.
 *
 * 🔴 **A/B 등급으로 가르지 않는다**(오너 확정 2026-08-05: "A/B 나누지 말고 한 목록으로 매칭해 주되
 *    일치하지 않는 것은 표시해줘 — 5개 중 4개는 맞는데 1개 불일치, 이런 식으로").
 *    그래서 이 파일은 등급 대신 **일치 개수와 어긋난 축의 이름**을 돌려준다. 화면은 일치 많은 순으로
 *    한 목록에 쌓고 카드마다 "5개 중 4개 일치 · 다른 조건: 진료과 미표기" 를 적는다.
 *
 * 🗂 축을 다섯으로 정한 근거(2026-08-05 운영 DB 실측 — 공고 1,344건 / 공개 이력서 7,779건):
 *
 *      축          공고에 값 있음    이력서에 값 있음     판단
 *      지역         1,343 (100%)     7,779 (100%)      ✅ 핵심 축 — SQL 로 시도까지 좁힌다
 *      진료과         288 ( 21%)     7,777 (100%)      ✅ 씀. 공고 쪽이 비면 '미표기'로 적는다
 *      직종         1,301 ( 97%)     4,277 ( 55%)      ✅ 씀
 *      고용형태     1,344 (100%)     7,779 (100%)      ✅ 씀(아래 어휘 주의)
 *      급여         1,321 ( 98%)     1,551 ( 20%)      ✅ 씀 — 양쪽 다 "월급 220만원" 꼴이라 파싱된다
 *      기관 종별    1,311 ( 98%)         6 (0.08%)     ❌ 뺀다 — 이력서에 아무도 안 적는다
 *      근무형태     1,344 (100%)        12 (0.15%)     ❌ 뺀다 — 위와 같음(이관 회원에게 그 칸이 없었다)
 *
 *    죽은 축을 넣으면 "전원 불일치" 가 되어 매칭이 아니라 소음이 된다.
 *
 * 🔒 축은 **채운 사람에게만 적용**한다. 희망 급여를 안 적었으면 급여는 아예 안 세고 "4개 중 4개 일치"가
 *    된다 — 안 적은 것을 불일치로 세면 이력서를 덜 채운 사람이 벌을 받는 꼴이다.
 */

/** 이력서에서 그대로 뽑는다 — 컬럼명을 그대로 써서 호출부가 행을 손대지 않고 넘길 수 있게 한다. */
export interface SeekerProfile {
  readonly desired_location: string | null;
  readonly specialties: readonly string[];
  readonly job_categories: readonly string[];
  readonly desired_employment_type: string | null;
  readonly desired_salary: string | null;
}

/** 공고에서 그대로 뽑는다(jobs / jobs_listed 컬럼명). */
export interface JobFacts {
  readonly sido: string | null;
  readonly sigungu: string | null;
  readonly specialty: string | null;
  readonly job_category: string | null;
  readonly employment_type: string | null;
  readonly salary_text: string | null;
}

export interface MatchResult {
  /** 적용된 축 중 맞은 개수 */
  readonly matched: number;
  /** 이 사람에게 적용된 축의 개수(안 채운 축은 안 센다) */
  readonly total: number;
  /** 어긋난 축의 사람 말 이름. 전부 맞으면 빈 배열. */
  readonly mismatches: readonly string[];
  /**
   * 🔴 지역만 따로 돌려준다 — **지역은 핵심 축**이라 어긋나면 목록에서 아예 뺀다.
   *
   * 다른 축은 어긋나도 "이건 다릅니다" 라고 적어 보여줄 값이 있지만, 원하지 않는 지역의 공고는
   * 아무리 직종·급여가 맞아도 갈 수 없는 곳이다. 실측(2026-08-05): 서대문·은평·고양 덕양을 고른
   * 이력서에 후보 442건이 잡혔는데 그중 293건이 **한 축도 안 맞는** 다른 지역 공고였다.
   * 후보 조회는 시도까지만 SQL 로 좁히므로(시군구는 "성남시"→"성남시 분당구" 접두 규칙이라 앱이
   * 판정한다) 그 마지막 한 겹을 여기서 알려준다.
   */
  readonly regionOk: boolean;
}

// ─────────────────────────────── 지역 ───────────────────────────────

/**
 * 이력서 희망지역 표기와 공고 지역 표기가 **다르다**. 여기가 둘을 잇는 유일한 지점이다.
 *   이력서 desired_location : "서울 종로구, 경기 성남시"  (koreaRegions 의 축약 표기)
 *   공고 sido/sigungu       : "서울특별시" / "종로구"      (jobRegion 의 canonical 표기)
 * 한쪽만 고치면 매칭이 통째로 0건이 되므로 canonicalSido() 를 그대로 재사용한다.
 */
export interface DesiredRegion {
  readonly sido: string;
  readonly sigungu: string | null;
}

export function desiredRegions(desiredLocation: string | null): DesiredRegion[] {
  const out: DesiredRegion[] = [];
  for (const raw of (desiredLocation ?? "").split(",")) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const short = parts[0];
    const sido = canonicalSido(short);
    if (!sido) continue; // 목록 밖 표기는 조건이 될 수 없다
    const sigungu = parts.slice(1).join(" ");
    // 🔴 표에 없는 시군구(레거시 "경기 북부출장소" 등 6종, 실측 57명)는 **시도 전체**로 본다.
    //    공고 sigungu 와 영영 안 맞아, 그 사람은 경기도 공고를 받아도 전부 '지역 다름'이 된다.
    const known = !!sigungu && (SIDO_SIGUNGU[short] ?? []).includes(sigungu);
    out.push({ sido, sigungu: known ? sigungu : null });
  }
  return out;
}

/**
 * 시군구까지 고른 희망은 시군구로, "○○ 전체"는 시도로 맞춘다.
 * 🔴 공고 sigungu 는 "성남시 분당구" 처럼 구까지 올 수 있어 **접두 비교**한다
 *    ("성남시" 희망이 "성남시 분당구" 공고를 잡는다).
 */
function regionMatches(regions: readonly DesiredRegion[], job: JobFacts): boolean {
  return regions.some(
    (r) => r.sido === job.sido && (!r.sigungu || (job.sigungu ?? "").startsWith(r.sigungu)),
  );
}

/** SQL 로 좁힐 시도 목록(공고 canonical 표기). 비면 매칭 자체가 성립하지 않는다. */
export function candidateSidos(seeker: SeekerProfile): string[] {
  return [...new Set(desiredRegions(seeker.desired_location).map((r) => r.sido))];
}

/**
 * 공고 canonical 시도 → 이력서 표기. 병원 쪽 매칭(인재 찾기)이 desired_location 을 부분일치로
 * 훑을 때 쓴다. 🔴 "전남광주통합특별시" 하나가 이력서 표기로는 **둘("전남"·"광주")** 이라 배열이다.
 */
const SHORT_BY_CANONICAL: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const short of SIDO_LIST) {
    const c = canonicalSido(short);
    if (!c) continue;
    const list = m.get(c);
    if (list) list.push(short);
    else m.set(c, [short]);
  }
  return m;
})();

/**
 * 병원이 인재를 고를 때 쓸 진료과 조건 — 공고의 진료과 + **'부서무관'**.
 *
 * 🔴 '부서무관'을 고른 간호사(어느 부서든 좋다는 뜻)가 통째로 빠지면 안 된다. 간호사 쪽 판정은
 *    그 값을 "조건 없음"으로 읽는데(evaluateMatch) 병원 쪽만 배열 겹침(overlaps)으로 걸러내면
 *    같은 사람이 한쪽에서는 후보이고 다른 쪽에서는 아닌, 서로 어긋난 상태가 된다.
 */
export function talentSpecialtyFilter(adSpecialties: readonly string[]): string[] {
  return adSpecialties.length > 0 ? [...new Set([...adSpecialties, DEPT_ANY])] : [];
}

export function shortSidos(canonicals: readonly (string | null)[]): string[] {
  const out = new Set<string>();
  for (const c of canonicals) for (const s of SHORT_BY_CANONICAL.get(c ?? "") ?? []) out.add(s);
  return [...out];
}

// ─────────────────────────────── 급여 ───────────────────────────────

/** 급여 단위 → 연봉 환산 계수. 주 40시간(월 209시간) · 월 22일 근무 기준. */
const TO_YEAR: Readonly<Record<string, number>> = { 시급: 209 * 12, 일급: 22 * 12, 월급: 12, 연봉: 1 };

/**
 * "월급 220만원 ~ 230만원"(공고) · "월급 210만원 이상"(이력서) → **연봉(원)**.
 * 실측: 공고 1,321건 중 1,318건, 이력서 1,551건 중 1,545건이 이 꼴이다(단위 + 금액).
 *
 * 🔴 **단위가 나올 때마다 구간을 끊어 각자의 단위로 환산한다.** 단위 하나만 보고 문자열 전체에서
 *    금액 최댓값을 고르면, "시급 10,030원(월 209만원)" 같은 혼합 표기에서 209만원이 시급으로 읽혀
 *    연봉 5억이 된다 — 급여 축이 통째로 거짓 일치가 된다. 지금 운영 데이터에는 그런 값이 없지만
 *    (실측 2026-08-05: 양쪽 다 단위 2개 이상인 행 0건), 병원이 직접 적는 자유 텍스트라 언제든 들어온다.
 * 🔴 한 구간 안에 금액이 여럿이면(범위) **큰 쪽**을 쓴다 — 공고 급여는 상한이 "최대 이만큼 준다"는 뜻이다.
 * 한 함수로 양쪽을 읽어 규칙이 갈리지 않게 한다. 단위를 못 읽으면 null —
 * 조건 미적용(이력서 쪽)이거나 확인 불가(공고 쪽)로 갈린다.
 */
export function yearlyKrw(text: string | null): number | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  let best: number | null = null;
  for (const seg of s.split(/(?=시급|일급|월급|연봉)/)) {
    const unit = seg.match(/^(시급|일급|월급|연봉)/)?.[1];
    if (!unit) continue; // 단위 없이 시작하는 앞머리 조각
    const amounts = [...seg.matchAll(/([\d,]+)\s*(만)?\s*원/g)]
      .map((m) => Number(m[1].replace(/,/g, "")) * (m[2] ? 10_000 : 1))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (amounts.length === 0) continue;
    const yearly = Math.max(...amounts) * TO_YEAR[unit];
    if (best === null || yearly > best) best = yearly;
  }
  return best;
}

// ───────────────────────────── 고용형태 ─────────────────────────────

/**
 * 🔴 이력서에 **옛 널스넷 어휘**가 남아 있다(실측): 아르바이트 1,101 · 스페어 975 · 프리랜서 950.
 *    공고 쪽 값은 정규직·계약직·파트타임 셋뿐이라 그대로 비교하면 3,026명이 영영 불일치가 된다.
 *    오너 확정 2026-08-05: **아르바이트=파트타임으로 잇고, 대응 값이 없는 것은 축에서 뺀다.**
 *    (이력서 값을 DB 에서 고치는 안은 회원이 직접 고른 값이라 되돌릴 수 없어 택하지 않았다.)
 */
const EMPLOYMENT_ALIAS: Readonly<Record<string, string>> = { 아르바이트: "파트타임" };
const EMPLOYMENT_NO_AXIS: ReadonlySet<string> = new Set(["무관", "스페어", "프리랜서"]);

export function normalizedEmployment(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t || EMPLOYMENT_NO_AXIS.has(t)) return null;
  return EMPLOYMENT_ALIAS[t] ?? t;
}

// ───────────────────────────── 판정 ─────────────────────────────

export function evaluateMatch(seeker: SeekerProfile, job: JobFacts): MatchResult {
  const mismatches: string[] = [];
  let total = 0;
  const axis = (ok: boolean, label: string) => {
    total += 1;
    if (!ok) mismatches.push(label);
  };

  const regions = desiredRegions(seeker.desired_location);
  // 지역을 안 적은 사람은 매칭 자체가 안 열린다(canMatch) — 그래서 여기서는 true 로 둔다.
  const regionOk = regions.length === 0 || regionMatches(regions, job);
  if (regions.length > 0) axis(regionOk, "지역 다름");

  // '부서무관'을 고른 사람은 부서를 조건으로 삼지 않겠다는 뜻이다 → 진료과 축을 아예 안 센다.
  if (!seeker.specialties.includes(DEPT_ANY) && seeker.specialties.length > 0) {
    const ok = !!job.specialty && seeker.specialties.includes(job.specialty);
    // 공고에 진료과가 아예 없는 것(79%)과 다른 과인 것은 사용자에게 뜻이 다르다 — 나눠 적는다.
    axis(ok, job.specialty ? "진료과 다름" : "진료과 미표기");
  }

  if (seeker.job_categories.length > 0) {
    const ok = !!job.job_category && seeker.job_categories.includes(job.job_category);
    axis(ok, job.job_category ? "직종 다름" : "직종 미표기");
  }

  const wantEmployment = normalizedEmployment(seeker.desired_employment_type);
  if (wantEmployment) axis(job.employment_type === wantEmployment, "고용형태 다름");

  const want = yearlyKrw(seeker.desired_salary);
  if (want !== null) {
    const offer = yearlyKrw(job.salary_text);
    // 공고 급여를 못 읽으면 "맞다"고 할 수 없다 — 다만 낮은 것과는 다른 말이므로 다르게 적는다.
    axis(offer !== null && offer >= want, offer === null ? "급여 확인 불가" : "급여 낮음");
  }

  return { matched: total - mismatches.length, total, mismatches, regionOk };
}

/**
 * 매칭을 시도할 수 있는 이력서인가. 지역이 유일한 필수 축이다 —
 * 이게 비면 SQL 로 좁힐 것이 없어 전국 공고가 나오고 "내 조건에 맞는 공고"가 거짓말이 된다.
 */
export function canMatch(seeker: SeekerProfile): boolean {
  return candidateSidos(seeker).length > 0;
}

/**
 * 매칭이 쓰는 다섯 항목 중 **무엇이 채워져 있는가** — 이력서 화면과 /match 가 같은 안내를 띄운다
 * (오너 지시 2026-08-05: "이력서 작성자들에게 AI 자동매칭을 위해 최대한 입력값을 풍부하게
 * 입력하라고 노티스"). 두 화면에 손으로 적으면 규칙이 갈라지므로 목록은 여기 한 곳에서 만든다.
 */
export interface AxisStatus {
  readonly label: string;
  readonly filled: boolean;
  /** 비어 있을 때 무엇을 잃는지 — 안내 문구가 그대로 쓴다. */
  readonly why: string;
}

export function matchAxes(seeker: SeekerProfile): AxisStatus[] {
  return [
    {
      label: "희망 근무지",
      filled: canMatch(seeker),
      why: "이게 없으면 자동매치가 아예 열리지 않습니다",
    },
    {
      label: "희망 근무부서",
      filled: seeker.specialties.length > 0,
      why: "내과·응급실처럼 원하는 과의 공고를 위로 올려 드립니다",
    },
    {
      label: "희망 직종",
      filled: seeker.job_categories.length > 0,
      why: "간호직·간호조무직이 섞여 나오는 것을 막습니다",
    },
    {
      label: "희망 고용형태",
      filled: normalizedEmployment(seeker.desired_employment_type) !== null,
      why: "정규직·계약직·파트타임 중 원하는 것만 골라 드립니다",
    },
    {
      label: "희망 급여",
      filled: yearlyKrw(seeker.desired_salary) !== null,
      why: "희망보다 낮은 공고를 뒤로 미룹니다 (예: 월급 250만원)",
    },
  ];
}
