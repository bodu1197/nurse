/**
 * 구 널스넷 회원 중 **이관에서 빠진 사람**을 넣는다. 1회성 스크립트.
 *
 * 왜 빠졌나: 앞선 이관이 회원그룹으로 걸렀는데, 그 기준에 안 걸린 937명이 남았다.
 * 그중 30명은 공고를 낸 병원이라, 로그인해도 자기 공고가 없는 상태였다.
 *
 * 대상: legacy_member_srl 이 profiles 에 없는 회원 중
 *   · status='APPROVED' 인 사람만 (DENIED 6명 제외 — 옛 사이트에서 이미 막힌 계정)
 *   · 이메일이 기존 계정과 겹치지 않는 사람만 (8명 제외 — 같은 사람이 새로 가입한 것)
 *
 * 비밀번호: 라이믹스 bcrypt($2y$) 를 그대로 옮긴다. $2y$ 와 $2b$ 는 같은 알고리즘이라
 * 접두사만 바꾸면 GoTrue 가 그대로 검증한다(앞선 이관도 같은 방식 — 실측: 기존 16,267명이 $2b$10$).
 * 그래서 **옛 비밀번호로 그대로 로그인된다.**
 *
 * 역할: 회원그룹 4=기업회원 → hospital, 3=일반회원 → nurse.
 *
 * 실행:  node scripts/import-legacy-missing-members.ts           (미리보기)
 *        node scripts/import-legacy-missing-members.ts --apply   (실제 적재)
 *        node scripts/import-legacy-missing-members.ts --apply --limit 1   (1명만)
 */
import { readFileSync } from "node:fs";
import { cleanPersonName } from "../src/lib/personName.ts";

const APPLY = process.argv.includes("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

type Member = {
  member_srl: string; user_id: string; password: string; email_address: string;
  phone_number?: string; user_name?: string; nick_name?: string;
  status?: string; denied?: string; regdate?: string; group: string | null;
};

const miss: Member[] = JSON.parse(readFileSync("/tmp/miss_members.json", "utf8"));

/**
 * 화면에 쓸 이름. profiles.display_name 에 CHECK 가 걸려 있어(20260804210000)
 * 이모지·기호가 있으면 **가입 자체가 실패한다** → 같은 규칙으로 미리 정리한다.
 * 남는 글자가 없으면 아이디를 쓴다(빈 이름으로 넣으면 목록이 "-" 로 도배된다).
 */
const nameOf = (m: Member) =>
  cleanPersonName(m.nick_name ?? "") ?? cleanPersonName(m.user_name ?? "") ?? cleanPersonName(m.user_id) ?? "회원";

async function existingEmails(emails: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const part = emails.slice(i, i + 200);
    const res = await fetch(`${url}/rest/v1/profiles?select=email&email=in.(${part.map((e) => `"${e}"`).join(",")})`, { headers: H });
    for (const r of (await res.json()) as { email: string | null }[]) if (r.email) found.add(r.email.toLowerCase());
  }
  return found;
}

const targets = miss.filter((m) => m.status === "APPROVED" && m.denied !== "Y");
const taken = await existingEmails([...new Set(targets.map((m) => m.email_address.toLowerCase()))]);
const rows = targets.filter((m) => !taken.has(m.email_address.toLowerCase())).slice(0, LIMIT);

const byRole = rows.reduce<Record<string, number>>((a, m) => {
  const r = m.group === "4" ? "hospital" : "nurse";
  a[r] = (a[r] ?? 0) + 1; return a;
}, {});

console.log(`빠진 회원 ${miss.length} → 대상 ${rows.length}`);
console.log(`  제외: 탈퇴·차단 ${miss.length - targets.length} · 이메일 중복 ${targets.length - rows.filter(() => true).length - (targets.length - rows.length - 0)}`);
console.log(`  역할: ${JSON.stringify(byRole)}`);
console.log(`  예시: ${rows.slice(0, 3).map((m) => `${m.user_id}(${nameOf(m)}/${m.group === "4" ? "병원" : "간호사"})`).join(", ")}`);

if (!APPLY) {
  console.log("\n미리보기입니다. 실제로 넣으려면 --apply 를 붙이세요.");
  process.exit(0);
}

let ok = 0; const failed: { id: string; why: string }[] = [];
for (const m of rows) {
  // 🔴 $2y$ → $2b$ : 같은 bcrypt 다. 이 한 줄로 옛 비밀번호가 그대로 살아난다.
  const hash = m.password.startsWith("$2y$") ? `$2b$${m.password.slice(4)}` : m.password;
  const role = m.group === "4" ? "hospital" : "nurse";

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      email: m.email_address,
      password_hash: hash,
      email_confirm: true,
      // handle_new_user 트리거가 여기서 이름·역할·가입경로를 읽어 profiles 를 만든다.
      user_metadata: { name: nameOf(m), role, provider: "legacy" },
    }),
  });
  if (!res.ok) { failed.push({ id: m.user_id, why: `${res.status} ${(await res.text()).slice(0, 120)}` }); continue; }
  const user = (await res.json()) as { id: string };

  // 트리거가 안 채우는 것 — 아이디·연락처·레거시 번호. 이게 있어야 옛 아이디로 로그인되고
  // 공고·이력서를 member_srl 로 이어붙일 수 있다.
  const up = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({
      username: m.user_id,
      legacy_member_srl: Number(m.member_srl),
      phone_number: m.phone_number || null,
    }),
  });
  if (!up.ok) { failed.push({ id: m.user_id, why: `profiles: ${(await up.text()).slice(0, 120)}` }); continue; }
  ok++;
  if (ok % 50 === 0) console.log(`  ${ok}/${rows.length}`);
}

console.log(`\n완료: ${ok}명 / 실패 ${failed.length}`);
for (const f of failed.slice(0, 10)) console.log(`  ✗ ${f.id}: ${f.why}`);
