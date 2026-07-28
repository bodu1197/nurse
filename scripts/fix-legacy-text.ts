/**
 * 이관한 본문(이력서 자기소개 · 공고 상세)의 줄바꿈을 다시 계산해 덮어쓴다. 1회성.
 *
 * 처음 이관 때 쓴 htmlToText 가 `<p>A</p>\n\n<p>B</p>` 의 **태그 사이 소스 개행**을 지우지 않아
 * 한 줄마다 빈 줄이 하나씩 끼었다(자기소개 10줄 → 빈 줄 10개). 화면에서 한 줄 읽고 스크롤해야 했다.
 * 고친 htmlToText(_legacy-util)로 원본 HTML 에서 다시 뽑아 넣는다.
 *
 * 실행:  node scripts/fix-legacy-text.ts          (미리보기)
 *        node scripts/fix-legacy-text.ts --apply  (실제 반영)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, loadLegacyProfileMap, htmlToText, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

// ── 이력서 자기소개 ──────────────────────────────────────
// import-legacy-resumes.ts 의 COL 과 **같은 순서**. 이름으로 찾아 인덱스 착오를 막는다.
const RESUME_COL_NAMES = [
  "person_srl", "member_srl", "user_name", "phone_number", "email_address",
  "job_category", "job_department", "job_type", "person_experience_type",
  "person_education_type", "area1", "area2", "area1_2", "area2_2",
  "base_salary_unit", "base_salary_value", "base_salary_value_min", "base_salary_value_max",
  "qualifications", "title", "content", "person_experience_detail", "reg",
] as const;
const RESUME_COL = {
  member: RESUME_COL_NAMES.indexOf("member_srl"),
  content: RESUME_COL_NAMES.indexOf("content"),
};
const resumeRows = ["resumes_legacy_1.json", "resumes_legacy_2.json"]
  .flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { rows: string[][] }).rows);

const byLegacy = await loadLegacyProfileMap(url, H);

// 🔴 현재 **존재하는** 이력서만 갱신한다. upsert(merge-duplicates)는 없는 행을 새로 만들기 때문에,
//    이 목록으로 거르지 않으면 앞서 지운 비간호 직군 308건이 intro 만 든 빈 이력서로 되살아난다.
const alive = new Set(
  (await fetchAllPages<{ profile_id: string }>(url, H, "resumes", "select=profile_id", "profile_id"))
    .map((x) => x.profile_id),
);
console.log(`현재 이력서: ${alive.size}건 — 이 안에 있는 것만 갱신한다`);

const introUpdates: { profile_id: string; intro: string | null }[] = [];
for (const cells of resumeRows) {
  const d = cells.slice(cells.length - RESUME_COL_NAMES.length);
  const pid = byLegacy.get((d[RESUME_COL.member] ?? "").trim());
  if (!pid || !alive.has(pid)) continue;
  const intro = htmlToText(d[RESUME_COL.content] ?? "");
  introUpdates.push({ profile_id: pid, intro: intro || null });
}

// ── 공고 상세 ────────────────────────────────────────────
// 🔴 인덱스를 눈대중으로 세지 말 것. import-legacy-jobs.ts 의 COL 배열과 **같은 순서**를 여기 적어두고
//    이름으로 찾는다. 처음에 content 를 20(= job_close_type)으로 잘못 짚어 공고 43건의 본문이
//    'ALLWAYS' 같은 코드값으로 덮였다. 숫자를 직접 쓰면 같은 실수가 반복된다.
const JOB_COL = [
  "job_srl", "member_srl", "title", "nick_name", "user_name", "email_address",
  "job_type", "job_experience_type", "job_department", "job_category", "job_category_detail",
  "area1", "area2", "area3", "address", "address_detail",
  "base_salary_unit", "base_salary_value", "base_salary_value_min", "base_salary_value_max",
  "job_close_type", "job_end_date", "job_time", "job_day_off", "benefits",
  "apply_method", "apply_documents", "manager_name", "manager_phone_number",
  "regdate", "content",
] as const;
const JOB_SRL = JOB_COL.indexOf("job_srl");
const JOB_CONTENT = JOB_COL.indexOf("content");

const jobRows = (JSON.parse(readFileSync("scripts/legacy-data/jobs43_full.json", "utf8")) as { rows: string[][] }).rows;
const descUpdates = jobRows.map((cells) => {
  const d = cells.slice(cells.length - JOB_COL.length);
  return { external_id: (d[JOB_SRL] ?? "").trim(), description: htmlToText(d[JOB_CONTENT] ?? "") || null };
});

const before = resumeRows.find((c) => (c[c.length - RESUME_COL_NAMES.length + RESUME_COL.content] ?? "").includes("30년넘게"));
console.log(`이력서 자기소개: ${introUpdates.length}건 / 공고 상세: ${descUpdates.length}건`);
if (before) {
  const raw = before[before.length - RESUME_COL_NAMES.length + RESUME_COL.content];
  console.log("\n── 변환 비교(빈 줄이 사라지는지) ──");
  console.log("고친 뒤:", JSON.stringify(htmlToText(raw).slice(0, 90)));
}

if (!APPLY) {
  console.log("\n미리보기만 했습니다. 반영하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// resumes: profile_id 가 PK 라 upsert. intro 만 담아 다른 컬럼은 건드리지 않는다.
let n = 0;
for (const part of chunk(introUpdates, 500)) {
  const r = await fetch(`${url}/rest/v1/resumes?on_conflict=profile_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n자기소개 반영 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  n += part.length;
  process.stdout.write(`\r  자기소개 ${n}/${introUpdates.length}`);
}
console.log(`\n✅ 자기소개: ${n}건`);

// jobs: external_id 로 하나씩 갱신(PK 가 uuid 라 upsert 로는 못 짚는다).
let m = 0;
for (const d of descUpdates) {
  const r = await fetch(`${url}/rest/v1/jobs?source=eq.partner&external_id=eq.${encodeURIComponent(d.external_id)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ description: d.description }),
  });
  if (!r.ok) { console.error("\n공고 상세 반영 실패", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  m += 1;
  process.stdout.write(`\r  공고 상세 ${m}/${descUpdates.length}`);
}
console.log(`\n✅ 공고 상세: ${m}건`);
