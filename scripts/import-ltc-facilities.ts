/**
 * 🧓 장기요양기관(요양원·재가센터) 명부 → hospitals(병원 명부). 오너 지시 2026-10-16 (가):
 * 요양원·재가센터가 공고를 올리려면 사업자 인증·공고 등록 화면의 **같은 기관 검색창**에서 자기 기관을 찾아야 한다.
 * 심사평가원 명부에는 의료기관만 있어 요양원이 없다 → 공단 명부를 같은 표에 싣는다(새 표·새 화면 없음).
 *
 * 실행:  node --env-file=.env.local scripts/import-ltc-facilities.ts          (미리보기 — 받아서 세기만)
 *        node --env-file=.env.local scripts/import-ltc-facilities.ts --apply  (실제 적재)
 * 다시 돌려도 된다 — 장기요양기관기호(ltc_code)로 **새 기관만 넣고 이미 있는 행은 건드리지 않는다**(ignore-duplicates).
 * 🔴 덮어쓰면(merge) 관리자가 고친 이름(admin renameHospital)이 공단 값으로 되돌아간다(검증 지적 2026-10-16) —
 *    심사평가원 즉시 조회(api/hospitals/search)와 같은 원칙이다. 이름·급여 종류가 바뀐 기관을 고치는 일은 따로 한다.
 * ponytail: 손으로 돌리는 수집이다. 그 뒤에 새로 생긴 기관은 사업자 인증 화면의 '직접 등록'으로 들어온다.
 *           정기 갱신이 필요해지면 /api/cron/sync-hospitals 처럼 관리자 수동 라우트로 올린다.
 *
 * 🔴 키는 PUBLIC_RECRUIT_API_KEY — DATA_GO_KR_API_KEY 는 다른 계정의 키라 이 API 가 403 이다.
 * 🔴 공단 API 는 지역 **이름**을 안 준다(시도·시군구 번호만). 이름은 공단 장기요양 홈페이지 '기관 찾기' 화면이 쓰는
 *    공개 시군구 목록에서 받는다. 행정구역 코드표로 짐작하면 틀린다 — 전남·광주는 2026 통합(전남광주통합특별시, 12)으로
 *    시군구 번호가 새로 매겨졌다(예: 보성군 행정코드 780 ↔ 공단 750).
 * 🔴 같은 기관이 급여 종류마다 한 줄씩 온다(서울 6,063줄 = 3,857곳) → 기관기호로 합친다(scripts/_ltc.ts mergeLtc).
 * 🔴 초당 요청 한도가 있다(동시에 던지면 LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR) → 차례로, 쉬어 가며.
 */
import { chunk, restHeaders } from "./_legacy-util.ts";
import { LTC_SIDO, mergeLtc, type LtcItem } from "./_ltc.ts";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawApiKey = process.env.PUBLIC_RECRUIT_API_KEY;
if (!url || !key || !rawApiKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / PUBLIC_RECRUIT_API_KEY 필요(--env-file=.env.local)");
// 포털이 주는 '인코딩' 키를 그대로 넣어 둔 경우가 있다 — 한 번 풀어 두고 쿼리에 넣을 때 다시 인코딩한다.
const apiKey = (() => { try { return decodeURIComponent(rawApiKey); } catch { return rawApiKey; } })();

const API = "https://apis.data.go.kr/B550928/searchLtcInsttService02/getLtcInsttSeachList02";
const SIGUNGU = "https://www.longtermcare.or.kr/npbs/add/selectCommonAddrSiGunGuCd";
const PAGE = 5000; // 공단 API 가 한 번에 주는 최대(실측 5,000 → 4초)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** 공단 홈페이지의 공개 시군구 목록 — 번호 → 이름. */
async function sigunguNames(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const sd of Object.keys(LTC_SIDO)) {
    const r = await fetch(SIGUNGU, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" },
      body: `siDoCd=${sd}`,
    });
    const list = ((await r.json()) as { addrSiGunGu?: { siDoCd: string; siGunGuCd: string; siGunGuNm: string }[] }).addrSiGunGu ?? [];
    // 🔴 요청 형식이 틀리면 조용히 서울 목록이 온다(실측) — 시도가 다르면 멈춘다(틀린 지역을 싣느니 안 싣는다).
    if (list.length === 0 || list.some((x) => x.siDoCd !== sd)) throw new Error(`시군구 목록 이상(${sd})`);
    for (const x of list) m.set(`${sd}/${x.siGunGuCd}`, x.siGunGuNm);
    await wait(1000);
  }
  return m;
}

/** 공단 API 한 쪽. 초당 한도에 걸리면 쉬었다가 다시(최대 4번). */
async function fetchPage(siDoCd: string, pageNo: number): Promise<{ total: number; items: LtcItem[] }> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${API}?serviceKey=${encodeURIComponent(apiKey)}&pageNo=${pageNo}&numOfRows=${PAGE}&siDoCd=${siDoCd}`, {
      signal: AbortSignal.timeout(60_000),
    });
    const t = await r.text();
    const total = t.match(/<totalCount>(\d+)<\/totalCount>/)?.[1];
    if (total !== undefined) {
      const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const f = (k: string) => unxml(m[1].match(new RegExp(`<${k}>([^<]*)</${k}>`))?.[1] ?? "");
        return { adminNm: f("adminNm"), adminPttnCd: f("adminPttnCd"), longTermAdminSym: f("longTermAdminSym"), siDoCd: f("siDoCd"), siGunGuCd: f("siGunGuCd") };
      });
      return { total: Number(total), items };
    }
    const err = t.match(/<errMsg>([^<]*)<\/errMsg>/)?.[1] ?? `HTTP ${r.status}`;
    if (attempt >= 4) throw new Error(`공단 API 실패(${siDoCd} ${pageNo}쪽): ${err}`);
    await wait(15_000 * attempt);
  }
}

const names = await sigunguNames();
console.log(`시군구 이름 ${names.size}개`);

const items: LtcItem[] = [];
for (const sd of Object.keys(LTC_SIDO)) {
  const first = await fetchPage(sd, 1);
  const got: LtcItem[] = [...first.items];
  for (let p = 2; (p - 1) * PAGE < first.total; p++) {
    await wait(2000);
    got.push(...(await fetchPage(sd, p)).items);
  }
  // 🔴 받은 줄이 공단이 말한 총수와 다르면 멈춘다 — API 가 행을 잘라 보내도 오류 없이 오기 때문에, 그대로 가면 기관이 조용히 빠진다.
  if (got.length !== first.total) throw new Error(`${sd} ${LTC_SIDO[sd]}: 총 ${first.total}줄인데 ${got.length}줄만 받았다`);
  items.push(...got);
  console.log(`${sd} ${LTC_SIDO[sd]}: ${first.total}줄`);
  await wait(2000);
}

const rows = mergeLtc(items, (sd, g) => names.get(`${sd}/${g}`));
const kinds = new Map<string, number>();
for (const r of rows) for (const k of r.cl_cd_nm.split("·")) kinds.set(k, (kinds.get(k) ?? 0) + 1);
console.log(`받은 줄 ${items.length} → 기관 ${rows.length}곳(복지용구만 하는 곳 제외)`);
console.log("급여 종류별 기관 수:", Object.fromEntries(kinds));
console.log("지역 못 붙인 기관:", rows.filter((r) => !r.region).length, "· 시군구 이름 못 찾은 기관:",
  rows.filter((r) => r.region && !r.region.includes(" ") && r.region !== "세종").length);
console.log("예:", rows.slice(0, 3));

if (!APPLY) {
  console.log("미리보기만 했다. 실제로 넣으려면 --apply");
} else {
  const H = { ...restHeaders(key), Prefer: "resolution=ignore-duplicates,return=minimal" };
  let done = 0;
  for (const part of chunk(rows, 1000)) {
    const r = await fetch(`${url}/rest/v1/hospitals?on_conflict=ltc_code`, { method: "POST", headers: H, body: JSON.stringify(part) });
    if (!r.ok) throw new Error(`hospitals upsert 실패(${done}곳까지 넣음): ${r.status} ${await r.text()}`);
    done += part.length;
  }
  console.log(`보냄 ${done}곳(이미 있던 기관은 그대로 두고 새 기관만 들어갔다)`);
}
