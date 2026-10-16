/**
 * 장기요양기관 명부 수집(import-ltc-facilities.ts)의 판정 부분 — 네트워크 없이 시험하려고 따로 둔다(_legacy-util 과 같은 이유).
 */
import { inflateRawSync } from "node:zlib";
import { LTC_KINDS, type LtcKind } from "../src/lib/jobTaxonomy.ts";
import { decodeEntities } from "../src/lib/html.ts";
import { regionOfLocation, sameArea } from "../src/lib/jobRegion.ts";

/** 공단 API(getLtcInsttSeachList02) 한 줄 — 같은 기관이 급여 종류마다 한 줄씩 온다. */
export type LtcItem = {
  adminNm: string;
  adminPttnCd: string;
  longTermAdminSym: string;
  siDoCd: string;
  siGunGuCd: string;
};

/** hospitals 에 넣을 한 행(기관 하나). 주소는 공단 검색 API 가 주지 않아 비운다 — 상세조회로 따로 채운다(--addresses). */
export type LtcRow = {
  ltc_code: string;
  name: string;
  region: string | null;
  cl_cd_nm: string;
  source: "public_data";
};

/**
 * 급여 종류 코드(adminPttnCd) → 이름. 공단이 코드표를 따로 주지 않아 **서울 6,063줄의 기관명으로 맞춰 본 규칙**이다(2026-10-16):
 *   B·C + 끝 숫자 1~6 = 방문요양·방문목욕·주야간보호·단기보호·방문간호·복지용구(B 재가노인복지시설, C 재가장기요양기관 — 하는 일은 같다)
 *   A04·S(…공동생활가정·○○요양원2) = 노인요양공동생활가정, 그 밖의 A·G·M(○○요양원·시립노인전문요양센터) = 노인요양시설,
 *   H(○○데이케어센터) = 주야간보호.
 * 모르는 코드는 null — 그 기관은 '장기요양기관'으로 싣는다(빠뜨리는 것보다 낫다).
 */
export function ltcKind(code: string): LtcKind | "복지용구" | null {
  const c = code.trim().toUpperCase();
  if (c === "A04" || c.startsWith("S")) return "노인요양공동생활가정";
  if (c.startsWith("A") || c.startsWith("G") || c.startsWith("M")) return "노인요양시설";
  if (c.startsWith("H")) return "주야간보호";
  if (c.startsWith("B") || c.startsWith("C")) {
    const byDigit = ["방문요양", "방문목욕", "주야간보호", "단기보호", "방문간호", "복지용구"] as const;
    return byDigit[Number(c.slice(1)) - 1] ?? null;
  }
  return null;
}

/** 이어 붙이는 순서 — 시설 먼저, 그다음 재가. 모르는 코드는 맨 뒤 '장기요양기관'. */
const ORDER: readonly string[] = [...LTC_KINDS, "장기요양기관"];

/**
 * 공단 시도 번호 → 명부 지역 표기의 시도(심사평가원 행과 같은 짧은 이름 — "서울 종로구", "전남광주 목포시").
 * 🔴 12 는 전남광주통합특별시(2026 통합). 광주(29)·전남(46)은 공단에 없다.
 */
export const LTC_SIDO: Readonly<Record<string, string>> = {
  "11": "서울", "12": "전남광주", "26": "부산", "27": "대구", "28": "인천", "30": "대전", "31": "울산", "36": "세종",
  "41": "경기", "43": "충북", "44": "충남", "47": "경북", "48": "경남", "50": "제주", "51": "강원", "52": "전북",
};

/** "서울 종로구". 시군구 이름이 비면(세종) 시도만, 시도를 모르면 null(틀린 지역보다 빈 지역). */
export function ltcRegion(siDoCd: string, siGunGuNm: string | undefined): string | null {
  const sido = LTC_SIDO[siDoCd];
  if (!sido) return null;
  const sgg = (siGunGuNm ?? "").trim();
  return sgg ? `${sido} ${sgg}` : sido;
}

const BROKEN = String.fromCharCode(0xfffd); // 해독 못 한 글자 자리(U+FFFD)

/**
 * zip 의 첫 파일 하나(도로명 전체분 zip 에는 TN_SPRD_RDNM.txt 하나뿐이다). 의존성을 늘리지 않으려고 중앙 디렉터리만 읽는다.
 * 오프셋은 zip 형식 그대로: 끝 레코드 +16 = 중앙 디렉터리 위치 / 중앙 항목 +10 압축 방식, +20 압축 크기, +42 로컬 헤더 위치 /
 * 로컬 헤더 30바이트 + 이름 길이(+26) + 부가 길이(+28) 다음이 데이터. 풀린 크기는 256MB 까지(실제 66MB — 압축 폭탄 방지).
 */
export function firstZipEntry(zip: Buffer): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("zip 의 끝 레코드가 없다");
  const cd = zip.readUInt32LE(end + 16);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + zip.readUInt32LE(cd + 20));
  return zip.readUInt16LE(cd + 10) === 8 ? inflateRawSync(data, { maxOutputLength: 256 << 20 }) : data;
}

/**
 * 행정안전부 도로명 파일(주소정보누리집 '도로명' 월 전체분 TN_SPRD_RDNM.txt, '|' 구분) → 도로명코드 12자리 → "시도 시군구 도로명".
 * 칸: 0 시군구코드(5) · 1 도로명번호(7) · 3 도로명 · 5 시도명 · 6 시군구명(세종은 빈칸).
 * 🔴 2026-09 파일에 EUC-KR 로 안 읽히는 글자가 18줄 있다(대부분 설명 칸, 도로명 1곳 '금천구?역중앙통로') —
 *    엄격 해독은 파일 전체를 버리게 되므로, 쓰는 칸에 깨진 글자(U+FFFD)가 든 줄만 뺀다(그 도로의 기관은 주소를 비워 둔다).
 */
export function parseRoadNames(txt: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const ln of txt.split(/\r?\n/)) {
    const f = ln.split("|");
    if (f.length < 7 || !/^\d{5}$/.test(f[0]) || !/^\d{7}$/.test(f[1])) continue;
    const [sido, sigungu, road] = [f[5], f[6], f[3]].map((s) => s.trim());
    if (!road || [sido, sigungu, road].some((s) => s.includes(BROKEN))) continue;
    m.set(f[0] + f[1], [sido, sigungu, road].filter(Boolean).join(" "));
  }
  return m;
}

/**
 * 공단 상세조회(일반현황)의 주소 조각 → "서울특별시 강북구 월계로 187"(심사평가원 행과 같은 모양, 동 이름은 없다).
 * 🔴 공단은 주소를 글자로 주지 않는다 — 도로명코드·건물번호만 준다. 도로 이름을 모르거나 번호가 이상하면 null(틀린 주소보다 빈 주소).
 * 🔴 공단의 '층'(fl)은 싣지 않는다 — 기관이 있는 층인지 건물 층수인지 설명서로 확인되지 않았다(틀린 층은 거짓 안내다).
 */
export function ltcAddress(road: string | undefined, mainNo: string, subNo: string): string | null {
  const main = Number(mainNo), sub = Number(subNo);
  if (!road || !Number.isInteger(main) || main <= 0) return null;
  const no = Number.isInteger(sub) && sub > 0 ? `${main}-${sub}` : `${main}`;
  return `${road} ${no}`;
}

/** XML 한 칸의 글자(엔티티를 풀어서). 없으면 "". */
export function xmlField(xml: string, tag: string): string {
  return decodeEntities(xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "");
}

export type LtcDetail = { road: string; main: string; sub: string };

/**
 * 공단 상세조회(일반현황) 응답 한 통 → 주소 조각 / null(기관 없음) / "quota"(오늘 한도 끝) / "retry"(잠깐 뒤 다시).
 * - 00 인데 item 이 없으면 기관이 없다(실측: 없는 기관은 00 + 빈 body). 03(NODATA)도 같다.
 * - 🔴 item 의 기관기호가 요청한 것과 다르면 null — API 가 변수를 무시하고 엉뚱한 기관을 주면 같은 주소가 대량으로 들어간다.
 * - 사유 코드 22(LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS) = 하루 한도. 초당 한도(23)·일시 오류·네트워크 실패는 "retry".
 */
export function parseDetail(xml: string, sym: string): LtcDetail | null | "quota" | "retry" {
  const code = xmlField(xml, "resultCode");
  if (code === "00" || code === "03") {
    const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
    if (!item || xmlField(item, "longTermAdminSym").trim() !== sym) return null;
    return { road: xmlField(item, "roadNmCd").trim(), main: xmlField(item, "gunmulMlno").trim(), sub: xmlField(item, "gunmulSlno").trim() };
  }
  // 새 게이트웨이는 한도를 평문("API token quota exceeded")으로 주기도 한다(미실측 — 놓치면 연속 실패로 멈출 뿐이라 함께 받는다).
  const quota = code === "22" || xmlField(xml, "returnReasonCode") === "22" ||
    xml.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS") || /quota exceeded/i.test(xml);
  return quota ? "quota" : "retry";
}

/**
 * 상세조회 주소 조각 + 명부 지역 → 실을 주소, 또는 못 싣는 까닭.
 * 🔴 명부 지역(공단 시군구)과 다른 동네면 싣지 않는다(옛 도로코드·자료 어긋남) — 틀린 동네보다 빈 주소.
 *    시군구까지 본다(전남광주는 한 시도라 시도만 보면 광주↔전남 어긋남을 못 거른다). 표본 60곳 중 59곳 일치·1곳 주소 없음(2026-10-16).
 */
export function ltcRowAddress(
  d: LtcDetail,
  roads: ReadonlyMap<string, string>,
  region: string | null,
): { address: string } | { miss: "noRoad" | "otherArea" } {
  const address = ltcAddress(roads.get(d.road), d.main, d.sub);
  if (!address) return { miss: "noRoad" };
  return sameArea(regionOfLocation(address), regionOfLocation(region)) ? { address } : { miss: "otherArea" };
}

/**
 * 줄들 → 기관별 한 행. 기관기호로 합치고 급여 종류를 ORDER 순서로 '·' 로 이어 붙인다.
 * 🔴 복지용구만 하는 곳은 뺀다(돌봄 인력을 뽑는 곳이 아니다). 복지용구를 **함께** 하는 곳은 그 종류만 빼고 싣는다.
 */
export function mergeLtc(
  items: readonly LtcItem[],
  sigunguName: (siDoCd: string, siGunGuCd: string) => string | undefined,
): LtcRow[] {
  const byCode = new Map<string, { name: string; siDoCd: string; siGunGuCd: string; kinds: Set<string> }>();
  for (const it of items) {
    const code = it.longTermAdminSym.trim();
    const name = it.adminNm.trim();
    if (!code || !name) continue;
    const e = byCode.get(code) ?? { name, siDoCd: it.siDoCd, siGunGuCd: it.siGunGuCd, kinds: new Set<string>() };
    e.kinds.add(ltcKind(it.adminPttnCd) ?? "장기요양기관");
    byCode.set(code, e);
  }
  const out: LtcRow[] = [];
  for (const [code, e] of byCode) {
    const kinds = ORDER.filter((k) => e.kinds.has(k));
    if (kinds.length === 0) continue; // 복지용구만
    out.push({
      ltc_code: code,
      name: e.name,
      region: ltcRegion(e.siDoCd, sigunguName(e.siDoCd, e.siGunGuCd)),
      cl_cd_nm: kinds.join("·"),
      source: "public_data",
    });
  }
  return out;
}
