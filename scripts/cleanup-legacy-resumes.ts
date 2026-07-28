/**
 * 이관한 인재정보 중 간호 직군이 아닌 이력서를 정리한다. 1회성.
 *
 * 널스넷은 간호사 플랫폼인데 옛 사이트는 병원 채용 전반을 다뤄서 피부관리·약무·의사·사무직이 섞여 들어왔다.
 * 대상은 **간호직·간호조무직을 하나도 고르지 않은** 사람만 — 간호 직군을 겸해서 고른 사람은 남긴다.
 *
 * 실행:  node scripts/cleanup-legacy-resumes.ts <group>          (미리보기)
 *        node scripts/cleanup-legacy-resumes.ts <group> --apply  (실제 삭제)
 *   group: beauty_pharma (피부관리·약무) | pure_non_nurse_all (간호 직군 미선택 전체)
 */
import { readFileSync } from "node:fs";
import { chunk, IN_BATCH, restHeaders, loadLegacyProfileMap } from "./_legacy-util.ts";

const GROUPS = ["beauty_pharma", "pure_non_nurse_all"] as const;
type Group = (typeof GROUPS)[number];

const GROUP = process.argv[2] as Group;
const APPLY = process.argv.includes("--apply");
if (!GROUP || !GROUPS.includes(GROUP)) {
  console.error(`group 인자 필요: ${GROUPS.join(" | ")}`);
  process.exit(1);
}

/**
 * 이관분만 지우기 위한 경계.
 * 이관 스크립트는 created_at 에 **옛 사이트 등록일**(최신이 2026-07-27)을 넣는다. 반면 간호사가 새 앱에서
 * 직접 쓴 이력서는 작성 시각이 들어간다. 그래서 이 시각보다 이전에 만들어진 것만 지우면
 * "레거시 비간호 회원이 새 앱에서 새로 쓴 이력서"를 잘못 지우는 일이 없다(/review8 보안 지적).
 */
const IMPORT_CUTOFF = "2026-07-28T00:00:00Z";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = restHeaders(key);

const srls: string[] = JSON.parse(readFileSync("scripts/legacy-data/nonnurse_member_srls.json", "utf8"))[GROUP];
console.log(`대상 회원번호: ${srls.length}건 (${GROUP})`);

const byLegacy = await loadLegacyProfileMap(url, H);
const ids = srls.map((s) => byLegacy.get(s.trim())).filter((v): v is string => !!v);
console.log(`profiles 매칭: ${ids.length}건`);

// 실제로 "이관분 이력서"가 있는 것만 센다.
const present: string[] = [];
for (const part of chunk(ids, IN_BATCH)) {
  const r = await fetch(
    `${url}/rest/v1/resumes?select=profile_id&created_at=lt.${IMPORT_CUTOFF}&profile_id=in.(${part.join(",")})`,
    { headers: H },
  );
  if (!r.ok) throw new Error(`이력서 조회 실패 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rowsPage = (await r.json()) as { profile_id: string }[];
  present.push(...rowsPage.map((x) => x.profile_id));
}
console.log(`이관분 이력서 보유: ${present.length}건 → 삭제 대상`);

if (!APPLY) {
  console.log("\n미리보기만 했습니다. 삭제하려면 --apply 를 붙이세요.");
  console.log("(resumes 삭제 시 work_experiences 는 ON DELETE CASCADE 로 함께 지워집니다.)");
  process.exit(0);
}

let gone = 0;
for (const part of chunk(present, IN_BATCH)) {
  // 조회와 **같은 created_at 조건**을 건다 — 조회 후 삭제 사이에 본인이 새로 쓴 이력서를 지우지 않기 위해.
  // return=representation: 컷오프 조건에 걸려 실제로 안 지워진 행이 있을 수 있으므로
  // 요청한 개수가 아니라 **DB 가 지웠다고 돌려준 개수**를 센다.
  const r = await fetch(
    `${url}/rest/v1/resumes?created_at=lt.${IMPORT_CUTOFF}&profile_id=in.(${part.join(",")})`,
    { method: "DELETE", headers: { ...H, Prefer: "return=representation" } },
  );
  if (!r.ok) { console.error("\n삭제 실패", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  gone += ((await r.json()) as unknown[]).length;
  process.stdout.write(`\r  삭제 ${gone}/${present.length}`);
}
console.log(`\n✅ 이력서 삭제: ${gone}건 (회원 계정은 그대로, 이력서만 제거)`);
