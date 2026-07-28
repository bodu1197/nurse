/**
 * 구 널스넷(라이믹스 bhjob) 인재정보 → resumes + work_experiences 이관. 1회성 스크립트.
 *
 * 대상: current_status=PROGRESS + status=PUBLIC 인 8,097건(= 옛 /job/person/list 에 떠 있던 전부).
 *  - person_srl 과 member_srl 이 1:1 이라 중복 없음(resumes.profile_id 가 PK 라 중요).
 *
 * is_public = true 로 넣는다 — 옛 사이트에서 이미 공개 상태였고 오너가 "그대로 전부 공개" 로 결정했다.
 *  ⚠️ resumes.is_public 의 DB 기본값은 false 다(20260724100000_resumes_private_by_default.sql).
 *     그 마이그레이션이 바로 이 임포트를 예상하고 만든 안전장치이므로, 여기서 **명시적으로** true 를 준다.
 *     새 앱에서 공개의 의미: /talent 에 익명 카드 노출 + 광고 중인 병원만 실명·연락처 열람(상세는 noindex).
 *
 * 실행:  node scripts/import-legacy-resumes.ts          (미리보기)
 *        node scripts/import-legacy-resumes.ts --apply  (실제 적재)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, loadLegacyProfileMap, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const DIR = "scripts/legacy-data";
const SEP = "|@|";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

const codes: Record<string, string> = JSON.parse(readFileSync(`${DIR}/bhjob_codes.json`, "utf8"));
const area: { sido: Record<string, string>; sigungu: Record<string, { name: string; parent: string }> } =
  JSON.parse(readFileSync(`${DIR}/area_codes.json`, "utf8"));

// SELECT 순서와 같다(browser 추출 시 마지막 23칸).
const COL = [
  "person_srl", "member_srl", "user_name", "phone_number", "email_address",
  "job_category", "job_department", "job_type", "person_experience_type",
  "person_education_type", "area1", "area2", "area1_2", "area2_2",
  "base_salary_unit", "base_salary_value", "base_salary_value_min", "base_salary_value_max",
  "qualifications", "title", "content", "person_experience_detail", "reg",
] as const;
type Row = Record<(typeof COL)[number], string>;

const raw: string[][] = ["resumes_legacy_1.json", "resumes_legacy_2.json"]
  .flatMap((f) => (JSON.parse(readFileSync(`${f}`, "utf8")) as { rows: string[][] }).rows);
const rows: Row[] = raw.map((c) => Object.fromEntries(COL.map((k, i) => [k, c[i] ?? ""])) as Row);

const nz = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" || t === "NULL" ? null : t;
};
const label = (c: string) => codes[c] ?? c;
const labels = (v: string | null) => (v ? v.split(SEP).map((x) => label(x.trim())).filter(Boolean) : []);

// ⚠️ 아래 htmlToText 는 **옛 버전**이다(태그 주변 소스 개행을 지우지 않아 줄마다 빈 줄이 낀다).
//    공용본(_legacy-util.ts)은 2026-07-28 에 고쳤지만 여기는 그대로 뒀다 — 이 스크립트는 이미 돌았고,
//    지금 결과는 fix-legacy-text.ts 가 공용본으로 다시 변환해 덮어놨기 때문이다.
//    🔴 이 스크립트를 다시 돌릴 일이 생기면 **반드시 _legacy-util 의 htmlToText 로 바꾼 뒤** 돌릴 것.
//       안 그러면 그 빈 줄 버그가 되살아난다.
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 법정동 코드 두 개 → "경기 용인시". 시도만 있으면 시도만. */
function regionOf(sidoCode: string | null, sigunguCode: string | null): string | null {
  const sido = sidoCode ? area.sido[sidoCode] : null;
  const sgg = sigunguCode ? area.sigungu[sigunguCode]?.name : null;
  return [sido, sgg].filter(Boolean).join(" ") || null;
}

// 옛 값: 신입 / 1년이상 / 3년이상 / 5년이상 / 7년이상 / 10년이상
const yearsOf = (v: string | null) => (v === "신입" ? 0 : Number(/(\d+)년/.exec(v ?? "")?.[1] ?? "") || null);
const CAREER_NEW = "신규(경력 없음)";
const careerLevelOf = (v: string | null) => (v ? (v === "신입" ? CAREER_NEW : "경력") : null);

// 옛 값: 고졸 / 중졸 / 초졸 / 대학(2,3년) / 대학(4년) / 대학원(석/박사) / 대학재학 / 대학휴학
const EDU_LEVEL: Record<string, string> = {
  "대학(2,3년)": "3년제 졸업", "대학(4년)": "4년제 졸업", "대학원(석/박사)": "석사",
};
const gradStatusOf = (v: string | null) => (v && /재학|휴학/.test(v) ? "재학중" : v && EDU_LEVEL[v] ? "졸업" : null);

// 자격증 문자열에서 면허 종류만 뽑고 나머지는 자격증으로 남긴다.
const LICENSES = ["간호사", "조산사", "간호조무사"];
function licenseAndCerts(qual: string | null, category: string | null) {
  const items = (qual ? qual.split(SEP).map((s) => s.trim()).filter(Boolean) : []);
  const license = LICENSES.find((l) => items.includes(l))
    ?? LICENSES.find((l) => labels(category).some((c) => c === l))
    ?? null;
  return { license, certs: items.filter((i) => i !== license) };
}

const UNIT: Record<string, string> = { YEAR: "연봉", MONTH: "월급", WEEK: "주급", DAY: "일급", HOUR: "시급" };
const man = (n: number) => (n % 10000 === 0 ? `${n / 10000}만원` : n.toLocaleString("ko-KR") + "원");
function salaryOf(r: Row): string | null {
  const unit = UNIT[nz(r.base_salary_unit) ?? ""];
  if (!unit) return null;
  const min = Number(r.base_salary_value_min) || 0;
  const max = Number(r.base_salary_value_max) || 0;
  const val = Number(r.base_salary_value) || 0;
  if (min && max && min !== max) return `${unit} ${man(min)} ~ ${man(max)}`;
  const one = val || min || max;
  return one ? `${unit} ${man(one)} 이상` : null;
}

/** 이름 칸에 회원번호가 그대로 들어간 옛 데이터가 있다(예: "237") — 이름으로 쓰면 안 된다. */
const nameOf = (r: Row) => {
  const n = nz(r.user_name);
  return n && !/^\d+$/.test(n) ? n : null;
};

type Career = { company_name?: string; employment_status?: string; employment_start_date?: string; employment_end_date?: string; desc?: string };
const ym = (d: string | undefined) => (d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null);

function careersOf(r: Row): Career[] {
  const t = nz(r.person_experience_detail);
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    return Array.isArray(j) ? (j as Career[]) : [];
  } catch {
    return [];
  }
}

// ── profiles 매칭 ────────────────────────────────────────
const byLegacy = await loadLegacyProfileMap(url, H);
console.log(`profiles(legacy 보유): ${byLegacy.size}명`);

// 이미 이력서를 가진 회원은 건드리지 않는다. upsert 로 덮으면 본인이 비공개로 돌려둔 이력서가
// is_public=true 로 되살아나 이름·연락처가 다시 병원에 노출된다(/review8 보안 지적).
const already = new Set(
  (await fetchAllPages<{ profile_id: string }>(url, H, "resumes", "select=profile_id", "profile_id"))
    .map((x) => x.profile_id),
);
console.log(`새 앱에 이미 이력서가 있는 회원: ${already.size}명 — 이관 대상에서 제외`);

// ── 변환 ─────────────────────────────────────────────────
type ResumeRow = {
  profile_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  license_type: string | null;
  certifications: string[];
  experience_years: number | null;
  career_level: string | null;
  education: string | null;
  education_level: string | null;
  graduation_status: string | null;
  specialties: string[];
  desired_location: string | null;
  desired_employment_type: string | null;
  desired_salary: string | null;
  resume_title: string | null;
  intro: string | null;
  is_public: boolean;
  created_at: string | undefined;
};

const skipped: string[] = [];
const kept: string[] = []; // 새 앱 이력서가 이미 있어 손대지 않은 것
const resumes: ResumeRow[] = [];
type NormalizedCareer = Career & { hospital: string; start: string };
const careersByProfile = new Map<string, NormalizedCareer[]>();

for (const r of rows) {
  const pid = byLegacy.get((nz(r.member_srl) ?? "").trim());
  if (!pid) { skipped.push(r.person_srl); continue; }
  if (already.has(pid)) { kept.push(r.person_srl); continue; }

  const { license, certs } = licenseAndCerts(nz(r.qualifications), nz(r.job_category));
  const edu = nz(r.person_education_type);
  const want = [regionOf(nz(r.area1), nz(r.area2)), regionOf(nz(r.area1_2), nz(r.area2_2))].filter(Boolean);
  const intro = htmlToText(r.content);

  resumes.push({
    profile_id: pid,
    name: nameOf(r),
    phone: nz(r.phone_number),
    email: nz(r.email_address),
    license_type: license,
    certifications: certs,
    experience_years: yearsOf(nz(r.person_experience_type)),
    career_level: careerLevelOf(nz(r.person_experience_type)),
    education: edu,
    education_level: edu ? EDU_LEVEL[edu] ?? null : null,
    graduation_status: gradStatusOf(edu),
    specialties: labels(nz(r.job_department)),
    desired_location: want.join(", ") || null,
    desired_employment_type: labels(nz(r.job_type))[0] ?? null,
    desired_salary: salaryOf(r),
    resume_title: nz(r.title),
    intro: intro || null,
    is_public: true, // 오너 결정 — 옛 사이트 공개 상태 유지
    created_at: nz(r.reg) ? `${r.reg}T00:00:00+09:00` : undefined,
  });

  // 병원명·시작월이 없는 경력은 work_experiences 의 NOT NULL 을 못 채운다 → 여기서 걸러
  // **정규화된 형태로** 담는다(뒤에서 non-null 단언이나 빈 문자열 대체가 필요 없게).
  const careers = careersOf(r).flatMap((c) => {
    const hospital = (c.company_name ?? "").trim();
    const start = ym(c.employment_start_date);
    return hospital && start ? [{ ...c, hospital, start }] : [];
  });
  if (careers.length) careersByProfile.set(pid, careers);
}

console.log(`이관 대상 이력서: ${resumes.length}건 / 원천 ${rows.length}건 (profiles 미매칭 ${skipped.length}건, 기존 이력서 보존 ${kept.length}건 제외)`);
console.log(`경력 상세 보유: ${careersByProfile.size}명, 총 ${[...careersByProfile.values()].reduce((a, v) => a + v.length, 0)}건`);

const stat = (f: (x: ResumeRow) => unknown) => resumes.filter((x) => { const v = f(x); return Array.isArray(v) ? v.length : v !== null && v !== undefined; }).length;
console.log("\n── 항목 채움률 ──");
for (const [k, f] of ([
  ["이름", (x: ResumeRow) => x.name], ["전화", (x: ResumeRow) => x.phone],
  ["면허", (x: ResumeRow) => x.license_type], ["경력년수", (x: ResumeRow) => x.experience_years],
  ["학력", (x: ResumeRow) => x.education], ["희망지역", (x: ResumeRow) => x.desired_location],
  ["희망진료과", (x: ResumeRow) => x.specialties], ["자기소개", (x: ResumeRow) => x.intro],
] as const)) console.log(`  ${k}: ${stat(f)} / ${resumes.length}`);

if (!APPLY) {
  console.log("\n── 미리보기 2건(개인정보는 가림) ──");
  for (const x of resumes.slice(0, 2)) {
    console.log({ ...x, profile_id: x.profile_id.slice(0, 8) + "…", name: x.name ? x.name[0] + "**" : null, phone: x.phone ? x.phone.slice(0, 3) + "****" + x.phone.slice(-4) : null, email: "***", intro: x.intro?.slice(0, 60) + " …" });
  }
  console.log("\n미리보기만 했습니다. 적재하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 적재: resumes ────────────────────────────────────────
let done = 0;
for (const part of chunk(resumes, 400)) {
  // ignore-duplicates: 이미 이력서가 있으면 **DB 가** 무시한다. 위 `already` 스냅샷은 미리보기 숫자를 위한
  // 것일 뿐이고, 스냅샷 이후 누가 이력서를 새로 써도 여기서 덮이지 않는다(경합 창 제거).
  // merge-duplicates 였다면 그 사이에 비공개로 돌려둔 이력서가 is_public=true 로 되살아난다.
  const r = await fetch(`${url}/rest/v1/resumes?on_conflict=profile_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n이력서 적재 실패", r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  done += part.length;
  process.stdout.write(`\r  이력서 ${done}/${resumes.length}`);
}
console.log(`\n✅ 이력서 적재: ${done}건`);

// ── 적재: work_experiences ───────────────────────────────
// 자연키가 없어 중복 방지를 못 한다 → **이미 경력이 있는 이력서는 건드리지 않는다**(재실행 안전, 본인 입력 보존).
const existing = new Set(
  (await fetchAllPages<{ resume_id: string }>(url, H, "work_experiences", "select=resume_id", "resume_id"))
    .map((w) => w.resume_id),
);

const works = [...careersByProfile.entries()]
  .filter(([pid]) => !existing.has(pid))
  .flatMap(([pid, cs]) =>
    cs.map((c, i) => ({
      resume_id: pid,
      hospital_name: c.hospital.slice(0, 200),
      start_ym: c.start,
      end_ym: ym(c.employment_end_date),
      is_current: (c.employment_status ?? "").includes("재직"),
      duties: nz(c.desc),
      sort_order: i,
    })),
  );

let w = 0;
for (const part of chunk(works, 500)) {
  const r = await fetch(`${url}/rest/v1/work_experiences`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n경력 적재 실패", r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  w += part.length;
  process.stdout.write(`\r  경력 ${w}/${works.length}`);
}
console.log(`\n✅ 경력 적재: ${w}건 (경력이 이미 있는 이력서는 건드리지 않음 — 전체 ${existing.size}건)`);
