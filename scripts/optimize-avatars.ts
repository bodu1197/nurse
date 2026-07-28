/**
 * 인재 사진을 화면에 필요한 크기의 WebP 로 줄여 저장한다. 1회성.
 *
 * 왜: 이관 원본은 최대 0.49MB(평균 110KB) 인데 카드에서는 64px 원형으로 쓴다.
 *     186KB 짜리를 내려받아 64px 로 그리는 건 낭비고, 목록 20장이면 매번 2MB 가 넘는다.
 *
 * 어떻게: Supabase 스토리지의 이미지 변환(/render/image/sign)으로 **리사이즈된 WebP 를 받아서
 *     그대로 다시 올린다.** 새 이미지 라이브러리를 붙이지 않는다(런타임 의존성 5개 유지).
 *     ⚠️ 변환은 **서명할 때** transform 을 줘야 적용된다 — 일괄 서명 토큰에 width 를 붙이면
 *        포맷만 바뀌고 크기는 무시된다(실측: 64/160/400 전부 37,860 bytes 동일).
 *
 * 저장을 줄여두면 조회 시점에는 변환이 필요 없어 **일괄 서명 1회**로 끝난다(목록 20장 = 왕복 1번).
 *
 * 실행:  node scripts/optimize-avatars.ts          (미리보기: 샘플 3장 크기 비교)
 *        node scripts/optimize-avatars.ts --apply  (실제 변환)
 */
import { chunk, restHeaders, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const BUCKET = "avatars";
/** 표시 최대 80px(sm) × 레티나 2배 → 160. 여유를 둬 320 으로 저장하면 어떤 화면에서도 흐리지 않다. */
const EDGE = 320;
const QUALITY = 80;
const CONCURRENCY = 6;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);
const SUPA_URL = url;
const SUPA_KEY = key;

// 🔴 실행 순서 가드. 이 스크립트는 `{키}.webp` 로 새 파일을 만든다 —
//    버킷이 아직 공개면 그 새 경로가 그대로 공개 주소가 되어, secure-avatars 로 막아둔 구멍이 되살아난다.
//    (secure-avatars.ts → optimize-avatars.ts 순서가 맞다.)
const bucketInfo = await fetch(`${SUPA_URL}/storage/v1/bucket/${BUCKET}`, { headers: H });
if (!bucketInfo.ok) throw new Error(`버킷 조회 실패 ${bucketInfo.status}`);
const { public: isPublic } = (await bucketInfo.json()) as { public: boolean };
if (isPublic) {
  console.error(`❌ ${BUCKET} 버킷이 아직 공개 상태입니다. scripts/secure-avatars.ts 를 먼저 돌리세요.`);
  process.exit(1);
}

type Row = { id: string; avatar_url: string | null };
const rows = await fetchAllPages<Row>(SUPA_URL, H, "profiles", "select=id,avatar_url&avatar_url=not.is.null", "id");

// 이미 webp 로 줄인 것과 외부 URL(네이버 프로필)은 건너뛴다 → 재실행 안전.
const targets = rows
  .filter((r) => r.avatar_url && !r.avatar_url.startsWith("http") && !r.avatar_url.endsWith(".webp"))
  .map((r) => ({ id: r.id, path: r.avatar_url as string }));

console.log(`사진 보유 ${rows.length}건 / 변환 대상 ${targets.length}건 (이미 webp·외부 URL 제외)`);

/** 변환을 포함해 서명하고, 그 URL 로 리사이즈된 WebP 바이트를 받아온다. */
async function fetchResized(path: string): Promise<ArrayBuffer | null> {
  const signRes = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expiresIn: 600,
      transform: { width: EDGE, height: EDGE, resize: "cover", quality: QUALITY },
    }),
  });
  if (!signRes.ok) return null;
  const { signedURL } = (await signRes.json()) as { signedURL: string };
  // Accept 로 webp 를 요청해야 webp 로 돌려준다(안 주면 원본 포맷 유지).
  const img = await fetch(`${SUPA_URL}/storage/v1${signedURL}`, {
    headers: { Accept: "image/webp,image/*" },
    signal: AbortSignal.timeout(20000),
  });
  if (!img.ok) return null;
  return img.arrayBuffer();
}

if (!APPLY) {
  console.log("\n── 샘플 3장 크기 비교 ──");
  for (const t of targets.slice(0, 3)) {
    const before = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${t.path}`, {
      method: "POST", headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    }).then(async (r) => {
      const { signedURL } = (await r.json()) as { signedURL: string };
      return (await fetch(`${SUPA_URL}/storage/v1${signedURL}`)).arrayBuffer();
    });
    const after = await fetchResized(t.path);
    const kb = (n: number) => `${Math.round(n / 1024)}KB`;
    console.log(`  ${t.path}  ${kb(before.byteLength)} → ${after ? kb(after.byteLength) : "실패"}`);
  }
  console.log("\n미리보기만 했습니다. 변환하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 변환 → 업로드 → 옛 파일 삭제 ────────────────────────
const done: { id: string; path: string }[] = [];
const failures: string[] = [];
const leftovers: string[] = []; // 삭제 못 한 옛 파일(용량만 차지)
let bytesAfter = 0;
let seen = 0;

async function optimizeOne(t: { id: string; path: string }): Promise<{ id: string; path: string } | null> {
  const buf = await fetchResized(t.path);
  if (!buf) { failures.push(`${t.path} → 변환 실패`); return null; }

  const newPath = t.path.replace(/\.[^.]+$/, "") + ".webp";
  const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${newPath}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "image/webp", "x-upsert": "true" },
    body: buf,
  });
  if (!up.ok) { failures.push(`${newPath} 업로드 ${up.status}`); return null; }

  // 옛 파일 제거 — 남겨두면 비공개 버킷 안에서 용량만 먹는다(노출 위험은 없다).
  // 변환은 이미 성공했으므로 삭제 실패로 중단하지는 않되, **몇 개가 남았는지는 센다**.
  const del = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${t.path}`, {
    method: "DELETE", headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  }).catch(() => null);
  if (!del?.ok) leftovers.push(t.path);

  bytesAfter += buf.byteLength;
  return { id: t.id, path: newPath };
}

for (const group of chunk(targets, CONCURRENCY)) {
  const results = await Promise.all(group.map(optimizeOne));
  for (const r of results) if (r) done.push(r);
  seen += group.length;
  process.stdout.write(`\r  변환 ${seen}/${targets.length} (성공 ${done.length} / 실패 ${failures.length})`);
}
console.log();

let linked = 0;
for (const part of chunk(done, 500)) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part.map((d) => ({ id: d.id, avatar_url: d.path }))),
  });
  if (!r.ok) { console.error("\n경로 반영 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  linked += part.length;
  process.stdout.write(`\r  경로 반영 ${linked}/${done.length}`);
}
console.log(`\n✅ 변환 ${done.length}건 · 실패 ${failures.length}건 · 총 용량 ${Math.round(bytesAfter / 1024 / 1024 * 10) / 10}MB`);
if (leftovers.length) console.log(`   ⚠ 옛 파일 ${leftovers.length}건이 안 지워졌습니다(용량만 차지, 노출 위험 없음)`);
for (const f of failures.slice(0, 5)) console.log("   -", f);
