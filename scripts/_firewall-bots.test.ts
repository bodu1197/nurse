import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_CRAWLERS } from "../src/lib/aiCrawlers.ts";
import { EXTRA_PREVIEW_BOTS, NAMES, canon, compareForm, planFirewall, sendForm, type Condition, type Rule } from "./_firewall-bots.ts";

// 운영 응답처럼 조건 키 순서가 섞여 오고, 서버가 매긴 칸(valid·validationErrors)과 null 칸이 붙어 온다.
const ua = (names: string): Condition => ({ type: "user_agent", value: names, op: "re" });
const rule = (name: string, action: string, ...conditions: Condition[]): Rule => ({
  name,
  action: { mitigate: { action, redirect: null, rateLimit: null, actionDuration: null } },
  active: true,
  id: `id:${name}`,
  conditionGroup: [{ conditions }],
  valid: true,
  validationErrors: null,
});

// 운영 설정(2026-10-25)을 줄인 모양 — 이름·순서·조건 꼴이 같다.
const live = (): Rule[] => [
  rule("Allow our cron jobs", "bypass", { type: "path", op: "pre", value: "/api/cron" }),
  { ...rule("Block meta-externalagent (Meta AI crawler)", "deny", { type: "user_agent", op: "sub", value: "meta-externalagent" }), description: "메타 AI 학습 크롤러 차단" },
  rule(NAMES.aiDeny.old, "deny", ua("(GPTBot|ClaudeBot|Meta-ExternalAgent)"), { type: "path", op: "pre", value: "/talent" }),
  rule(NAMES.searchPass.old, "bypass", ua("(Googlebot|Yeti|Daum|Applebot|GPTBot|ClaudeBot|Meta-ExternalAgent|Diffbot)")),
  rule(NAMES.previewLimit, "rate_limit", ua("(kakaotalk-scrap|Twitterbot|TelegramBot)")),
  rule(NAMES.metaPreviewLimit, "rate_limit", ua("(facebookexternalhit|meta-externalfetcher)")),
  rule(NAMES.geo, "deny", { type: "geo_country", op: "neq", value: "KR" }, { type: "geo_country", op: "neq", value: "ID" }),
];
const group = (value: string) => ({ conditions: [{ type: "user_agent", op: "re", value }] });
const previewNames = `kakaotalk-scrap|Twitterbot|TelegramBot|${EXTRA_PREVIEW_BOTS.join("|")}`;

test("AI 봇은 모든 경로에서 거부한다 — 목록 원본(aiCrawlers.ts)을 그대로 쓰고 자리·id 는 그대로", () => {
  const { rules } = planFirewall(live());
  assert.deepEqual(rules[2], {
    id: `id:${NAMES.aiDeny.old}`,
    name: NAMES.aiDeny.now,
    active: true,
    conditionGroup: [group(`(${AI_CRAWLERS.join("|")})`)],
    action: { mitigate: { action: "deny" } },
  });
});

test("검색 통과에서는 AI 이름만 뺀다 — 대소문자만 다른 것도 빼고, 검색엔진은 순서까지 그대로", () => {
  const { rules, removedFromSearchPass } = planFirewall(live());
  assert.equal(rules[3].name, NAMES.searchPass.now);
  assert.deepEqual(rules[3].conditionGroup, [group("(Googlebot|Yeti|Daum|Applebot)")]);
  assert.deepEqual(removedFromSearchPass, ["GPTBot", "ClaudeBot", "Meta-ExternalAgent", "Diffbot"]);
});

test("링크 미리보기 — 빠진 봇을 속도 제한에 더하고, 국가 차단 바로 앞에서 통과시킨다(AI 페처는 빼고)", () => {
  const { rules } = planFirewall(live());
  assert.deepEqual(
    rules.map((r) => r.name),
    [
      "Allow our cron jobs",
      "Block meta-externalagent (Meta AI crawler)",
      NAMES.aiDeny.now,
      NAMES.searchPass.now,
      NAMES.previewLimit,
      NAMES.metaPreviewLimit,
      NAMES.previewPass,
      NAMES.geo,
    ]
  );
  assert.deepEqual(rules[4].conditionGroup, [group(`(${previewNames})`)]);
  assert.deepEqual(rules[6], {
    name: NAMES.previewPass,
    active: true,
    conditionGroup: [group(`(${previewNames})`), group("(facebookexternalhit)")],
    action: { mitigate: { action: "bypass" } },
  });
});

test("손대지 않는 규칙은 서버가 매긴 칸과 null 칸만 빠지고 id·설명은 남는다", () => {
  const { rules } = planFirewall(live());
  assert.deepEqual(rules[1], {
    id: "id:Block meta-externalagent (Meta AI crawler)",
    name: "Block meta-externalagent (Meta AI crawler)",
    description: "메타 AI 학습 크롤러 차단",
    active: true,
    conditionGroup: [{ conditions: [{ type: "user_agent", op: "sub", value: "meta-externalagent" }] }],
    action: { mitigate: { action: "deny" } },
  });
});

test("다시 돌려도 같다 — 서버가 돌려준 적용 결과(새 id·null 칸)를 넣으면 '이미 적용돼 있다'가 된다", () => {
  // 서버는 새로 넣은 규칙에 id 를 매기고 valid·validationErrors 를 붙여 돌려준다. 미리보기 통과의 id 를 이어받지 못하면 여기서 깨진다.
  const fromServer = planFirewall(live()).rules.map((r) => ({ id: "server:new", ...r, valid: true, validationErrors: null }));
  const again = planFirewall(fromServer);
  assert.equal(canon(fromServer.map(sendForm)), canon(again.rules)); // vercel-firewall-bots.ts 의 '이미 적용돼 있다' 판정과 같은 식
  assert.deepEqual(again.changes, []);
  assert.equal(again.rules.filter((r) => r.name === NAMES.previewPass).length, 1);
});

test("순서가 어긋나 있으면 멈춘다 — AI 거부가 검색 통과보다 뒤, 국가 차단이 맨 끝이 아님", () => {
  const swapped = live();
  [swapped[2], swapped[3]] = [swapped[3], swapped[2]];
  assert.throws(() => planFirewall(swapped), /뒤에 있다/);
  const geoNotLast = [...live(), rule("Something after geo", "log", { type: "path", op: "eq", value: "/x" })];
  assert.throws(() => planFirewall(geoNotLast), /맨 마지막/);
});

test("검색 통과에 검색엔진이 하나도 안 남으면 멈춘다 — '()' 는 모두를 통과시킨다", () => {
  const rules = live();
  rules[3] = rule(NAMES.searchPass.old, "bypass", ua("(GPTBot|ClaudeBot)"));
  assert.throws(() => planFirewall(rules), /하나도 안 남는다/);
});

test("통과 규칙이 예상한 모양이 아니면 추측하지 않고 멈춘다", () => {
  for (const value of ["Googlebot", "(Googlebot)|(Yeti)"]) {
    const rules = live();
    rules[3] = rule(NAMES.searchPass.old, "bypass", ua(value));
    assert.throws(() => planFirewall(rules), /예상한 모양/, value);
  }
});

test("AI 목록에 정규식 글자가 섞이거나, 열어 둘 봇·사람을 덮는 이름이 들어가면 멈춘다", () => {
  assert.throws(() => planFirewall(live(), [...AI_CRAWLERS, "Evil|.*"]), /다른 글자/);
  // "Googlebot"·"facebookexternalhit" 는 넣는 순간 통과 목록에서 빠지므로, 남은 목록과만 비교하면 못 잡는다.
  for (const name of ["bot", "Google", "Mobile", "Googlebot", "facebookexternalhit"]) {
    assert.throws(() => planFirewall(live(), [...AI_CRAWLERS, name]), /덮는다/, name);
  }
});

test("AI 거부 정규식이 검색봇·미리보기 봇·사람 브라우저 UA 에 걸리지 않는다(방화벽은 대소문자 무시 부분 일치)", () => {
  const deny = new RegExp(`(${AI_CRAWLERS.join("|")})`, "i");
  const mustPass = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; Daum/4.1; +https://cs.daum.net/faq/15/4118.html?faqId=28966)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Mediapartners-Google",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "vercel-cron/1.0",
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36;KAKAOTALK 2410550",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.6.0)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  ];
  for (const userAgent of mustPass) assert.equal(deny.test(userAgent), false, userAgent);
  assert.equal(deny.test("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"), true);
});

test("적용 뒤 대조는 조건 키 순서와 서버가 새로 매긴 id 를 무시한다", () => {
  const planned = planFirewall(live()).rules;
  const fromServer = planned.map((r, i) => ({
    ...r,
    id: `server:${i}`,
    valid: true,
    validationErrors: null,
    conditionGroup: r.conditionGroup.map((g) => ({ conditions: g.conditions.map((c) => ({ value: c.value, op: c.op, type: c.type })) })),
  }));
  assert.equal(canon(compareForm(fromServer)), canon(compareForm(planned)));
});
