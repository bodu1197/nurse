/**
 * 구 널스넷 인재 사진 → Supabase Storage(avatars) + profiles.avatar_url. 1회성 스크립트.
 *
 * 원본 이미지는 nursenet.co.kr/files/attach/... 에 있고 **사이트를 교체하면 사라진다.**
 * URL 만 옮기면 전부 깨진 이미지가 되므로, 파일을 내려받아 우리 스토리지로 복사한다.
 *
 * 원본 연결고리: wp_bhjob_person_item.photos → wp_files.upload_target_srl (file_srl 이 아니다).
 * 한 사람이 여러 장 올렸으면 가장 최근 파일 하나만 쓴다.
 *
 * 실행:  node scripts/import-legacy-avatars.ts          (미리보기)
 *        node scripts/import-legacy-avatars.ts --apply  (실제 복사)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, loadLegacyProfileMap } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const SRC = "talent_avatar_files.json";
const BUCKET = "avatars";
const ORIGIN = "https://nursenet.co.kr";
const CONCURRENCY = 6; // 옛 서버가 아직 운영 중이라 과하게 두드리지 않는다

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);
// 위 가드로 존재가 확정됐지만 클로저 안에서는 좁혀진 타입이 유지되지 않는다 → 여기서 붙잡는다.
const SUPA_URL = url;
const SUPA_KEY = key;

// [member_srl, file_srl, uploaded_filename, mime_type, file_size]
const raw = (JSON.parse(readFileSync(SRC, "utf8")) as { rows: string[][] }).rows;

const byLegacy = await loadLegacyProfileMap(url, H);
console.log(`profiles(legacy 보유): ${byLegacy.size}명`);

type Job = { profileId: string; src: string; ext: string; mime: string };
const jobs: Job[] = [];
const unmatched: string[] = [];

for (const [memberSrl, , path, mime] of raw) {
  const profileId = byLegacy.get(memberSrl.trim());
  if (!profileId) { unmatched.push(memberSrl); continue; }
  // './files/attach/...' → 'https://nursenet.co.kr/files/attach/...'
  const rel = path.replace(/^\.?\//, "");
  const ext = mime === "image/png" ? "png" : "jpg";
  jobs.push({ profileId, src: `${ORIGIN}/${rel}`, ext, mime });
}

console.log(`복사 대상: ${jobs.length}장 (profiles 미매칭 ${unmatched.length}건 제외)`);

if (!APPLY) {
  console.log("\n── 미리보기 3건 ──");
  for (const j of jobs.slice(0, 3)) console.log({ ...j, profileId: j.profileId.slice(0, 8) + "…" });
  console.log("\n미리보기만 했습니다. 복사하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 다운로드 → 업로드 ────────────────────────────────────
const done: Job[] = [];          // 실제로 올라간 것만 — 이것만 avatar_url 로 연결한다
const failures: string[] = [];

/** 성공하면 그 Job 을, 실패하면 null. 실패한 사람은 avatar_url 을 비워 둬야 깨진 이미지가 안 뜬다. */
async function copyOne(j: Job): Promise<Job | null> {
  try {
    const res = await fetch(j.src, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) { failures.push(`${j.src} → HTTP ${res.status}`); return null; }
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) { failures.push(`${j.src} → 빈 파일`); return null; }

    // 경로는 profile_id 하나로 정한다 — 재실행해도 같은 자리에 덮어써서 중복이 안 쌓인다(x-upsert).
    const objectPath = `${j.profileId}.${j.ext}`;
    const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": j.mime, "x-upsert": "true" },
      body: buf,
    });
    if (!up.ok) { failures.push(`${objectPath} 업로드 ${up.status} ${(await up.text()).slice(0, 80)}`); return null; }
    return j;
  } catch (e) {
    failures.push(`${j.src} → ${String(e).slice(0, 60)}`);
    return null;
  }
}

// 동시 실행 수를 고정해 옛 서버와 우리 스토리지 양쪽에 부담을 주지 않는다.
let seen = 0;
for (const group of chunk(jobs, CONCURRENCY)) {
  const results = await Promise.all(group.map(copyOne));
  for (const r of results) if (r) done.push(r);
  seen += group.length;
  process.stdout.write(`\r  복사 ${seen}/${jobs.length} (성공 ${done.length} / 실패 ${failures.length})`);
}
console.log();

// ── profiles.avatar_url 반영 ─────────────────────────────
const updates = done.map((j) => ({
  id: j.profileId,
  avatar_url: `${url}/storage/v1/object/public/${BUCKET}/${j.profileId}.${j.ext}`,
}));

let linked = 0;
for (const part of chunk(updates, 500)) {
  const r = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\navatar_url 반영 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  linked += part.length;
  process.stdout.write(`\r  avatar_url ${linked}/${updates.length}`);
}

console.log(`\n✅ 사진 복사: 성공 ${done.length} / 실패 ${failures.length} · avatar_url 연결 ${linked}명`);
if (failures.length) {
  console.log("   실패 예시(최대 5건):");
  for (const f of failures.slice(0, 5)) console.log("    -", f);
}
