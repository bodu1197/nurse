/**
 * 레거시 회원의 **진짜 가입일**을 되돌려 넣는다.
 *
 * 🔴 문제: 이관 회원 17,193명의 created_at 이 전부 "내가 이관을 돌린 시각" 이다.
 *    그래서 관리자 화면에서 모두 2026-08-04 에 가입한 것으로 보이고,
 *    "오늘 941명 가입" 같은 숫자가 나온다(실제 신규는 18명이었다).
 *    구 널스넷에는 wp_member.regdate(YYYYMMDDHHMMSS, KST)에 진짜 가입일이 남아 있다.
 *
 * profiles 와 auth.users 를 **같이** 고친다. 한쪽만 고치면 화면마다 다른 날짜가 나온다.
 *
 * 실행: npx tsx scripts/restore-legacy-signup-dates.ts
 */
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DUMP = "C:/Users/PC CHOI/Desktop/독수리/wposition1.sql";
const BATCH = 2000;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

async function sql(query: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
}

/** INSERT 한 줄에서 앞 n개 필드만 읽는다(백슬래시 이스케이프 처리). */
function fields(s: string, i: number, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  let f = 0;
  while (f < n && i < s.length) {
    while (s[i] === " " || s[i] === ",") i++;
    if (s[i] === "'") {
      i++;
      let v = "";
      while (i < s.length && s[i] !== "'") { if (s[i] === "\\") { v += s[i + 1]; i += 2; } else v += s[i++]; }
      i++; out.push(v);
    } else if (s.startsWith("NULL", i)) { i += 4; out.push(null); }
    else { let v = ""; while (i < s.length && /[^,)]/.test(s[i])) v += s[i++]; out.push(v.trim()); }
    f++;
  }
  return out;
}

async function main() {
const rows: Array<[string, string]> = [];   // [member_srl, 'YYYY-MM-DD HH:MM:SS']
let block: string | null = null;
const rl = createInterface({ input: createReadStream(DUMP), crlfDelay: Infinity });
for await (const line of rl) {
  const ins = /^INSERT INTO `(\w+)`/.exec(line);
  if (ins) block = ins[1];
  else if (line.startsWith("CREATE TABLE ")) block = null;
  if (block !== "wp_member") continue;
  for (const m of line.matchAll(/\((\d+),\s*'/g)) {
    const f = fields(line, m.index + 1, 22);
    const srl = f[0], rd = f[21] ?? "";
    // regdate 는 char(14) 'YYYYMMDDHHMMSS'. 형식이 어긋나면 건드리지 않는다(추측해서 넣지 않는다).
    if (!srl || !/^\d{14}$/.test(rd)) continue;
    rows.push([srl, `${rd.slice(0,4)}-${rd.slice(4,6)}-${rd.slice(6,8)} ${rd.slice(8,10)}:${rd.slice(10,12)}:${rd.slice(12,14)}`]);
  }
}
console.log(`레거시 가입일 ${rows.length.toLocaleString()}건 읽음`);

let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  // KST 로 적힌 값이므로 'Asia/Seoul' 을 붙여 timestamptz 로 바꾼다.
  const values = chunk.map(([srl, d]) => `(${srl}::bigint, timestamptz '${d} Asia/Seoul')`).join(",");
  await sql(`
    with v(srl, d) as (values ${values})
    update public.profiles p set created_at = v.d
      from v where p.legacy_member_srl = v.srl and p.created_at <> v.d`);
  await sql(`
    with v(srl, d) as (values ${values})
    update auth.users u set created_at = v.d
      from v join public.profiles p on p.legacy_member_srl = v.srl
     where u.id = p.id and u.created_at <> v.d`);
  done += chunk.length;
  console.log(`  ${done.toLocaleString()} / ${rows.length.toLocaleString()}`);
}

const check = await sql(`
  select date_trunc('year', created_at at time zone 'Asia/Seoul')::date 연도, count(*) 명
    from public.profiles where legacy_member_srl is not null group by 1 order by 1`);
console.log("\n이관 회원 가입 연도 분포:");
console.log(JSON.stringify(check));
}
main().catch((e) => { console.error(e); process.exit(1); });
