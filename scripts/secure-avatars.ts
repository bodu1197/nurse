/**
 * 인재 사진을 공개 버킷 → **비공개 + 서명 URL** 로 전환한다. 1회성.
 *
 * 왜: 처음에 avatars 버킷을 공개로 만들고 파일명을 `{profile_id}.jpg` 로 지었다.
 *     그런데 profile_id 는 목록 HTML 에 그대로 실린다(`href="/talent/{profile_id}"`).
 *     즉 누구나 목록에서 id 를 긁어 `/object/public/avatars/{id}.jpg` 를 조합하면
 *     1인당 두 번(.jpg/.png) 시도로 얼굴 사진을 전부 가져갈 수 있었다.
 *     "사진은 광고 병원만" 이라는 게이트가 완전히 우회됐다.
 *
 * 하는 일:
 *   1) 오브젝트 키를 추측 불가한 난수로 옮긴다(이미 밖으로 나갔을 수 있는 기존 경로를 폐기).
 *   2) profiles.avatar_url 에 **전체 URL 이 아니라 오브젝트 경로**만 저장한다(서명은 조회 시점에).
 *   3) 버킷을 비공개로 바꾼다 → 경로를 알아도 서명 없이는 못 연다.
 *
 * 실행:  node scripts/secure-avatars.ts          (미리보기)
 *        node scripts/secure-avatars.ts --apply  (실제 전환)
 */
import { randomUUID } from "node:crypto";
import { chunk, restHeaders, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const BUCKET = "avatars";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

type Row = { id: string; avatar_url: string | null };
const rows = await fetchAllPages<Row>(url, H, "profiles", "select=id,avatar_url&avatar_url=not.is.null", "id");
console.log(`avatar_url 보유: ${rows.length}명`);

/** 저장된 값에서 오브젝트 경로만 뽑는다. 전체 URL 이면 잘라내고, 이미 경로면 그대로. */
function objectPathOf(v: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = v.indexOf(marker);
  if (i >= 0) return v.slice(i + marker.length);
  return v.includes("://") ? null : v; // 다른 도메인(네이버 프로필 등)은 우리 버킷이 아니다
}

const targets = rows
  .map((r) => ({ id: r.id, from: objectPathOf(r.avatar_url ?? "") }))
  .filter((x): x is { id: string; from: string } => !!x.from)
  // 이미 난수 키로 옮긴 건 건너뛴다(재실행 안전). 기존 키는 반드시 profile_id 로 시작한다.
  .filter((x) => x.from.startsWith(x.id))
  .map((x) => {
    const ext = x.from.split(".").pop() ?? "jpg";
    return { ...x, to: `${randomUUID()}.${ext}` };
  });

const external = rows.length - targets.length;
console.log(`난수 키로 옮길 대상: ${targets.length}건 (이미 처리됐거나 외부 URL: ${external}건)`);

if (!APPLY) {
  console.log("\n── 미리보기 2건 ──");
  for (const t of targets.slice(0, 2)) console.log(`  ${t.from}  →  ${t.to}`);
  console.log("\n미리보기만 했습니다. 전환하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 1) 오브젝트 이동 ─────────────────────────────────────
const moved: { id: string; path: string }[] = [];
const failures: string[] = [];
let seen = 0;
for (const group of chunk(targets, 8)) {
  const results = await Promise.all(
    group.map(async (t) => {
      const r = await fetch(`${url}/storage/v1/object/move`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ bucketId: BUCKET, sourceKey: t.from, destinationKey: t.to }),
      });
      if (!r.ok) { failures.push(`${t.from} → ${r.status} ${(await r.text()).slice(0, 60)}`); return null; }
      return { id: t.id, path: t.to };
    }),
  );
  for (const r of results) if (r) moved.push(r);
  seen += group.length;
  process.stdout.write(`\r  이동 ${seen}/${targets.length} (성공 ${moved.length} / 실패 ${failures.length})`);
}
console.log();

// ── 2) avatar_url = 오브젝트 경로 ────────────────────────
// 전체 URL 을 저장해두면 버킷을 비공개로 바꾸는 순간 전부 죽은 링크가 된다.
// 경로만 두고 조회 시점에 서명한다(revealContacts).
let linked = 0;
for (const part of chunk(moved, 500)) {
  const r = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part.map((m) => ({ id: m.id, avatar_url: m.path }))),
  });
  if (!r.ok) { console.error("\n경로 반영 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  linked += part.length;
  process.stdout.write(`\r  경로 반영 ${linked}/${moved.length}`);
}
console.log();

// ── 3) 버킷 비공개 ───────────────────────────────────────
const b = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    id: BUCKET, name: BUCKET, public: false,
    file_size_limit: 2097152, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
  }),
});
console.log(b.ok ? "✅ 버킷 비공개 전환" : `❌ 버킷 전환 실패 ${b.status} ${(await b.text()).slice(0, 200)}`);

console.log(`\n✅ 이동 ${moved.length}건 · 경로 반영 ${linked}건 · 실패 ${failures.length}건`);
for (const f of failures.slice(0, 5)) console.log("   -", f);
