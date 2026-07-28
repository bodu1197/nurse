/**
 * 구 널스넷 이력서의 **직종**(person_item.job_category)을 resumes.job_categories 로 옮긴다. 1회성.
 *
 * 처음 이력서를 옮길 때 직종을 빠뜨렸다(근무부서=specialties 만 담았다). 그래서 인재 검색에
 * 직종 필터를 붙일 수가 없었다.
 *
 * 원본 형식은 `CATE_02|@|CATE_02_CATEC_01` 처럼 `|@|` 로 이어붙인 코드다(import-legacy-resumes.ts 의 SEP 과 같다).
 *   · `CATE_xx`            = 대분류(간호직·간호조무직·…)  ← 이것만 쓴다
 *   · `CATE_xx_CATEC_yy`   = 중분류(간호사(병동)·수술실보조·…) — 필터가 8개 대분류면 충분하다
 *
 * ⚠️ 데이터에는 CATE_08~CATE_28 도 섞여 있는데(각 100~155건), **레거시 소스 어디에도 이름이 없다**
 *    (modules/bhjob/lang/ko.php 에 없음 — 옛 코드표의 잔재로 보인다). 이름을 모르면 화면에 못 쓰므로
 *    무시한다. 그 이력서는 직종이 빈 채로 남고 "직종 전체"에서는 계속 보인다.
 *
 * 🔴 현재 **존재하는** 이력서만 갱신한다. upsert(merge-duplicates)는 없는 행을 새로 만들기 때문에,
 *    이 목록으로 거르지 않으면 앞서 지운 비간호 직군 308건이 직종만 든 빈 이력서로 되살아난다.
 *
 * 실행:  node scripts/import-legacy-job-categories.ts          (미리보기)
 *        node scripts/import-legacy-job-categories.ts --apply  (실제 반영)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, loadLegacyProfileMap, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

// import-legacy-resumes.ts 의 COL 과 **같은 순서**. 이름으로 찾아 인덱스 착오를 막는다.
const RESUME_COL_NAMES = [
  "person_srl", "member_srl", "user_name", "phone_number", "email_address",
  "job_category", "job_department", "job_type", "person_experience_type",
  "person_education_type", "area1", "area2", "area1_2", "area2_2",
  "base_salary_unit", "base_salary_value", "base_salary_value_min", "base_salary_value_max",
  "qualifications", "title", "content", "person_experience_detail", "reg",
] as const;
const I_MEMBER = RESUME_COL_NAMES.indexOf("member_srl");
const I_CATEGORY = RESUME_COL_NAMES.indexOf("job_category");

/** CATE 대분류 코드 → 화면 문구. lib/resumeOptions.ts 의 JOB_CATEGORIES 와 같아야 한다. */
const CATE: Readonly<Record<string, string>> = {
  CATE_01: "간호직",
  CATE_02: "간호조무직",
  CATE_03: "사무·원무·코디",
  CATE_04: "피부관리직",
  CATE_05: "의료기사직",
  CATE_06: "의사직",
  CATE_07: "약무직",
  CATE_99: "의료기타",
};

/** `CATE_02|@|CATE_02_CATEC_01` → ["간호조무직"] (대분류만, 중복 제거, 원본 순서 유지) */
const SEP = "|@|";
function categoriesOf(raw: string): string[] {
  const seen = new Set<string>();
  for (const code of raw.split(SEP)) {
    const name = CATE[code.trim()];
    if (name) seen.add(name);
  }
  return [...seen];
}

const rows = ["resumes_legacy_1.json", "resumes_legacy_2.json"]
  .flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { rows: string[][] }).rows);

const byLegacy = await loadLegacyProfileMap(url, H);
const alive = new Set(
  (await fetchAllPages<{ profile_id: string }>(url, H, "resumes", "select=profile_id", "profile_id"))
    .map((x) => x.profile_id),
);
console.log(`현재 이력서: ${alive.size}건 — 이 안에 있는 것만 갱신한다`);

const updates: { profile_id: string; job_categories: string[] }[] = [];
for (const cells of rows) {
  const d = cells.slice(cells.length - RESUME_COL_NAMES.length);
  const pid = byLegacy.get((d[I_MEMBER] ?? "").trim());
  if (!pid || !alive.has(pid)) continue;
  const cats = categoriesOf(d[I_CATEGORY] ?? "");
  if (cats.length === 0) continue; // 직종을 안 고른 이력서는 건드리지 않는다(기본값 {} 유지)
  updates.push({ profile_id: pid, job_categories: cats });
}

const tally: Record<string, number> = {};
for (const u of updates) for (const c of u.job_categories) tally[c] = (tally[c] ?? 0) + 1;
console.log(`직종이 있는 이력서 ${updates.length}건`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);

if (!APPLY) {
  console.log("\n미리보기만 했습니다. 반영하려면 --apply 를 붙이세요.");
  process.exit(0);
}

let n = 0;
for (const part of chunk(updates, 500)) {
  const r = await fetch(`${url}/rest/v1/resumes?on_conflict=profile_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n직종 반영 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  n += part.length;
  process.stdout.write(`\r  직종 ${n}/${updates.length}`);
}
console.log(`\n✅ 직종 ${n}건`);
