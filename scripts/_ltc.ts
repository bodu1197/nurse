/**
 * 장기요양기관 명부 수집(import-ltc-facilities.ts)의 판정 부분 — 네트워크 없이 시험하려고 따로 둔다(_legacy-util 과 같은 이유).
 */
import { LTC_KINDS, type LtcKind } from "../src/lib/jobTaxonomy.ts";

/** 공단 API(getLtcInsttSeachList02) 한 줄 — 같은 기관이 급여 종류마다 한 줄씩 온다. */
export type LtcItem = {
  adminNm: string;
  adminPttnCd: string;
  longTermAdminSym: string;
  siDoCd: string;
  siGunGuCd: string;
};

/** hospitals 에 넣을 한 행(기관 하나). 주소는 공단 검색 API 가 주지 않아 비운다. */
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
