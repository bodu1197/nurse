/**
 * 구 널스넷 회원의 성별·생년월일 → profiles 이관. 1회성 스크립트.
 *
 * 구 인재 카드가 "서유민 여 29세" 형태로 성별·나이를 보여줬고 오너가 같은 구성을 요구했다.
 * 두 값은 `wp_memberbhextend_extra_vars`(eid='gender'/'birthday')에 있고 profiles 에 컬럼이 이미 있다.
 *  - gender  : '여성' / '남성' 을 그대로 넣는다(앱이 값 규약을 강제하지 않는다).
 *  - birthday: 'YYYYMMDD' → 'YYYY-MM-DD'. profiles.birthday 는 date 라 형식이 맞아야 한다.
 *              나이는 저장하지 않는다 — 매년 틀려지므로 조회 시점에 계산한다(lib/data/talent.ts ageOf).
 *
 * 실행:  node scripts/import-legacy-profile-bits.ts          (미리보기)
 *        node scripts/import-legacy-profile-bits.ts --apply  (실제 적용)
 */
import { readFileSync } from "node:fs";
import { chunk, restHeaders, loadLegacyProfileMap } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const SRC = "talent_gender_birth.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

// [target_srl, eid, value]
const raw = (JSON.parse(readFileSync(SRC, "utf8")) as { rows: string[][] }).rows;

/** 'YYYYMMDD' → 'YYYY-MM-DD'. 자릿수가 어긋나거나 실재하지 않는 날짜는 버린다(9·10자리 몇 건 있음). */
function toDate(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const [y, m, day] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)];
  const iso = `${y}-${m}-${day}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  // 2월 30일 같은 값은 Date 가 조용히 넘겨버리므로 되돌려 대조한다.
  if (parsed.toISOString().slice(0, 10) !== iso) return null;
  const year = Number(y);
  return year >= 1900 && year <= new Date().getFullYear() ? iso : null;
}

const GENDERS = new Set(["여성", "남성"]);

// member_srl → { gender, birthday }
const bits = new Map<string, { gender?: string; birthday?: string }>();
for (const [srl, eid, value] of raw) {
  const k = srl.trim();
  const cur = bits.get(k) ?? {};
  if (eid === "gender" && GENDERS.has(value.trim())) cur.gender = value.trim();
  if (eid === "birthday") {
    const d = toDate(value);
    if (d) cur.birthday = d;
  }
  bits.set(k, cur);
}

const byLegacy = await loadLegacyProfileMap(url, H);
console.log(`profiles(legacy 보유): ${byLegacy.size}명`);

const updates = [...bits.entries()]
  .map(([srl, v]) => ({ id: byLegacy.get(srl), ...v }))
  .filter((x): x is { id: string; gender?: string; birthday?: string } => !!x.id && (!!x.gender || !!x.birthday));

console.log(`이관 대상: ${updates.length}명`);
console.log(`  성별 있음    : ${updates.filter((u) => u.gender).length}`);
console.log(`  생년월일 있음: ${updates.filter((u) => u.birthday).length}`);

if (!APPLY) {
  console.log("\n── 미리보기 3건(식별자 가림) ──");
  for (const u of updates.slice(0, 3)) console.log({ ...u, id: u.id.slice(0, 8) + "…" });
  console.log("\n미리보기만 했습니다. 적용하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// profiles 는 PK 가 id 라 upsert 로 해당 컬럼만 갱신한다. 이미 값이 있는 회원도 레거시 값으로 맞춘다
// (본인이 새 앱에서 고쳤을 여지는 아직 없다 — 가입 폼이 성별·생년월일을 받지 않는다).
//
// 🔴 PostgREST 는 한 배치 안 객체들의 **키 구성이 모두 같아야** 한다("All object keys must match").
//    성별만 있는 사람과 생일만 있는 사람을 섞어 보내면 400 이 난다. 없는 값을 null 로 채우는 방법도 있지만
//    그러면 반대쪽 값을 null 로 덮어쓰므로, 키 모양별로 나눠 보낸다.
const groups: Record<string, typeof updates> = { both: [], gender: [], birthday: [] };
for (const u of updates) {
  const shape = u.gender && u.birthday ? "both" : u.gender ? "gender" : "birthday";
  groups[shape].push(u);
}

let done = 0;
for (const [shape, list] of Object.entries(groups)) {
  if (!list.length) continue;
  for (const part of chunk(list, 500)) {
    const r = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(part),
    });
    if (!r.ok) { console.error(`\n적용 실패(${shape})`, r.status, (await r.text()).slice(0, 300)); process.exit(1); }
    done += part.length;
    process.stdout.write(`\r  적용 ${done}/${updates.length}`);
  }
}
console.log(`\n✅ 성별·생년월일 이관: ${done}명`);
console.log("   내역:", Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])));
