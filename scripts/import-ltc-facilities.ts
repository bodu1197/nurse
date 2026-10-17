/**
 * 🧓 장기요양기관(요양원·재가센터) 명부 → hospitals(병원 명부). 오너 지시 2026-10-16 (가):
 * 요양원·재가센터가 공고를 올리려면 사업자 인증·공고 등록 화면의 **같은 기관 검색창**에서 자기 기관을 찾아야 한다.
 * 심사평가원 명부에는 의료기관만 있어 요양원이 없다 → 공단 명부를 같은 표에 싣는다(새 표·새 화면 없음).
 *
 * 실행:  node --env-file=.env.local scripts/import-ltc-facilities.ts          (미리보기 — 받아서 세기만)
 *        node --env-file=.env.local scripts/import-ltc-facilities.ts --apply  (실제 적재)
 *        주소 채우기는 아래 📍(--addresses, --after=).
 * 다시 돌려도 된다 — 장기요양기관기호(ltc_code)로 **새 기관만 넣고 이미 있는 행은 건드리지 않는다**(ignore-duplicates).
 * 예외는 --addresses 하나 — 이미 있는 행의 **빈 주소만** 채운다.
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
 *
 * 📍 주소 채우기(--addresses): 검색 API 에는 주소가 없어 명부 행의 address 가 비어 있다 → 공고 근무지가 "서울 노원구"까지만 찼다.
 *    공단 '시설별 상세조회'(data.go.kr 15058856, 같은 키)로 기관마다 한 번씩 불러 비어 있는 행만 채운다.
 *    🔴 상세조회도 주소를 글자로 주지 않는다(도로명코드·건물번호) → 도로 이름은 행정안전부 주소정보누리집의
 *       '도로명' 월 전체분 파일(공개, 키 없음)로 바꾼다. 카카오 지도 이름 검색은 시험한 3곳 중 1곳만 찾아 쓰지 않았다.
 *    🔴 상세조회는 하루 1만 회(개발계정) — 2만 8천 곳은 사흘에 나눠 돈다. **한도로 멈추면** 마지막 줄에 `--after=<id>` 를 찍는다.
 *       다음 날 그 값을 붙여 돌리면 거기서부터 잇는다(못 채운 곳을 매일 다시 불러 한도를 쓰지 않게).
 *       한 바퀴를 다 돌면 그렇다고 알린다 — 그 뒤 --after 없이 돌리면 못 채운 곳만 다시 시도한다.
 *       오류로 멈추면(연달아 실패·저장 실패·API 이상) 커서를 찍지 않는다 — 지난번 --after(없으면 처음)부터 다시 돌린다.
 *    node --env-file=.env.local scripts/import-ltc-facilities.ts --addresses          (미리보기 — 목록은 다 받고 주소는 5곳만)
 *    node --env-file=.env.local scripts/import-ltc-facilities.ts --apply --addresses [--after=<id>]  (새 기관 넣고 + 주소 채움)
 */
import { chunk, fetchAllPages, restHeaders } from "./_legacy-util.ts";
import { LTC_SIDO, firstZipEntry, ltcRowAddress, mergeLtc, parseDetail, parseRoadNames, xmlField, type LtcDetail, type LtcItem } from "./_ltc.ts";

const APPLY = process.argv.includes("--apply");
const ADDRESSES = process.argv.includes("--addresses");
const AFTER_FLAG = "--after=";
// "--after <id>"(띄어 씀)·"--after="(빈 값)는 조용히 처음부터 돌며 그날 한도를 헛쓴다 — 받지 않는다.
if (process.argv.includes("--after") || process.argv.includes(AFTER_FLAG)) throw new Error("--after=<id> 처럼 = 뒤에 id 를 붙여 쓴다");
const AFTER = process.argv.find((a) => a.startsWith(AFTER_FLAG))?.slice(AFTER_FLAG.length) ?? "";
if (AFTER && !/^[0-9a-f-]{36}$/i.test(AFTER)) throw new Error("--after 는 hospitals.id(uuid)여야 한다");
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

/** 읽기 요청 — 연결이 안 되거나 늦어 fetch 가 던지면 쉬었다가 다시(최대 4번). 시간 제한은 매번 새로 건다.
 *  주소정보누리집은 4번에 1번꼴로 연결에만 15초가 걸려 기본 연결 제한(10초)에 끊겼다(2026-10-18 실측 — 3일차가 시작도 못 하고 멈춤). */
async function fetchRetry(input: string, init: RequestInit = {}, ms = 60_000): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      if (attempt >= 4) throw e;
      await wait(5_000 * attempt);
    }
  }
}

/** 공단 홈페이지의 공개 시군구 목록 — 번호 → 이름. */
async function sigunguNames(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const sd of Object.keys(LTC_SIDO)) {
    const r = await fetchRetry(SIGUNGU, {
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
    const r = await fetchRetry(`${API}?serviceKey=${encodeURIComponent(apiKey)}&pageNo=${pageNo}&numOfRows=${PAGE}&siDoCd=${siDoCd}`);
    const t = await r.text();
    const total = t.match(/<totalCount>(\d+)<\/totalCount>/)?.[1];
    if (total !== undefined) {
      const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const f = (k: string) => xmlField(m[1], k);
        return { adminNm: f("adminNm"), adminPttnCd: f("adminPttnCd"), longTermAdminSym: f("longTermAdminSym"), siDoCd: f("siDoCd"), siGunGuCd: f("siGunGuCd") };
      });
      return { total: Number(total), items };
    }
    const err = t.match(/<errMsg>([^<]*)<\/errMsg>/)?.[1] ?? `HTTP ${r.status}`;
    if (attempt >= 4) throw new Error(`공단 API 실패(${siDoCd} ${pageNo}쪽): ${err}`);
    await wait(15_000 * attempt);
  }
}

const DETAIL = "https://apis.data.go.kr/B550928/getLtcInsttDetailInfoService02/getGeneralSttusDetailInfoItem02";
const JUSO = "https://business.juso.go.kr/api/jst"; // 주소정보누리집 '주소정보 다운로드' 화면이 부르는 공개 주소
const ROAD_FILE = "6"; // 주소정보누리집 자료 번호 6 = '도로명'(selectBabsRtlDtaDtlList 실측 2026-10-16)
const WRITE_BATCH = 20; // 주소 PATCH 를 이만큼씩 동시에 보내고 기다린다
const FAIL_STREAK = 10; // 상세조회가 이만큼 연달아 실패하면(장애·모르는 한도 문구) 멈춘다 — 한두 곳 실패는 세고 넘어간다
// 도로명 파일이 제대로 읽혔는지 맞춰 볼 도로 — 공단 설명서 예시 기관(번동데이케어센터)의 도로. 이름이 바뀌면 여기를 고친다.
const TEST_ROAD = { code: "113053107018", name: "서울특별시 강북구 월계로" };
// 시작 전에 불러 볼 기관(2026-10-16 실측 주소). API 가 변수를 무시하거나 응답 칸·파일 형식이 바뀌면 모든 행이 '못 채움'으로
// 빠지며 그날 한도를 헛돈다 — 그걸 시작 전에 한 번에 잡는다. 기관이 문을 닫거나 옮기면 다른 기관으로 바꾼다.
// (연달아 못 채우면 멈추는 방식은 쓰지 않는다 — 못 채운 곳만 다시 도는 재실행에서는 목록이 전부 '못 채움'이라 늘 멈춘다.)
const CANARY = { sym: "11130500391", region: "서울 강북구", address: "서울특별시 강북구 오현로28길 11" }; // 번동자연재활요양원

type JusoFile = { crtrYm: string; fileNm: string; tmprFileNm: string; fileTypeNm: string; ctpvClsfCd: string; isExist: string };

/** 주소정보누리집 '도로명' 월 전체분 중 가장 최근 달 → 글자. 목록은 그해 나온 달을 다 준다(month 값과 무관, 실측). */
async function roadNameFile(): Promise<string> {
  const now = new Date();
  for (const year of [now.getFullYear(), now.getFullYear() - 1]) {
    const r = await fetchRetry(`${JUSO}/selectAttrbDBDwldList`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rtlDtaDtlSn: ROAD_FILE, year: String(year), month: "12", expand: "Y" }),
    }, 30_000);
    if (!r.ok) throw new Error(`도로명 파일 목록 실패: HTTP ${r.status}`);
    const files = (((await r.json()) as { results?: { allMonthFileList?: JusoFile[] } }).results?.allMonthFileList ?? [])
      .filter((f) => f.isExist === "Y").sort((a, b) => a.crtrYm.localeCompare(b.crtrYm));
    const f = files.at(-1);
    if (!f) continue;
    const q = new URLSearchParams({
      regYmd: String(year), reqType: f.fileTypeNm, ctprvnCd: f.ctpvClsfCd, stdde: f.crtrYm,
      fileName: f.fileNm, realFileName: f.tmprFileNm, intFileNo: "0", intNum: "0",
    });
    const res = await fetchRetry(`${JUSO}/download?${q}`, {}, 120_000);
    if (!res.ok) throw new Error(`도로명 파일 받기 실패(${f.fileNm}): HTTP ${res.status}`);
    const zip = Buffer.from(await res.arrayBuffer());
    if (zip.length < 4 || zip.readUInt32LE(0) !== 0x04034b50) throw new Error(`도로명 파일이 zip 이 아니다(${f.fileNm})`);
    console.log(`도로명 파일 ${f.fileNm}`);
    // 🔴 엄격 해독(fatal)은 못 쓴다 — 파일에 EUC-KR 로 안 읽히는 글자가 몇 줄 있다(parseRoadNames 가 그 줄만 뺀다).
    return new TextDecoder("euc-kr").decode(firstZipEntry(zip));
  }
  throw new Error("주소정보누리집에 도로명 전체분 파일이 없다");
}

/** 오류 글에 키가 섞여 나가지 않게 — 원문·풀린 값·인코딩 값을 모두 가린 **뒤에** 자른다(경계에 걸친 조각도 안 샌다). */
const masked = (s: string) => [rawApiKey, apiKey, encodeURIComponent(apiKey)].reduce((t, k) => t.replaceAll(k, "***"), s).slice(0, 200);

/** 공단 상세조회(일반현황) 한 기관. 초당 한도·일시 오류는 쉬었다가 다시(최대 4번), 그래도 안 되면 던진다(부르는 쪽이 세고 넘어간다). */
async function fetchDetail(sym: string, pttn: string): Promise<LtcDetail | null | "quota"> {
  const q = new URLSearchParams({ serviceKey: apiKey, longTermAdminSym: sym, adminPttnCd: pttn });
  for (let attempt = 1; ; attempt++) {
    const t = await fetch(`${DETAIL}?${q}`, { signal: AbortSignal.timeout(30_000) })
      .then((r) => r.text())
      .catch((e: unknown) => String(e)); // 본문을 읽다 끊긴 것까지 여기서 받아 다시 시도한다
    const d = parseDetail(t, sym);
    if (d !== "retry") return d;
    if (attempt >= 4) throw new Error(`공단 상세조회 실패(${sym}): ${masked(t)}`);
    await wait(5_000 * attempt);
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
  //    총수 0 도 멈춘다 — 기관이 없는 시도는 없다(그대로 가면 --addresses 가 그 시도 행을 전부 '공단에 없음'으로 지나친다).
  if (first.total === 0 || got.length !== first.total) throw new Error(`${sd} ${LTC_SIDO[sd]}: 총 ${first.total}줄인데 ${got.length}줄을 받았다`);
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

/**
 * 📍 명부 행의 빈 주소 채우기(--addresses, 헤더 📍 참고).
 * 한도로 멈추면 이어 달리기 지점(--after)을 찍고, 한 바퀴를 다 돌면 그렇다고 알린다.
 * 🔴 오류로 던지고 멈추면(연달아 실패·저장 실패·API 이상) 커서를 찍지 않는다 — 그 지점부터 돌면 제대로 못 본 행을 건너뛴다.
 *    그때는 지난번 --after(없으면 처음)부터 다시 돌린다. 채운 행은 address=is.null 에서 빠지므로 다시 부르지 않는다.
 */
const fillAddresses = async (items: readonly LtcItem[]): Promise<void> => {
  const roads = parseRoadNames(await roadNameFile());
  // 🔴 형식·인코딩이 바뀌어도 '|'와 숫자 코드는 남아 개수만으로는 못 거른다 — 아는 도로 하나를 맞춰 본다(2026-09 파일 실측 17만 4천 개).
  if (roads.size < 100_000 || roads.get(TEST_ROAD.code) !== TEST_ROAD.name) {
    throw new Error(`도로명 파일 이상 — 도로 ${roads.size}개, 시험 도로 '${roads.get(TEST_ROAD.code)}'`);
  }
  const pttn = new Map<string, string>(); // 상세조회는 급여 종류 코드도 요구한다 — 기관의 아무 줄 하나
  for (const it of items) if (!pttn.has(it.longTermAdminSym.trim())) pttn.set(it.longTermAdminSym.trim(), it.adminPttnCd.trim());
  const canaryPttn = pttn.get(CANARY.sym);
  if (!canaryPttn) throw new Error(`시험 기관(${CANARY.sym})이 오늘 공단 명부에 없다 — 문을 닫았으면 CANARY 를 다른 기관으로 바꾼다`);
  const probe = await fetchDetail(CANARY.sym, canaryPttn);
  if (probe === "quota") { console.log("🔴 오늘 상세조회 한도가 이미 끝났다 — 내일 같은 명령을 다시 돌린다."); return; }
  const canary = probe ? ltcRowAddress(probe, roads, CANARY.region) : null;
  if (!canary || !("address" in canary) || canary.address !== CANARY.address) {
    throw new Error(`시험 기관 주소가 다르다(${JSON.stringify(canary)}) — 상세조회 API·도로명 파일을 확인한다(기관이 옮겼으면 CANARY 를 바꾼다)`);
  }
  const H = restHeaders(key);
  const todo = await fetchAllPages<{ id: string; ltc_code: string; region: string | null }>(url, H, "hospitals",
    `select=id,ltc_code,region&ltc_code=not.is.null&address=is.null${AFTER ? `&id=gt.${AFTER}` : ""}`, "id");
  console.log(`주소 빈 기관 ${todo.length}곳${AFTER ? `(${AFTER} 다음부터)` : ""} · 도로 ${roads.size}개`);
  const n = { filled: 0, gone: 0, noRoad: 0, otherArea: 0, failed: 0 };
  const writes: Promise<void>[] = [];
  let writeErr: unknown = null;
  let last = AFTER, failStreak = 0, quota = false;
  try {
    for (const h of APPLY ? todo : todo.slice(0, 5)) {
      const code = pttn.get(h.ltc_code);
      if (!code) { n.gone++; last = h.id; continue; } // 오늘 공단 명부에 없는 기관(폐업 등) — 부르지 않는다
      let d: LtcDetail | null | "quota";
      try {
        d = await fetchDetail(h.ltc_code, code);
        failStreak = 0;
      } catch (e) {
        if (++failStreak >= FAIL_STREAK) throw e;
        console.warn(`  건너뜀 — ${e instanceof Error ? e.message : String(e)}`);
        n.failed++;
        last = h.id;
        continue;
      }
      if (d === "quota") { quota = true; break; }
      last = h.id;
      if (!d) { n.gone++; continue; }
      const row = ltcRowAddress(d, roads, h.region);
      if ("miss" in row) { n[row.miss]++; continue; }
      n.filled++;
      if (!APPLY) { console.log(" ", h.ltc_code, row.address); continue; }
      // address=is.null — 그사이 관리자가 넣은 주소는 덮지 않는다. 실패는 모아 두었다가 묶음마다 확인한다.
      writes.push(fetch(`${url}/rest/v1/hospitals?id=eq.${h.id}&address=is.null`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ address: row.address }),
      }).then(async (r) => { if (!r.ok) throw new Error(`주소 저장 실패(${h.ltc_code}): ${r.status} ${await r.text()}`); })
        .catch((e: unknown) => { writeErr ??= e; }));
      if (writes.length >= WRITE_BATCH) {
        await Promise.all(writes.splice(0));
        if (writeErr) break;
      }
      if (n.filled % 1000 === 0) console.log(`  ${n.filled}곳 채움…`);
    }
  } finally {
    await Promise.all(writes);
    console.log(`주소 ${APPLY ? "채움" : "미리보기"} ${n.filled}곳 · 공단에 없음 ${n.gone}곳 · 도로 이름 못 맞춤 ${n.noRoad}곳` +
      ` · 동네 어긋남 ${n.otherArea}곳 · 조회 실패 ${n.failed}곳`);
    // 다른 오류로 던지는 중이어도 저장 실패는 따로 알린다(묻히면 어느 행이 안 들어갔는지 모른다).
    if (writeErr) console.error("🔴", writeErr instanceof Error ? writeErr.message : String(writeErr));
  }
  if (writeErr) throw writeErr;
  if (!APPLY) return;
  if (quota) {
    console.log(`🔴 오늘 상세조회 한도(1만 회)가 끝났다 — 내일 ${last ? `--after=${last} 를 붙여` : "같은 명령을"} 다시 돌리면 이어서 채운다.`);
  } else {
    console.log("한 바퀴를 다 돌았다 — 못 채운 곳은 --after 없이 다시 돌리면 그곳만 다시 시도한다.");
  }
};

if (ADDRESSES) await fillAddresses(items);
