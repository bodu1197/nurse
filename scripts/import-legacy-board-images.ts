/**
 * 구 널스넷 게시판 글에 딸린 사진을 board 버킷으로 옮기고 board_posts.images 에 잇는다. 1회성.
 *
 * 본문은 평문으로 옮겼기 때문에(HTML 을 그대로 렌더하면 XSS) `<img>` 가 그 과정에서 사라진다.
 * 그래서 원본 HTML 에서 이미지 주소만 순서대로 뽑아 따로 담는다.
 *
 * 실측: 이미지가 있는 글 44건 / 이미지 94장 — 그 중 17장은 뉴스 기사(외부 URL)라 받아오지 않고
 *       주소만 둔다. 우리가 옮기는 건 nursenet.co.kr/files/attach/… 77장이다.
 *
 * 실행:  node scripts/import-legacy-board-images.ts          (미리보기)
 *        node scripts/import-legacy-board-images.ts --apply  (실제 이관)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const BUCKET = "board";
const LEGACY_ORIGIN = "https://nursenet.co.kr";
const CONCURRENCY = 4;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

const POST_COLS = ["document_srl", "module_srl", "member_srl", "nick_name", "title", "content", "regdate", "comment_count"] as const;
const SRL = POST_COLS.indexOf("document_srl");
const CONTENT = POST_COLS.indexOf("content");

const IMG_RE = /<img[^>]+src=["']([^"']+)["']/gi;
/** 라이믹스 첨부 경로 → 버킷 오브젝트 키. `/files/attach/images/2024/10/18/해시.jpeg` → `2024/10/18/해시.jpeg` */
const objectKeyOf = (src: string) => src.replace(/^\.?\/?files\/attach\/images\//, "").replace(/\?.*$/, "");

const rows = (JSON.parse(readFileSync("scripts/legacy-data/board_posts.json", "utf8")) as { rows: string[][] }).rows;

type Job = { legacySrl: string; images: string[]; downloads: { from: string; key: string }[] };
const jobs: Job[] = [];
for (const d of rows) {
  const found = [...(d[CONTENT] ?? "").matchAll(IMG_RE)].map((m) => m[1]);
  if (found.length === 0) continue;
  const images: string[] = [];
  const downloads: { from: string; key: string }[] = [];
  for (const src of found) {
    if (/^https?:/i.test(src)) { images.push(src); continue; } // 뉴스 이미지 등 남의 서버 — 주소만
    const key2 = objectKeyOf(src);
    images.push(key2);
    downloads.push({ from: LEGACY_ORIGIN + (src.startsWith("/") ? src : `/${src.replace(/^\.\//, "")}`), key: key2 });
  }
  jobs.push({ legacySrl: (d[SRL] ?? "").trim(), images, downloads });
}

const allDownloads = jobs.flatMap((j) => j.downloads);
console.log(`이미지 있는 글 ${jobs.length}건 / 이미지 ${jobs.reduce((n, j) => n + j.images.length, 0)}장`);
console.log(`  옮길 파일 ${allDownloads.length}장 · 외부 주소 그대로 ${jobs.reduce((n, j) => n + j.images.length, 0) - allDownloads.length}장`);

if (!APPLY) {
  console.log("\n── 미리보기 3장 ──");
  for (const d of allDownloads.slice(0, 3)) console.log(`  ${d.from}\n    → ${BUCKET}/${d.key}`);
  console.log("\n미리보기만 했습니다. 이관하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 0) 버킷 준비(공개) ──────────────────────────────────
// 공개인 이유는 마이그레이션 주석에 적어뒀다: 얼굴이 아니고, 경로가 32자리 해시이며,
// 비공개로 두면 서명 수명 때문에 화면을 열어둔 채 스크롤할 때 사진이 깨진다.
const mk = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST", headers: H,
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 10485760 }),
});
console.log(mk.ok ? `✅ ${BUCKET} 버킷 생성` : `버킷 준비: ${mk.status} (이미 있으면 정상)`);

// ── 1) 내려받아 올리기 ──────────────────────────────────
const failures: string[] = [];
let done = 0, bytes = 0;
async function moveOne(d: { from: string; key: string }) {
  const res = await fetch(d.from, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res?.ok) { failures.push(`${d.from} → 받기 실패 ${res?.status ?? "네트워크"}`); return; }
  const buf = await res.arrayBuffer();
  const up = await fetch(`${url}/storage/v1/object/${BUCKET}/${d.key}`, {
    method: "POST",
    headers: {
      apikey: key!, Authorization: `Bearer ${key}`, "x-upsert": "true",
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
    },
    body: buf,
  });
  if (!up.ok) { failures.push(`${d.key} → 올리기 ${up.status}`); return; }
  done += 1; bytes += buf.byteLength;
}

for (const group of chunk(allDownloads, CONCURRENCY)) {
  await Promise.all(group.map(moveOne));
  process.stdout.write(`\r  옮김 ${done + failures.length}/${allDownloads.length} (성공 ${done} / 실패 ${failures.length})`);
}
console.log(`\n✅ 파일 ${done}장 · ${(bytes / 1048576).toFixed(1)}MB · 실패 ${failures.length}장`);
for (const f of failures.slice(0, 8)) console.log("   -", f);

// ── 2) board_posts.images 잇기 ──────────────────────────
// 받기에 실패한 파일은 목록에서 뺀다 — 없는 사진을 걸어두면 화면에 깨진 이미지가 남는다.
const failedKeys = new Set(failures.map((f) => f.split(" ")[0]));
const idByLegacy = new Map(
  (await fetchAllPages<{ id: string; legacy_srl: number }>(
    url, H, "board_posts", "select=id,legacy_srl&legacy_srl=not.is.null", "legacy_srl",
  )).map((p) => [String(p.legacy_srl), p.id]),
);

let linked = 0;
for (const j of jobs) {
  const id = idByLegacy.get(j.legacySrl);
  if (!id) { console.log(`⚠ 글을 못 찾음 legacy_srl=${j.legacySrl}`); continue; }
  const images = j.images.filter((v) => !failedKeys.has(v) && !failedKeys.has(LEGACY_ORIGIN + "/files/attach/images/" + v));
  const r = await fetch(`${url}/rest/v1/board_posts?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ images }),
  });
  if (!r.ok) { console.error("\nimages 반영 실패", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  linked += 1;
}
console.log(`✅ 글 ${linked}건에 사진 연결`);
