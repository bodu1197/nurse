/**
 * nurse-app(널스넷) Vercel 방화벽의 봇 규칙을 고친다 — 규칙 셋을 바꾸고 하나를 더한다. 나머지는 그대로 둔다.
 *
 * 정책(오너 지시 2026-10-25): "한국과 인도네시아, 유용한 봇은 열어 두고 나머지는 막아라" · AI 봇은 "무조건 돈이 지출 안되게 확실하게 막아라".
 *   · 유용한 봇 = 검색엔진(구글·네이버·다음·빙 등)과 링크 미리보기(카카오·페이스북·X·텔레그램·핀터레스트 등). 사람에게 이 사이트를 보여 준다.
 *   · AI 수집·학습·답변 봇은 나라와 무관하게 막는다. 거부된 요청은 함수를 깨우지 않고 요금도 0 이다
 *     (Vercel 문서: "WAF deny ... mitigated traffic does not incur CDN Requests or Fast Data Transfer").
 *
 * 왜(2026-10-25 실측):
 *   · ClaudeBot 한 대가 10/17 부터 공고 상세(/jobs/:id)를 하루 70만 번 읽었다. 그 화면은 캐시가 안 돼 요청마다 함수가 돌았고
 *     Fast Origin Transfer 가 하루 2GB → 18GB, 청구가 하루 $4 → $15 가 됐다. AI 봇이 통과 규칙('Allow search and AI crawlers')에
 *     들어 있어 '한국·인도네시아 밖 차단'을 건너뛰고 있었다.
 *   · 국가 차단이 하루 1.32만 건을 막는데 그중 1.5천 건이 페이스북 미리보기 봇(facebookexternalhit)이었다 — 해외 미리보기 봇이
 *     속도 제한만 지나고 마지막 국가 차단에서 403 을 받아, 페이스북·X·텔레그램 등에 공유한 링크의 미리보기가 깨져 있었다.
 *
 * 바꾸는 것(계획은 _firewall-bots.ts — 규칙을 이름으로 찾고, 모양이나 순서가 예상과 다르면 멈춘다):
 *   ① 'Block AI crawlers on resumes'(거부, /talent 만) → 'Block AI crawlers'(거부, 모든 경로). 목록은 src/lib/aiCrawlers.ts.
 *   ② 'Allow search and AI crawlers'(통과) → 'Allow search crawlers' — AI 이름만 뺀다. 검색엔진은 그대로다.
 *   ③ 'Rate limit link-preview crawlers' 에 빠져 있던 미리보기 봇(핀터레스트·레딧·Teams)을 더하고,
 *      'Allow link-preview crawlers'(통과, 새 규칙)로 두 미리보기 속도 제한의 대상을 국가 차단 바로 앞에서 통과시킨다.
 *      한도를 넘긴 요청은 속도 제한이 거기서 끝내므로 여기 닿는 것은 한도 안의 요청뿐이다(talent 방화벽 14-1 과 같은 구조).
 *
 * 사용(어느 폴더에서든 — --disable-warning 은 package.json 에 "type" 이 없어 뜨는 무해한 경고 한 줄을 숨길 뿐이다):
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON C:/dev/nurse-app/scripts/vercel-firewall-bots.ts           # 바뀔 내용만 본다(이미 적용돼 있으면 실제 요청으로 확인만)
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON C:/dev/nurse-app/scripts/vercel-firewall-bots.ts --apply   # 적용 → 다시 읽어 대조 → 실제 요청으로 확인
 * 토큰: .env.local 의 VERCEL_TOKEN(화면에 찍지 않는다).
 * 되돌림: --apply 는 적용 직전 운영 설정을 C:/dev/_backups/vercel-firewall/ 에 파일로 남긴다. 적용 때문에 막히면 되돌리는 법이 화면에 찍힌다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SITE_URL } from "../src/lib/constants.ts";
import { canon, compareForm, describe, planFirewall, sendForm, type Rule } from "./_firewall-bots.ts";

const API = "https://api.vercel.com/v1/security/firewall/config";
const TEAM_ID = "team_sA8Fyd7y54t3sueJ23R3wEv6"; // soriplays-projects = .vercel/project.json 의 orgId
const QS = `projectId=nurse-app&teamId=${TEAM_ID}`;
// 🔒 이 되돌림 스크립트는 **첫 적용 직전 설정(version 10)** 으로만 되돌린다(그 백업 = 2026-10-25 운영 설정). 그 뒤 버전에서
//    안내하면 AI 차단과 그 사이 바꾼 것까지 통째로 사라지므로, 설정 버전이 10 일 때만 보여 준다.
const ROLLBACK = "node C:/dev/_backups/vercel-firewall-2026-10-17/rollback.js nurse-app";
const ROLLBACK_VERSION = 10;
// 절대경로로 둔다 — 스크립트 위치에서 세면 저장소 안 워크트리에서 돌릴 때 백업이 저장소 안에 생긴다(.gitignore 에 없다).
const SNAPSHOT_DIR = new URL("file:///C:/dev/_backups/vercel-firewall/");
const TIMEOUT_MS = 15_000;
const CHECK_ROUNDS = 12; // × CHECK_WAIT_MS — 규칙이 퍼지기를 최대 1분 기다린다
const CHECK_WAIT_MS = 5_000;
// 응답의 최상위 칸 중 서버가 매기는 것과 이 스크립트가 되돌려 보내는 것. 이 밖의 칸이 켜져 있으면
// PUT(설정 통째 덮어쓰기)이 지울 수 있어 멈춘다.
const KNOWN = new Set(["id", "version", "updatedAt", "ownerId", "projectKey", "changes", "firewallEnabled", "rules", "ips", "crs"]);

// 실제 요청 확인 — 이 PC(한국 IP)에서 잰다. AI 봇은 막히고, 사람·검색봇·미리보기 봇은 AI 거부에 잘못 걸리지 않는지 본다.
// 해외에서 오는 검색·미리보기 봇의 통과는 여기서 잴 수 없어, 적용 뒤 설정 대조로 확인한다.
const CHECKS = [
  { what: "AI 봇 → 공고 목록", path: "/jobs", want: 403, userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" },
  { what: "AI 봇 → robots.txt", path: "/robots.txt", want: 403, userAgent: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" },
  { what: "사람(PC 크롬) → 홈", path: "/", want: 200, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" },
  {
    what: "사람(카톡 안 브라우저) → 홈",
    path: "/",
    want: 200,
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36;KAKAOTALK 2410550",
  },
  { what: "구글 검색봇 → 홈", path: "/", want: 200, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { what: "페이스북 미리보기 → 홈", path: "/", want: 200, userAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
];

type Config = { firewallEnabled: boolean; rules: Rule[]; ips?: Record<string, unknown>[]; crs?: Record<string, unknown>; [key: string]: unknown };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isOff = (v: unknown) => v === null || v === undefined || v === false || canon(v) === "{}" || canon(v) === "[]";
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const label = (code: number) => (code === 0 ? "연결 실패" : String(code));

function readToken(): string {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const token = env.match(/^VERCEL_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!token) throw new Error("C:/dev/nurse-app/.env.local 에 VERCEL_TOKEN 이 없다");
  return token;
}

/** 응답을 규칙 하나하나까지 확인한다 — 모양이 다르면 영어 오류로 죽기 전에 한국어로 멈춘다. */
function isRule(r: unknown): r is Rule {
  return (
    isRecord(r) &&
    typeof r.name === "string" &&
    typeof r.active === "boolean" &&
    isRecord(r.action) &&
    Array.isArray(r.conditionGroup) &&
    r.conditionGroup.every((g) => isRecord(g) && Array.isArray(g.conditions) && g.conditions.every((c) => isRecord(c) && typeof c.type === "string" && typeof c.op === "string"))
  );
}
function isConfig(x: unknown): x is Config {
  return isRecord(x) && typeof x.firewallEnabled === "boolean" && Array.isArray(x.rules) && x.rules.every(isRule);
}

async function readActive(headers: Record<string, string>): Promise<Config> {
  let res: Response;
  try {
    res = await fetch(`${API}/active?${QS}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`Vercel 에 연결하지 못했다(${message(e)}) — 인터넷 연결을 확인하고 다시 실행한다`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Vercel 이 거절했다(HTTP ${res.status}) — .env.local 의 VERCEL_TOKEN 이 만료됐거나 이 팀 권한이 없다. 토큰을 새로 발급해 바꾼다`);
  }
  if (!res.ok) throw new Error(`방화벽 설정 읽기 실패 HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isConfig(body)) throw new Error("방화벽 응답 모양이 예상과 다르다(규칙 이름·켜짐·동작·조건) — 대시보드에서 확인");
  return body;
}

/** 규칙 말고 PUT 이 함께 덮어쓰는 칸 — 적용 전후가 같아야 한다. IP 차단 목록은 서버가 id 를 새로 매길 수 있어 id 를 빼고 본다. */
const settings = (c: Config) =>
  canon({
    firewallEnabled: c.firewallEnabled,
    crs: c.crs ?? {},
    ips: (c.ips ?? []).map((ip) => Object.fromEntries(Object.entries(ip).filter(([key]) => key !== "id"))),
  });

/** 적용 직전 운영 설정을 파일로 남긴다 — 되돌릴 근거. 저장소 밖에 둬서 커밋되지 않는다. */
function saveSnapshot(live: Config): string {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = new URL(`nurse-app-v${String(live.version)}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, SNAPSHOT_DIR);
  writeFileSync(file, JSON.stringify(live, null, 2));
  return fileURLToPath(file);
}

/** 적용 때문에 막혔을 때 보여 줄 되돌리는 법 — 되돌림 스크립트가 맞는 버전일 때만 그 명령을, 아니면 남긴 파일을 알려 준다. */
const rollbackHint = (live: Config, snapshot: string) =>
  live.version === ROLLBACK_VERSION
    ? `바로 되돌린다: ${ROLLBACK}`
    : `적용 직전 설정을 ${snapshot} 에 남겨 두었다 — 이 파일 경로를 Claude 에게 주고 되돌려 달라고 한다`;

async function apply(headers: Record<string, string>, live: Config, rules: Rule[], hint: string): Promise<void> {
  const body = JSON.stringify({ firewallEnabled: live.firewallEnabled, rules, ips: live.ips ?? [], crs: live.crs ?? {} });
  let put: Response;
  try {
    put = await fetch(`${API}?${QS}`, { method: "PUT", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`적용 요청이 응답 없이 끊겼다(${message(e)}) — 적용됐는지 모른다. 인자 없이 다시 실행해 지금 상태를 확인한다`);
  }
  if (!put.ok) throw new Error(`적용 실패 HTTP ${put.status} — ${(await put.text()).slice(0, 300)}`);
  // 200 은 '저장됐다'일 뿐이다 — 다시 읽어 규칙 전부와 나머지 설정이 계획과 같은지 본다.
  let after: Config;
  try {
    after = await readActive(headers);
  } catch (e) {
    throw new Error(`저장은 됐는데 다시 읽지 못했다(${message(e)}) — 인자 없이 다시 실행해 확인한다. 같은 명령을 다시 돌려도 안전하다`);
  }
  const invalid = after.rules.filter((r) => r.valid === false).map((r) => r.name);
  if (invalid.length > 0 || canon(compareForm(after.rules)) !== canon(compareForm(rules)) || settings(after) !== settings(live)) {
    const why = invalid.length > 0 ? `(서버가 틀렸다고 한 규칙: ${invalid.join(", ")}) ` : "";
    throw new Error(`저장은 됐는데 다시 읽은 설정이 계획과 다르다 ${why}— 대시보드를 확인하고, 필요하면 ${hint}`);
  }
  console.log(`적용 완료 — 규칙 ${rules.length}개. 바꾼 규칙 말고는 이름·켜짐·동작·조건·설명과 방화벽 켜짐·IP 차단·OWASP 규칙이 그대로다.`);
  const renumbered = rules.filter((r, i) => typeof r.id === "string" && r.id !== after.rules[i].id).length;
  if (renumbered > 0) console.log(`참고: 규칙 ${renumbered}개의 내부 번호(id)를 Vercel 이 새로 매겼다 — 동작에는 영향이 없다.`);
}

/** 상태 코드만 본다(HEAD — 본문을 안 받는다). 연결 실패는 0 으로 두고 다음 회차에 다시 잰다. */
async function status(path: string, userAgent: string): Promise<number> {
  try {
    const res = await fetch(SITE_URL + path, { method: "HEAD", headers: { "user-agent": userAgent }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.status;
  } catch {
    return 0;
  }
}
const measure = () => Promise.all(CHECKS.map((c) => status(c.path, c.userAgent)));

/**
 * baseline·hint: --apply 직전에 잰 값과 되돌리는 법. 적용 때문에 새로 막힌 것(전엔 200, 지금 403)이면 기다리지 않고 바로
 * 되돌리라고 안내한다 — 그 밖의 실패(연결 실패·서버 오류·이 PC 가 해외 IP)에서 되돌리면 AI 차단만 풀린다.
 */
async function probe(baseline?: number[], hint?: string): Promise<boolean> {
  console.log(`실제 요청으로 확인 중(이 PC 의 한국 IP 에서 잰다, 최대 ${(CHECK_ROUNDS * CHECK_WAIT_MS) / 60_000}분)…`);
  for (let round = 1; ; round++) {
    const got = await measure();
    const ok = got.every((code, i) => code === CHECKS[i].want);
    const shouldOpen = (i: number) => CHECKS[i].want === 200;
    const newlyBlocked = got.some((code, i) => shouldOpen(i) && code === 403 && baseline?.[i] === 200);
    if (!ok && !newlyBlocked && round < CHECK_ROUNDS) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_WAIT_MS));
      continue;
    }
    for (const [i, c] of CHECKS.entries()) console.log(`  ${got[i] === c.want ? "✓" : "✗"} ${c.what}: ${label(got[i])} (기대 ${c.want})`);
    if (ok) return true;
    if (newlyBlocked) console.error(`적용 전엔 열리던 접속이 막혔다(403) — ${hint ?? "대시보드 Firewall → Rules 를 확인한다"}`);
    else if (got.some((code, i) => shouldOpen(i) && code === 403)) {
      console.error("열려야 할 접속을 방화벽이 막고 있다(403) — 이 PC 가 해외 IP 로 잡히면 원래 막힌다. 휴대폰 데이터로 사이트를 열어 보고, 거기서도 막히면 대시보드 Firewall → Rules 를 확인한다.");
    } else if (got.some((code, i) => shouldOpen(i) && code !== 200)) {
      console.error("이 PC 에서 열려야 할 접속이 안 열린다(연결 실패·서버 오류) — 방화벽 문제가 아닐 수 있다. 휴대폰 등 다른 기기로 사이트를 열어 본다.");
    } else console.error("AI 봇이 아직 안 막힌다 — 규칙이 퍼지는 데 더 걸릴 수 있다. 몇 분 뒤 인자 없이 다시 실행해 본다.");
    return false;
  }
}

async function main(): Promise<void> {
  const headers = { Authorization: `Bearer ${readToken()}`, "Content-Type": "application/json" };
  const live = await readActive(headers);
  const unknown = Object.keys(live).filter((key) => !KNOWN.has(key) && !isOff(live[key]));
  if (unknown.length > 0) {
    throw new Error(`이 스크립트가 되돌려 보내지 않는 설정이 켜져 있다(${unknown.join(", ")}) — PUT 은 설정을 통째로 덮어써 이걸 지울 수 있어 멈춘다`);
  }
  const plan = planFirewall(live.rules);
  if (canon(live.rules.map(sendForm)) === canon(plan.rules)) {
    console.log("이미 적용돼 있다 — 바꿀 것이 없다.");
    if (!(await probe())) process.exitCode = 1;
    return;
  }
  for (const { before, after } of plan.changes) {
    console.log(before ? `바꿈: ${describe(before)}` : "새로 넣음:");
    console.log(`  → ${describe(after)}`);
  }
  if (plan.changes.length === 0) console.log("규칙 내용은 그대로이고 순서만 바로잡는다.");
  console.log(`검색 통과 목록에서 빼는 AI 이름: ${plan.removedFromSearchPass.join(", ") || "없음"}`);
  if (!process.argv.includes("--apply")) {
    console.log("읽기만 했다. 적용하려면 --apply 를 붙인다.");
    return;
  }
  const snapshot = saveSnapshot(live);
  console.log(`적용 직전 설정을 저장했다: ${snapshot}`);
  const hint = rollbackHint(live, snapshot);
  const baseline = await measure();
  await apply(headers, live, plan.rules, hint);
  if (!(await probe(baseline, hint))) process.exitCode = 1;
}

// 🔒 process.exit() 를 쓰지 않는다 — 윈도우 Node 는 fetch 연결이 닫히는 중에 exit 하면 libuv 단언으로 죽어
//    성공해도 종료 코드가 실패로 나온다(실측 2026-10-25). exitCode 만 정하고 스스로 끝나게 둔다.
main().catch((e: unknown) => {
  console.error(message(e));
  process.exitCode = 1;
});
