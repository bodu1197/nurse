// 🔴 `server-only` 를 안 붙인다 — 응답 파싱(toRows)이 Node 시험에서 돌아야 한다
//    (붙이면 ERR_MODULE_NOT_FOUND). 이 파일에는 비밀이 없고 API 키는 부르는 쪽이 넘긴다.
//    import 하는 곳은 Route Handler 두 곳과 자체 시험뿐이라 클라이언트 번들에 들어가지 않는다
//    (hospitalRegistry.ts 와 같은 이유).

/**
 * 🏥 심사평가원(HIRA) 병원정보서비스 — 병원 명부의 원천.
 *
 * ⏰ **자동 크론이 없다.** 종전에는 매일 03:00 에 8만 건을 통째로 다시 받았다(41페이지·약 3분).
 *    병원은 매일 개원하지 않는다 — 어제와 똑같은 8만 행을 하루 한 번 다시 쓰는 낭비라
 *    크론을 없앴다(오너 지시 2026-08-14). 명부는 이제 **필요할 때만** 채워진다:
 *      ① 병원 검색(/api/hospitals/search)이 명부에서 **못 찾았을 때** 그 이름만 물어본다.
 *         신규 개원 병원은 누군가 찾는 순간 들어온다 — 종전에는 크론을 최대 24시간 기다렸다.
 *      ② 관리자가 전건을 다시 받고 싶을 때 /api/cron/sync-hospitals 를 손으로 부른다.
 */

const HIRA = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";

/** hospitals 테이블에 그대로 넣는 모양(upsert 는 ykiho 충돌 기준). */
export type HospitalRow = {
  ykiho: string;
  name: string;
  address: string | null;
  region: string | null;
  cl_cd_nm: string | null;
  /**
   * 🔴 반드시 박는다. 안 넣으면 컬럼 기본값이 `'direct'`(직접등록)라 **명부에서 받은 병원이
   *    "직접등록" 으로 들어간다.** upsert 는 기존 행을 UPDATE 할 때 source 를 안 건드려서
   *    티가 안 났고, 실제로 464곳이 그렇게 잘못 박혀 있었다(2026-08-14 발견·교정).
   */
  source: "public_data";
};

// clCdNm = 종별("상급종합"·"종합병원"·"병원"·"요양병원"·"의원"…). 공고의 기관 종별을 여기서 가져온다 —
// 워크넷 산업분류(KSIC)에는 '상급종합' 이라는 개념이 없어 그 칩이 영원히 0건이었다(20260811180000).
type Item = { ykiho?: string; yadmNm?: string; addr?: string; sidoCdNm?: string; sgguCdNm?: string; clCdNm?: string };

export type FetchOpts = {
  pageNo?: number;
  numOfRows?: number;
  /**
   * 기관명 **부분 일치** 검색. 실측(2026-08-14): `yadmNm=서울아산병원` → 정식 명칭
   * "재단법인아산사회복지재단 서울아산병원" 이 걸린다. 왕복은 5~10초로 느리다.
   */
  yadmNm?: string;
  /**
   * 응답 예산. 전건 수집은 30초(동시 12개일 때 페이지당 8~19초 실측),
   * 사용자가 기다리는 이름 검색은 더 짧게 준다.
   */
  timeoutMs?: number;
  /** 한 번 실패했을 때 다시 시도할지. 사용자가 기다리는 길에서는 끈다(대기가 두 배가 된다). */
  retry?: boolean;
};

/**
 * 한 페이지를 받는다. 실패하면 **한 번만** 다시 시도한다 —
 * 잠깐 흔들렸다고 실행을 통째로 버리지 않되, 무한히 매달리지도 않는다.
 */
export async function fetchHospitals(
  key: string,
  opts: FetchOpts = {},
  attempt = 1,
): Promise<{ rows: HospitalRow[]; total: number }> {
  const { pageNo = 1, numOfRows = 2000, yadmNm, timeoutMs = 30000, retry = true } = opts;
  const qs = new URLSearchParams({
    serviceKey: key,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    _type: "json",
  });
  if (yadmNm) qs.set("yadmNm", yadmNm);

  const res = await fetch(`${HIRA}?${qs}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  if ((!res || !res.ok) && retry && attempt === 1) return fetchHospitals(key, opts, 2);
  if (!res || !res.ok) throw new Error(`HIRA page ${pageNo} fetch failed`);

  const json = await res.json();
  // 🔴 HIRA 는 **일일 한도 초과·키 오류에도 HTTP 200** 을 준다. resultCode 를 안 보면 그 응답이
  //    "그런 병원 없음" 과 구별되지 않는다 — 그러면 크론은 0건 upsert 를 성공으로 기록하고,
  //    검색은 멀쩡한 병원 이름을 "없음" 으로 캐시해 버린다. 여기서 끊어 부르는 쪽이 알게 한다.
  const code = json?.response?.header?.resultCode;
  if (code && code !== "00") {
    throw new Error(`HIRA ${code}: ${json?.response?.header?.resultMsg ?? "알 수 없는 오류"}`);
  }
  const body = json?.response?.body;
  return { rows: toRows(body?.items?.item), total: Number(body?.totalCount ?? 0) };
}

/** 명부에 넣을 수 있는 항목인가 — ykiho(열쇠)와 이름이 **문자열로** 있어야 한다. */
const usable = (it: Item): it is Item & { ykiho: string; yadmNm: string } =>
  typeof it.ykiho === "string" && it.ykiho !== "" && typeof it.yadmNm === "string" && it.yadmNm !== "";

/**
 * 응답의 items.item → 테이블 행.
 * 🔴 결과가 **하나뿐이면 배열이 아니라 객체**로 온다. 이름 검색은 대부분 이 경우라
 *    이걸 놓치면 신규 병원이 영원히 안 들어온다 — 그래서 여기만 따로 시험한다(hira.test.ts).
 * 🔴 `as` 단언을 쓰지 않는다(프로젝트 규칙: as const 만 허용). 위 타입가드가 좁혀 주므로
 *    외부 JSON 이 숫자·null 을 보내도 여기서 걸러진다 — 서비스롤로 넣는 값이라 더 그래야 한다.
 */
export function toRows(raw: unknown): HospitalRow[] {
  const items: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items
    .filter((it): it is Item => typeof it === "object" && it !== null)
    .filter(usable)
    .map((it) => ({
      ykiho: it.ykiho,
      name: it.yadmNm,
      address: typeof it.addr === "string" ? it.addr : null,
      region: [it.sidoCdNm, it.sgguCdNm].filter((s) => typeof s === "string" && s).join(" ") || null,
      cl_cd_nm: typeof it.clCdNm === "string" ? it.clCdNm.trim() || null : null,
      source: "public_data" as const,
    }));
}
