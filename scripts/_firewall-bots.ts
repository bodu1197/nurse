/**
 * nurse-app Vercel 방화벽의 봇 규칙을 고치는 **계획** — 네트워크 없이 시험하려고 따로 둔다(_ltc.ts 와 같은 이유).
 * 읽기·적용·확인은 vercel-firewall-bots.ts 가 한다. 왜 이렇게 바꾸는지는 그 파일 머리 주석.
 */
import { AI_CRAWLERS } from "../src/lib/aiCrawlers.ts";

export type Condition = { type: string; op: string; value?: unknown; [key: string]: unknown };
export type Rule = {
  name: string;
  active: boolean;
  conditionGroup: { conditions: Condition[] }[];
  action: { mitigate?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
};
export type Change = { before?: Rule; after: Rule };
export type Plan = { rules: Rule[]; changes: Change[]; removedFromSearchPass: string[] };

/** 규칙은 이름으로 찾는다(id 는 적용할 때마다 Vercel 이 새로 매긴다). old 는 첫 적용 전 이름 — 다시 돌릴 때는 now 로 찾는다. */
export const NAMES = {
  aiDeny: { old: "Block AI crawlers on resumes", now: "Block AI crawlers" },
  searchPass: { old: "Allow search and AI crawlers", now: "Allow search crawlers" },
  previewLimit: "Rate limit link-preview crawlers",
  metaPreviewLimit: "Rate limit Meta preview crawlers",
  previewPass: "Allow link-preview crawlers",
  geo: "Block traffic outside KR/ID",
};

/**
 * 해외에서도 열어 둘 링크 미리보기 봇 중 운영 속도 제한 목록에 없던 것(오너 2026-10-25 "유용한 봇은 열어 두고") —
 * 핀터레스트·레딧·Teams(Skype). 🔒 'Pinterest' 로 줄이지 마라 — 부분 일치라 핀터레스트 앱 안 브라우저를 쓰는 사람까지
 * 속도 제한에 담긴다(talent 방화벽과 같은 교훈).
 */
export const EXTRA_PREVIEW_BOTS = ["Pinterestbot", "redditbot", "SkypeUriPreview"];

const MIN_AI_NAMES = 10; // 목록이 이보다 짧으면 잘못 읽힌 것으로 보고 멈춘다
const SAFE_NAME = /^[A-Za-z0-9-]+$/; // 이름이 방화벽 정규식에 그대로 들어가므로 영문·숫자·하이픈만 받는다
// 사람 브라우저 UA 에 흔한 낱말과 꼭 열어 둘 봇 — AI 이름이 이 안에 들어 있으면("Mobile"·"bot"·"Googlebot") 그들까지 막힌다.
// 꼭 열어 둘 봇을 따로 적는 이유: AI 목록에 "Googlebot" 이 잘못 들어가면 검색 통과에서 빠져 거부로 옮겨 가는데, 남은 목록과만
// 비교하면 이걸 못 잡는다.
const NEVER_BLOCK = [
  "Mozilla", "AppleWebKit", "Chrome", "Safari", "Mobile", "Android", "iPhone", "Windows", "KAKAOTALK", "NAVER", "Whale", "SamsungBrowser",
  "Googlebot", "Yeti", "Daum", "bingbot", "facebookexternalhit", "kakaotalk-scrap",
];
const SERVER_ONLY = new Set(["valid", "validationErrors"]);
const dropNull = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase(); // 방화벽 연산자는 대소문자를 안 가린다

/**
 * PUT 에 싣는 모양 — 서버가 매기는 valid·validationErrors 와 값이 null 인 칸만 뺀다. 설명은 그대로 보내 지워지지 않게 한다.
 * id 도 그대로 두지만 보존 효과는 없다 — Vercel 은 PUT 에 실린 id 를 쓰지 않고 새로 매겼다(2026-10-25 1회 실측: 보낸 16개 전부).
 */
export function sendForm(rule: Rule): Rule {
  const rest = dropNull(Object.fromEntries(Object.entries(rule).filter(([key]) => !SERVER_ONLY.has(key))));
  return {
    ...rest,
    name: rule.name,
    active: rule.active,
    conditionGroup: rule.conditionGroup,
    action: { ...rule.action, mitigate: dropNull(rule.action.mitigate ?? {}) },
  };
}

/** 적용 뒤 대조용 — Vercel 이 적용 때 규칙 id 를 새로 매기므로 id 를 빼고 비교한다(id 가 바뀐 것은 적용 뒤 참고로만 알린다). */
export const compareForm = (rules: readonly Rule[]) =>
  rules.map((rule) => Object.fromEntries(Object.entries(sendForm(rule)).filter(([key]) => key !== "id")));

/** 키 순서와 무관한 비교용 문자열 — Vercel 은 조건의 키 순서를 바꿔 돌려준다. */
export const canon = (value: unknown): string =>
  JSON.stringify(value, (_key: string, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );

/** 사람이 읽는 한 줄 — 이름·켜짐·동작·조건을 다 보여 줘서, 꺼져 있던 규칙이 켜지는 것 같은 변화도 화면에 드러나게 한다. */
export function describe(rule: Rule): string {
  const groups = rule.conditionGroup.map((g) =>
    g.conditions.map((c) => `${c.type} ${c.neg ? "not " : ""}${c.op} ${String(c.value)}`).join(" 그리고 ")
  );
  return `'${rule.name}' · ${rule.active ? "켜짐" : "꺼짐"} · ${String(rule.action.mitigate?.action)} · ${groups.join(" 또는 ")}`;
}

/** "(a|b|c)" 꼴 UA 정규식 조건 하나뿐인 규칙에서 이름을 꺼낸다 — 다른 모양이면 추측하지 않고 멈춘다. */
function uaNames(rule: Rule): string[] {
  const groups = rule.conditionGroup;
  const c = groups.length === 1 && groups[0].conditions.length === 1 ? groups[0].conditions[0] : undefined;
  const names = c?.type === "user_agent" && c.op === "re" && typeof c.value === "string" ? c.value.match(/^\((.*)\)$/)?.[1]?.split("|") : undefined;
  if (!names || names.some((name) => !SAFE_NAME.test(name))) throw new Error(`'${rule.name}' 규칙이 예상한 모양(UA 이름 목록 하나)이 아니다 — 대시보드에서 확인`);
  return names;
}
const uaGroup = (names: readonly string[]) => ({ conditions: [{ type: "user_agent", op: "re", value: `(${names.join("|")})` }] });

export function planFirewall(live: readonly Rule[], ai: readonly string[] = AI_CRAWLERS): Plan {
  if (ai.length < MIN_AI_NAMES) throw new Error(`AI 봇 목록(src/lib/aiCrawlers.ts)이 너무 짧다(${ai.length}개) — 파일이 바뀌었는지 확인`);
  const bad = ai.filter((name) => !SAFE_NAME.test(name));
  if (bad.length > 0) throw new Error(`AI 봇 목록(src/lib/aiCrawlers.ts)에 영문·숫자·하이픈 말고 다른 글자가 있다: ${bad.join(", ")}`);
  const isAi = (name: string) => ai.some((a) => sameName(a, name));

  // 미리보기 통과 규칙은 빼고 다시 끼운다 — 몇 번을 돌려도 같은 자리에 하나만 있게. 전에 있던 것의 id 는 이어받는다:
  // 다른 규칙은 운영 id 를 그대로 들고 있으므로, 이것만 id 가 없으면 다시 돌릴 때 '이미 적용돼 있다'가 영영 안 나온다.
  const oldPreviewPass = live.find((r) => r.name === NAMES.previewPass);
  const rules = live.filter((r) => r.name !== NAMES.previewPass).map(sendForm);
  const at = (...names: string[]) => {
    const i = rules.findIndex((r) => names.includes(r.name));
    if (i < 0) throw new Error(`규칙을 못 찾았다: ${names.map((n) => `'${n}'`).join(" / ")} — 대시보드에서 이름이 바뀌었는지 확인`);
    return i;
  };
  const deny = at(NAMES.aiDeny.old, NAMES.aiDeny.now);
  const pass = at(NAMES.searchPass.old, NAMES.searchPass.now);
  const [previewLimit, metaPreviewLimit] = [at(NAMES.previewLimit), at(NAMES.metaPreviewLimit)];
  const geo = at(NAMES.geo);
  // 위에서 아래로 먼저 맞는 규칙이 이긴다(거부는 그 자리에서 끝, 통과는 뒤 규칙을 건너뛴다). 순서는 고치지 않고, 어긋나 있으면 멈춘다.
  if (deny > pass) throw new Error("AI 거부 규칙이 검색 통과 규칙보다 뒤에 있다 — AI 봇이 통과에 먼저 걸린다. 대시보드에서 순서부터 확인");
  if (Math.max(previewLimit, metaPreviewLimit) > geo) throw new Error("미리보기 속도 제한이 국가 차단보다 뒤에 있다 — 대시보드에서 순서부터 확인");
  if (geo !== rules.length - 1) throw new Error("국가 차단이 맨 마지막 규칙이 아니다 — 미리보기 통과가 그 뒤 규칙까지 건너뛰게 된다. 대시보드에서 확인");

  const changes: Change[] = [];
  const replace = (i: number, after: Rule) => {
    if (canon(rules[i]) !== canon(after)) changes.push({ before: rules[i], after });
    rules[i] = after;
  };

  // ① AI 봇 — 모든 경로(robots.txt 포함)에서 거부한다.
  replace(deny, { ...rules[deny], name: NAMES.aiDeny.now, active: true, conditionGroup: [uaGroup(ai)], action: { ...rules[deny].action, mitigate: { action: "deny" } } });

  // ② 검색 통과 — AI 이름만 뺀다. 다 빠지면 '()' 가 되어 모두를 통과시키므로 멈춘다.
  const searchNames = uaNames(rules[pass]);
  const keptSearch = searchNames.filter((name) => !isAi(name));
  if (keptSearch.length === 0) throw new Error("검색 통과 규칙에 검색엔진이 하나도 안 남는다 — 대시보드에서 확인");
  replace(pass, { ...rules[pass], name: NAMES.searchPass.now, conditionGroup: [uaGroup(keptSearch)] });

  // ③ 링크 미리보기 — 속도 제한 목록에 빠진 미리보기 봇을 더하고, 두 제한의 대상(AI 페처 제외)을 국가 차단 바로 앞에서 통과시킨다.
  //    한도를 넘긴 요청은 속도 제한이 끝내므로 여기 닿는 것은 한도 안의 요청뿐이다. 이게 없으면 해외 미리보기 봇이 국가 차단에서 403 이다.
  const limitNames = uaNames(rules[previewLimit]);
  const missing = EXTRA_PREVIEW_BOTS.filter((name) => !limitNames.some((n) => sameName(n, name)));
  if (missing.length > 0) replace(previewLimit, { ...rules[previewLimit], conditionGroup: [uaGroup([...limitNames, ...missing])] });
  const previewNames = [previewLimit, metaPreviewLimit].map((i) => uaNames(rules[i]).filter((name) => !isAi(name)));
  if (previewNames.every((names) => names.length === 0)) throw new Error("미리보기 속도 제한 규칙에 남는 이름이 없다 — 대시보드에서 확인");

  // AI 거부는 부분 일치·대소문자 무시라, 넓은 이름 하나("bot"·"Google"·"Mobile")가 열어 둘 봇과 사람까지 막는다 — 그런 이름이면 멈춘다.
  const keep = [...keptSearch, ...previewNames.flat(), ...NEVER_BLOCK];
  const broad = ai.filter((a) => keep.some((k) => k.toLowerCase().includes(a.toLowerCase())));
  if (broad.length > 0) throw new Error(`AI 봇 목록의 이름이 열어 둘 봇·사람 브라우저를 덮는다(${broad.join(", ")}) — 그들까지 막힌다. src/lib/aiCrawlers.ts 확인`);

  const previewPass: Rule = {
    ...(typeof oldPreviewPass?.id === "string" ? { id: oldPreviewPass.id } : {}),
    name: NAMES.previewPass,
    active: true,
    conditionGroup: previewNames.filter((names) => names.length > 0).map(uaGroup),
    action: { mitigate: { action: "bypass" } },
  };
  const before = oldPreviewPass && sendForm(oldPreviewPass);
  if (!before || canon(before) !== canon(previewPass)) changes.push({ before, after: previewPass });
  rules.splice(geo, 0, previewPass); // 국가 차단(맨 마지막) 바로 앞

  return { rules, changes, removedFromSearchPass: searchNames.filter(isAi) };
}
