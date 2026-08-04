/**
 * 구 널스넷 구인광고 **전부**를 새 jobs 로 옮긴다. 1회성 스크립트.
 *
 * 앞선 이관(import-legacy-jobs.ts)은 2026-05-01 이후 진행중 43건만 가져왔다. 나머지 1,400건은
 * 옛 사이트에 남아 있던 광고인데 새 사이트에는 없어서, 그 병원이 로그인해도 자기 이력이 텅 비었다.
 *
 * 🔴 게시하지 않는다(오너 확정 2026-08-04): status='closed' 로 넣는다.
 *    데이터는 살리되 구직자 목록에는 안 뜬다 — 2024~2025년 광고를 지금 다시 노출하면
 *    이미 채용이 끝난 자리에 지원이 몰린다. 병원은 자기 마이페이지에서 마감 상태로 본다.
 *
 * 🔴 병원 레코드를 만들어 연결한다. 안 하면 hospital_id 가 null 이라
 *    getMyJobs(hospitals.owner_profile_id 기준)가 못 찾아 **로그인해도 자기 공고가 안 보인다.**
 *    이 병원은 source='partner' 로 표시해 심평원 명부(source='public_data')와 섞이지 않게 한다.
 *
 * 실행:  node scripts/import-legacy-all-jobs.ts           (미리보기)
 *        node scripts/import-legacy-all-jobs.ts --apply   (실제 적재)
 */
import { readFileSync } from "node:fs";
import { regionOfLocation } from "../src/lib/jobRegion.ts";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

type LegacyJob = Record<string, string>;
const jobs: LegacyJob[] = JSON.parse(readFileSync("/tmp/miss_jobs.json", "utf8"));
const codes: Record<string, string> = JSON.parse(readFileSync("scripts/legacy-data/bhjob_codes.json", "utf8"));
const SEP = "|@|";

const nz = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" || t === "NULL" ? null : t;
};
const label = (v: string | undefined) => (nz(v) ? (codes[v!.trim()] ?? v!.trim()) : null);
const many = (v: string | undefined) =>
  (nz(v) ?? "").split(SEP).map((x) => codes[x.trim()] ?? x.trim()).filter(Boolean);

/** 라이믹스 datetime(YYYYMMDDHHmmss 또는 ISO) → ISO. 못 읽으면 null. */
function toIso(v: string | undefined): string | null {
  const t = nz(v); if (!t) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}+09:00`;
  const d = new Date(t.replace(" ", "T") + (t.includes("+") ? "" : "+09:00"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── 회원 → 프로필 ─────────────────────────────────────────
async function profileBySrl(): Promise<Map<string, { id: string; claimed: string | null }>> {
  const map = new Map<string, { id: string; claimed: string | null }>();
  for (let page = 0; ; page++) {
    const res = await fetch(
      `${url}/rest/v1/profiles?select=id,legacy_member_srl,claimed_hospital_id&legacy_member_srl=not.is.null&limit=1000&offset=${page * 1000}`,
      { headers: H },
    );
    const rows = (await res.json()) as { id: string; legacy_member_srl: number; claimed_hospital_id: string | null }[];
    if (!rows.length) break;
    for (const r of rows) map.set(String(r.legacy_member_srl), { id: r.id, claimed: r.claimed_hospital_id });
  }
  return map;
}

const profiles = await profileBySrl();

// 공고를 낸 회원별로 묶는다 — 병원 레코드는 회원당 하나면 된다.
const byMember = new Map<string, LegacyJob[]>();
for (const j of jobs) {
  const srl = String(j.member_srl ?? "").trim();
  if (!srl) continue;
  (byMember.get(srl) ?? byMember.set(srl, []).get(srl)!).push(j);
}

const withAccount = [...byMember.keys()].filter((s) => profiles.has(s));
console.log(`빠진 공고 ${jobs.length}건 · 게시자 ${byMember.size}명`);
console.log(`  계정 있음 ${withAccount.length}명 / 없음 ${byMember.size - withAccount.length}명`);
console.log(`  → 계정 없는 게시자의 공고는 병원 연결 없이(company_name 만) 넣는다`);

if (!APPLY) {
  const sample = jobs.slice(0, 3).map((j) => ({
    title: nz(j.title), company: nz(j.nick_name), member: j.member_srl,
    regdate: toIso(j.regdate), status: j.status, current: j.current_status,
  }));
  console.log("\n예시:", JSON.stringify(sample, null, 1));
  console.log("\n미리보기입니다. 실제로 넣으려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── ① 병원 레코드 ─────────────────────────────────────────
const hospitalOf = new Map<string, string>(); // member_srl → hospital id
let madeHospitals = 0;
for (const srl of withAccount) {
  const prof = profiles.get(srl)!;
  const first = byMember.get(srl)![0];
  const name = nz(first.nick_name) ?? nz(first.user_name) ?? "이름 미상";

  if (prof.claimed) { hospitalOf.set(srl, prof.claimed); continue; }

  // 이미 이 사람 소유의 병원이 있으면 그걸 쓴다(재실행해도 안 늘어난다).
  const exist = await fetch(`${url}/rest/v1/hospitals?select=id&owner_profile_id=eq.${prof.id}&limit=1`, { headers: H });
  const [own] = (await exist.json()) as { id: string }[];
  if (own) { hospitalOf.set(srl, own.id); continue; }

  const res = await fetch(`${url}/rest/v1/hospitals`, {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      // hospitals_source_check 가 허용하는 값만 쓴다 — 'legacy' 는 없다.
      // 'partner' = 구 널스넷에서 온 것(심평원 명부 public_data 와 구분된다).
      name, source: "partner", is_claimed: true, owner_profile_id: prof.id,
      address: nz(first.address), region: regionOfLocation(nz(first.address) ?? "")?.sido ?? null,
    }),
  });
  if (!res.ok) { console.error(`병원 생성 실패 ${srl}: ${(await res.text()).slice(0, 120)}`); continue; }
  const [h] = (await res.json()) as { id: string }[];
  hospitalOf.set(srl, h.id);
  madeHospitals++;
  await fetch(`${url}/rest/v1/profiles?id=eq.${prof.id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ claimed_hospital_id: h.id }),
  });
}
console.log(`병원 레코드 생성 ${madeHospitals}개`);

// ── ② 공고 ────────────────────────────────────────────────
const rows = jobs.map((j) => {
  const srl = String(j.member_srl ?? "").trim();
  const addr = nz(j.address);
  const region = regionOfLocation(addr ?? "");
  return {
    source: "partner",
    external_id: String(j.job_srl),
    // 🔴 게시하지 않는다 — 옛 광고를 지금 노출하면 끝난 채용에 지원이 몰린다.
    status: "closed",
    title: nz(j.title) ?? "(제목 없음)",
    company_name: nz(j.nick_name) ?? nz(j.user_name),
    hospital_id: hospitalOf.get(srl) ?? null,
    description: nz(j.content),
    location: addr,
    sido: region?.sido ?? null,
    sigungu: region?.sigungu ?? null,
    employment_type: label(j.job_type),
    shift_type: label(j.job_time),
    benefits: many(j.benefits),
    apply_email: nz(j.email_address),
    manager_name: nz(j.manager_name),
    manager_phone: nz(j.manager_phone_number),
    apply_method: "platform",
    apply_methods: ["platform"],
    posted_at: toIso(j.regdate) ?? new Date().toISOString(),
    deadline: nz(j.job_end_date)?.slice(0, 10) ?? null,
  };
});

let ok = 0; const errs: string[] = [];
for (let i = 0; i < rows.length; i += 200) {
  const part = rows.slice(i, i + 200);
  const res = await fetch(`${url}/rest/v1/jobs?on_conflict=source,external_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!res.ok) errs.push(`${i}: ${(await res.text()).slice(0, 200)}`);
  else ok += part.length;
  console.log(`  ${Math.min(i + 200, rows.length)}/${rows.length}`);
}
console.log(`\n공고 적재 ${ok}건 / 실패 배치 ${errs.length}`);
for (const e of errs.slice(0, 5)) console.log("  ✗", e);
