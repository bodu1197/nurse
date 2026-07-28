/**
 * 구 널스넷(라이믹스) 게시판 글·댓글을 board_posts / board_comments 로 옮긴다. 1회성.
 *
 * 대상(공개 게시판만): RN,AN이야기 · 간호뉴스 · 사진게시판 · 이벤트 · 열정백서 · 널스넷영상 · 공지사항
 *   ⚠️ '1:1 문의'(모듈 52)는 **일부러 뺐다** — 개인이 운영진에게 보낸 비공개 문의(SECRET)라
 *      공개 게시판에 올리면 그대로 유출이다. 약관·개인정보처리방침 같은 '페이지'도 글이 아니라 뺀다.
 *
 * 작성자 매핑: legacy member_srl > 0 이면 profiles(legacy_member_srl)로 잇고,
 *   음수(익명)거나 우리 DB 에 없는 회원이면 author_id = NULL + legacy_nickname 에 표시명을 남긴다.
 *
 * 재실행 안전: legacy_srl 유니크 인덱스 + on_conflict upsert.
 *
 * 실행:  node scripts/import-legacy-board.ts          (미리보기)
 *        node scripts/import-legacy-board.ts --apply  (실제 이관)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, htmlToText, loadLegacyProfileMap, fetchAllPages } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

// 🔴 인덱스를 눈대중으로 세지 말 것 — 뽑을 때 쓴 select 순서를 그대로 적어두고 **이름으로** 찾는다.
//    (공고 이관 때 숫자를 직접 세다 본문 43건을 코드값으로 덮은 적이 있다.)
const POST_COLS = ["document_srl", "module_srl", "member_srl", "nick_name", "title", "content", "regdate", "comment_count"] as const;
const CMT_COLS = ["comment_srl", "document_srl", "member_srl", "nick_name", "content", "regdate"] as const;
const at = <T extends readonly string[]>(cols: T, name: T[number]) => cols.indexOf(name);

type Dump = { rows: string[][] };
const load = (f: string) => (JSON.parse(readFileSync(`scripts/legacy-data/${f}`, "utf8")) as Dump).rows;

/**
 * 라이믹스 regdate("20240722221424", 한국시각) → ISO.
 * 🔴 뒤에 Z 를 붙이면 안 된다 — 그러면 UTC 로 읽혀 글 시각이 9시간 당겨진다(새벽 글이 전날로 밀린다).
 */
function regdateToIso(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
}

const byLegacy = await loadLegacyProfileMap(url, H);
console.log(`profiles 의 레거시 회원: ${byLegacy.size}명`);

// ── 글 ──────────────────────────────────────────────────
const P = {
  srl: at(POST_COLS, "document_srl"), module: at(POST_COLS, "module_srl"), member: at(POST_COLS, "member_srl"),
  nick: at(POST_COLS, "nick_name"), title: at(POST_COLS, "title"), content: at(POST_COLS, "content"),
  reg: at(POST_COLS, "regdate"),
};

// 🔴 공개 게시판 모듈만. 덤프를 만들 때도 걸렀지만 **여기서 한 번 더** 확인한다 —
//    나중에 덤프를 다시 뽑으면서 이 조건을 빠뜨리면, 비공개 1:1 문의(모듈 52, SECRET 49건)가
//    아무 경고 없이 공개 게시판으로 들어간다. 걸러지는 게 있으면 화면에 알린다.
//    50 RN,AN이야기 / 373 간호뉴스 / 18099 사진게시판 / 18095 이벤트 / 18101 영상 / 18097 열정백서 / 54 공지사항
const PUBLIC_MODULES = new Set(["50", "373", "18099", "18095", "18101", "18097", "54"]);

const allPostRows = load("board_posts.json");
const postRows = allPostRows.filter((d) => PUBLIC_MODULES.has((d[P.module] ?? "").trim()));
if (postRows.length !== allPostRows.length) {
  console.log(`⚠ 공개 게시판이 아닌 글 ${allPostRows.length - postRows.length}건을 걸렀습니다(1:1 문의 등)`);
}
const posts = postRows.map((d) => {
  const authorId = byLegacy.get((d[P.member] ?? "").trim()) ?? null;
  return {
    legacy_srl: Number(d[P.srl]),
    author_id: authorId,
    // 이름을 알아볼 수 있는 실회원 글은 profiles.display_name 으로 그리므로 닉네임을 따로 두지 않는다.
    legacy_nickname: authorId ? null : (d[P.nick] ?? "").trim() || "익명",
    title: (d[P.title] ?? "").trim().slice(0, 200) || "(제목 없음)",
    body: htmlToText(d[P.content] ?? "") || "(내용 없음)",
    created_at: regdateToIso(d[P.reg] ?? ""),
    updated_at: regdateToIso(d[P.reg] ?? ""),
  };
});

// ── 댓글 ────────────────────────────────────────────────
const C = {
  srl: at(CMT_COLS, "comment_srl"), doc: at(CMT_COLS, "document_srl"), member: at(CMT_COLS, "member_srl"),
  nick: at(CMT_COLS, "nick_name"), content: at(CMT_COLS, "content"), reg: at(CMT_COLS, "regdate"),
};
const cmtRows = load("board_comments.json");

const badDate = posts.filter((p) => !p.created_at).length;
console.log(`글 ${posts.length}건 (실회원 ${posts.filter((p) => p.author_id).length} / 익명·미이관 ${posts.filter((p) => !p.author_id).length})`);
console.log(`댓글 ${cmtRows.length}건`);
if (badDate) throw new Error(`작성일 파싱 실패 ${badDate}건 — 그대로 넣으면 now() 로 덮여 목록 순서가 무너진다`);

if (!APPLY) {
  const s = posts[posts.length - 1];
  console.log("\n── 미리보기(가장 최근 글) ──");
  console.log(` ${s.created_at} · ${s.legacy_nickname ?? "(회원)"} · ${s.title}`);
  console.log(` ${s.body.slice(0, 120)}…`);
  console.log("\n미리보기만 했습니다. 이관하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 1) 글 upsert ────────────────────────────────────────
let n = 0;
for (const part of chunk(posts, 300)) {
  const r = await fetch(`${url}/rest/v1/board_posts?on_conflict=legacy_srl`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n글 이관 실패", r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  n += part.length;
  process.stdout.write(`\r  글 ${n}/${posts.length}`);
}
console.log(`\n✅ 글 ${n}건`);

// ── 2) legacy_srl → board_posts.id 지도 ─────────────────
// 댓글은 글의 UUID 가 있어야 붙는다. 방금 넣은 것까지 포함해 전부 다시 읽는다(1000행 제한 때문에 페이징).
const idByLegacy = new Map(
  (await fetchAllPages<{ id: string; legacy_srl: number }>(
    url, H, "board_posts", "select=id,legacy_srl&legacy_srl=not.is.null", "legacy_srl",
  )).map((p) => [String(p.legacy_srl), p.id]),
);
console.log(`글 UUID 지도: ${idByLegacy.size}건`);

// ── 3) 댓글 upsert ──────────────────────────────────────
const orphans: string[] = [];
const comments = cmtRows.flatMap((d) => {
  const postId = idByLegacy.get((d[C.doc] ?? "").trim());
  if (!postId) { orphans.push(d[C.srl] ?? "?"); return []; }
  const authorId = byLegacy.get((d[C.member] ?? "").trim()) ?? null;
  return [{
    legacy_srl: Number(d[C.srl]),
    post_id: postId,
    author_id: authorId,
    legacy_nickname: authorId ? null : (d[C.nick] ?? "").trim() || "익명",
    body: htmlToText(d[C.content] ?? "") || "(내용 없음)",
    created_at: regdateToIso(d[C.reg] ?? ""),
  }];
});
if (orphans.length) console.log(`⚠ 원글을 못 찾은 댓글 ${orphans.length}건은 건너뜁니다`);

let m = 0;
for (const part of chunk(comments, 300)) {
  const r = await fetch(`${url}/rest/v1/board_comments?on_conflict=legacy_srl`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) { console.error("\n댓글 이관 실패", r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  m += part.length;
  process.stdout.write(`\r  댓글 ${m}/${comments.length}`);
}
console.log(`\n✅ 댓글 ${m}건`);
