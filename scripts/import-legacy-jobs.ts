/**
 * 구 널스넷(라이믹스 bhjob) 구인광고 → 새 jobs 테이블 이관. 1회성 스크립트.
 *
 * 대상: 2026-05-01 이후 등록 + current_status=PROGRESS + status=PUBLIC (43건)
 *  - 그 이전 공고는 78%가 2024~2025년 등록인데 마감일이 없어 시스템상 '진행중'으로 남아있을 뿐이라 제외.
 *
 * source='partner' 를 쓴다 — 'direct' 는 posted_at+7일에 자동 만료(FREE_LISTING_MS)라
 * 과거 날짜로 넣는 순간 전부 사라진다. 워크넷과 같이 hospital_id=null + company_name 텍스트.
 *
 * 실행:  node scripts/import-legacy-jobs.ts          (미리보기)
 *        node scripts/import-legacy-jobs.ts --apply  (실제 적재)
 */
import { readFileSync } from "node:fs";

import { regionOfLocation } from "../src/lib/jobRegion.ts";

const SRC = "scripts/legacy-data/jobs43_full.json";
const COMPANY = "scripts/legacy-data/jobs43_company.json"; // member_srl → 업체명(회원 추가정보). nick_name 은 닉네임이라 병원명이 아니다.
const CODES = "scripts/legacy-data/bhjob_codes.json";
const SEP = "|@|";
const APPLY = process.argv.includes("--apply");

const codes: Record<string, string> = JSON.parse(readFileSync(CODES, "utf8"));
const raw = JSON.parse(readFileSync(SRC, "utf8")) as { rows: string[][] };

// [job_srl, member_srl, company_name, biz_no, scale, tel, addr]
const companyOf = new Map<string, string>();
for (const c of (JSON.parse(readFileSync(COMPANY, "utf8")) as { rows: string[][] }).rows) {
  const [, memberSrl, name] = c.slice(-7);
  if (memberSrl && name && name !== "NULL") companyOf.set(memberSrl.trim(), name.trim());
}

// 표 앞 4칸은 체크박스·수정·복사·삭제. 실제 컬럼은 SELECT 순서와 같다.
const COL = [
  "job_srl", "member_srl", "title", "nick_name", "user_name", "email_address",
  "job_type", "job_experience_type", "job_department", "job_category", "job_category_detail",
  "area1", "area2", "area3", "address", "address_detail",
  "base_salary_unit", "base_salary_value", "base_salary_value_min", "base_salary_value_max",
  "job_close_type", "job_end_date", "job_time", "job_day_off", "benefits",
  "apply_method", "apply_documents", "manager_name", "manager_phone_number",
  "regdate", "content",
] as const;

type Row = Record<(typeof COL)[number], string>;

const nz = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" || t === "NULL" ? null : t;
};

/** 라이믹스 본문 HTML → 평문. 새 앱은 description 을 whitespace-pre-line 으로 그대로 렌더한다. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const label = (code: string) => codes[code] ?? code;
const labels = (v: string | null) => (v ? v.split(SEP).map((c) => label(c.trim())).filter(Boolean) : []);

/** 구 진료과(28종) → 새 앱 필터칩(JOB_SPECIALTIES). 대응 없으면 원래 진료과명을 그대로 둔다(표시는 정상). */
const SPECIALTY_MAP: Record<string, string> = {
  중환자실: "중환자실", 응급실: "응급실", 수술실: "수술실",
  "마취과/회복실": "마취과", 인공신장실: "투석실", 정신건강의학과: "정신과",
};

function specialtyOf(r: Row): string | null {
  const depa = labels(nz(r.job_department));
  for (const d of depa) if (SPECIALTY_MAP[d]) return SPECIALTY_MAP[d];
  const cate = labels(nz(r.job_category));
  if (cate.some((c) => c.includes("병동"))) return "병동";
  if (cate.some((c) => c.includes("외래"))) return "외래";
  return depa.find((d) => d && d !== "부서무관") ?? null;
}

const EMP: Record<string, string> = {
  FULL_TIME: "정규직", CONTRACTOR: "계약직", PART_TIME: "파트타임", INTERN: "인턴",
};

function employmentOf(r: Row): string | null {
  const first = (nz(r.job_type) ?? "").split(SEP)[0]?.trim();
  return first ? (EMP[first] ?? null) : null;
}

const UNIT: Record<string, string> = { YEAR: "연봉", MONTH: "월급", WEEK: "주급", DAY: "일급", HOUR: "시급" };
const man = (n: number) => (n % 10000 === 0 ? `${n / 10000}만원` : n.toLocaleString("ko-KR") + "원");

function salaryOf(r: Row): string | null {
  const unit = UNIT[nz(r.base_salary_unit) ?? ""];
  if (!unit) return null; // DISCUSSION 등 → 화면이 '급여 협의'로 표시
  const min = Number(r.base_salary_value_min) || 0;
  const max = Number(r.base_salary_value_max) || 0;
  const val = Number(r.base_salary_value) || 0;
  if (min && max && min !== max) return `${unit} ${man(min)} ~ ${man(max)}`;
  const one = val || min || max;
  return one ? `${unit} ${man(one)}` : null;
}

function shiftOf(r: Row): string | null {
  const parts = (nz(r.job_time) ?? "").split(SEP).map((s) => s.trim()).filter(Boolean);
  const times = parts.filter((p) => /^\d{1,2}:\d{2}$/.test(p));
  const rest = parts.filter((p) => !/^\d{1,2}:\d{2}$/.test(p)).map(label);
  const t = times.length >= 2 ? `${times[0]} ~ ${times[1]}` : times[0] ?? "";
  const off = nz(r.job_day_off);
  return [t, rest.join(" "), off ? `휴무: ${off}` : ""].filter(Boolean).join(" · ") || null;
}

/** job_category_detail JSON 의 people 합 = 모집인원 */
function recruitOf(r: Row): number | null {
  try {
    const j = JSON.parse(nz(r.job_category_detail) ?? "{}") as Record<string, { people?: string }>;
    const n = Object.values(j).reduce((a, v) => a + (Number(v?.people) || 0), 0);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

function applyDetailOf(r: Row): string | null {
  const lines = [
    nz(r.job_experience_type) && `경력: ${nz(r.job_experience_type)}`,
    labels(nz(r.apply_documents)).length && `제출서류: ${labels(nz(r.apply_documents)).join(", ")}`,
    labels(nz(r.apply_method)).length && `접수방법: ${labels(nz(r.apply_method)).join(", ")}`,
    labels(nz(r.job_category)).length && `모집직종: ${labels(nz(r.job_category)).join(", ")}`,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

const rows: Row[] = raw.rows.map((cells) => {
  const data = cells.slice(cells.length - COL.length); // 앞쪽 조작 칸 제거
  return Object.fromEntries(COL.map((c, i) => [c, data[i] ?? ""])) as Row;
});

const jobs = rows.map((r) => {
  const location = [nz(r.area1), nz(r.area2), nz(r.area3)].filter(Boolean).join(" ") || null;
  const { sido, sigungu } = regionOfLocation(location);
  const desc = htmlToText(r.content);
  return {
    hospital_id: null,
    // 병원명은 회원 추가정보(업체명)가 정본. 없는 회원(2건)만 닉네임으로 폴백한다.
    company_name: companyOf.get((nz(r.member_srl) ?? "").trim()) ?? nz(r.nick_name) ?? nz(r.user_name),
    title: nz(r.title) ?? "(제목 없음)",
    specialty: specialtyOf(r),
    location,
    sido,
    sigungu,
    employment_type: employmentOf(r),
    salary_text: salaryOf(r),
    benefits: labels(nz(r.benefits)),
    description: desc || null,
    source: "partner",
    external_id: nz(r.job_srl),
    external_url: null, // 옛 사이트는 곧 교체되므로 링크를 남기지 않는다
    status: "open",
    is_featured: false,
    posted_at: new Date((nz(r.regdate) ?? "").replace(" ", "T") + "+09:00").toISOString(),
    deadline: nz(r.job_end_date)?.slice(0, 10) ?? null,
    recruit_count: recruitOf(r),
    shift_type: shiftOf(r),
    manager_name: nz(r.manager_name),
    manager_phone: nz(r.manager_phone_number),
    apply_method: "platform",
    apply_methods: ["platform"],
    apply_email: nz(r.email_address),
    apply_detail: applyDetailOf(r),
  };
});

// ── 검증 ────────────────────────────────────────────────
// blocking: 이게 없으면 공고가 공고 구실을 못 한다. notes: 알고만 있으면 되는 것.
const blocking: string[] = [];
const notes: string[] = [];
for (const j of jobs) {
  if (!j.title || j.title === "(제목 없음)") blocking.push(`제목 없음: ${j.external_id}`);
  if (!j.company_name) blocking.push(`병원명 없음: ${j.external_id}`);
  if (Number.isNaN(Date.parse(j.posted_at))) blocking.push(`등록일 파싱 실패: ${j.external_id}`);
  if (!j.sido) notes.push(`지역 미승격(location 원문은 유지): ${j.external_id} (${j.location})`);
  // 원문이 이미지뿐인 공고 — 그 이미지는 구 서버에 있어 사이트 교체 시 죽는다. 병원이 다시 써야 한다.
  if (!j.description) notes.push(`본문 없음(원문이 이미지뿐): ${j.external_id} — ${j.company_name}`);
}

console.log(`대상 ${jobs.length}건 / 치명 ${blocking.length}건 / 참고 ${notes.length}건`);
blocking.forEach((p) => console.log("  ⛔", p));
notes.forEach((p) => console.log("  ℹ", p));

console.log("\n── 미리보기 3건 ──");
for (const j of jobs.slice(0, 3)) {
  console.log({ ...j, description: j.description?.slice(0, 90) + " …" });
}

const counts = (key: keyof (typeof jobs)[0]) =>
  jobs.reduce<Record<string, number>>((a, j) => {
    const k = String(j[key] ?? "(없음)");
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
console.log("\n지역:", counts("sido"));
console.log("고용형태:", counts("employment_type"));
console.log("진료과:", counts("specialty"));
console.log("마감일 있음:", jobs.filter((j) => j.deadline).length);

if (blocking.length) {
  console.error("\n치명적 문제가 있어 적재하지 않습니다.");
  process.exit(1);
}
if (!APPLY) {
  console.log("\n미리보기만 했습니다. 적재하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 적재 ────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");

// (source, external_id) 부분 unique 인덱스가 있어 재실행해도 중복이 안 쌓인다.
const res = await fetch(`${url}/rest/v1/jobs?on_conflict=source,external_id`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(jobs),
});
if (!res.ok) {
  console.error("적재 실패", res.status, await res.text());
  process.exit(1);
}
const saved = (await res.json()) as unknown[];
console.log(`\n✅ 적재 완료: ${saved.length}건`);
