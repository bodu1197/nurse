// 🗂 채용 지역 정규화 — **ingest 시점에** 한 번 계산해 jobs.sido/sigungu 에 넣는다.
// dolpagu(talent) src/lib/jobs/region.ts 이식. nurse 는 지역 원천이 jobs.location 하나뿐이라
// (워크넷 region "경기 성남시" 또는 직접등록 주소) normalizeJobRegion(null, location) 한 형태로만 쓴다.
//
// 왜 필요한가: 워크넷 location 은 축약·표기 혼재('경기' vs '경기도')라 부분일치 필터·집계가 갈린다.
// 화면에서 접미만 떼는 건 표시 땜질이라 필터·집계가 여전히 갈린다 → 값 자체를 정규화해 저장한다.

export interface NormalizedRegion {
  sido: string | null; // canonical 시도(17종). 목록 밖 값은 미승격(null)
  sigungu: string | null; // canonical 시군구(세종 등 2단계 지역은 null 이 정상)
}

// 전남·광주 통합 캐노니컬 — 워크넷 '전남광주' 통합 토큰과 직접등록 광주/전남 주소가 모두 이 한 값으로 수렴한다.
// 상수로 묶어 타일 라벨·화이트리스트가 한 글자라도 어긋나면 승격이 조용히 실패하는 것을 막는다.
const MERGED_JN_GJ = "전남광주통합특별시";

// 축약·구 표기 → 정식명. Kakao/워크넷 축약('경기')과 파서 정식명('경기도')이 한 컬럼에 섞이지 않게 흡수.
// 1:1 개명만 담는다 — 1:N 분할(인천 '서구'→서해/검단/영종)은 오귀속이라 절대 넣지 않는다.
const SIDO_RENAME: Readonly<Record<string, string>> = {
  전라북도: "전북특별자치도", // 2024 개편
  강원도: "강원특별자치도", // 2023 개편
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
  // 🔴 전남·광주 통합 — 워크넷이 이 지역 location 을 "전남광주 목포시"처럼 **통합 시도 토큰**으로 준다
  //    (nurse 실측 27종/약 480건, dolpagu 와 동일 quirk). 광주(광역시 구)와 전남(시·군)이 같은 token[0]
  //    "전남광주"를 공유해 분리 불가라, dolpagu 처럼 한 캐노니컬 타일로 병합한다. 직접등록 주소의
  //    광주광역시/전라남도도 같은 타일로 수렴시켜 워크넷 글과 섞이지 않게 한다(표기 분열 방지).
  전남광주: MERGED_JN_GJ,
  전남: MERGED_JN_GJ,
  광주: MERGED_JN_GJ,
  전라남도: MERGED_JN_GJ,
  광주광역시: MERGED_JN_GJ,
};

// 🔴 현존 시도 화이트리스트(17종). location 은 워크넷뿐 아니라 인증 사용자 자유입력이라, 통과시키면
//    임의 문자열이 모든 방문자의 지역 팝업에 타일로 뜬다(공개 UI 오염). 목록 밖은 sido 로 승격하지 않는다
//    — 원문 location 컬럼은 그대로 남으므로 데이터 손실이 아니다.
const KNOWN_SIDO: ReadonlySet<string> = new Set([
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "대전광역시", "울산광역시",
  "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도",
  MERGED_JN_GJ, "경상북도", "경상남도", "제주특별자치도",
]);

/** 시도 표기 캐노니컬화 — 모든 원천이 이 함수를 통과해야 한 컬럼에 한 표기만 남는다. */
export function canonicalSido(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const named = SIDO_RENAME[t] ?? t;
  return KNOWN_SIDO.has(named) ? named : null;
}

// 세종은 시군구가 없는 2단계 지역. location 2토큰은 읍면동이라 시군구로 쓰면 틀린다.
const SIDO_WITHOUT_SIGUNGU = "세종특별자치시";

const tokens = (v: string | null | undefined): string[] => {
  const t = (v ?? "").trim().replace(/\s+/g, " ");
  return t ? t.split(" ") : [];
};

/**
 * location → canonical (sido, sigungu). nurse 는 rawLocation 하나만 쓴다.
 * 워크넷 region 형("경기 성남시")과 직접등록 주소형("서울특별시 강남구 …") 둘 다 정확히 처리한다.
 */
export function normalizeJobRegion(
  rawRegion: string | null | undefined,
  rawLocation: string | null | undefined,
): NormalizedRegion {
  const loc = tokens(rawLocation);
  const reg = tokens(rawRegion);
  // 시도: location 1토큰 우선(정식/축약 모두 canonicalSido 가 흡수), 없으면 region 1토큰 폴백.
  const sido = canonicalSido(loc[0]) ?? canonicalSido(reg[0]);
  if (sido === null) return { sido: null, sigungu: null };
  if (sido === SIDO_WITHOUT_SIGUNGU) return { sido, sigungu: null };

  // 시군구는 region 우선(2단 시군구 "성남시 분당구" 보존). region 없으면 location 폴백:
  // 3토큰째가 '구'면 2단 결합("성남시" + "분당구"), 아니면 2토큰째만.
  let sigungu: string | null = reg.length >= 2 ? reg.slice(1).join(" ") : null;
  if (!sigungu && loc.length >= 2) {
    sigungu = loc[2]?.endsWith("구") ? `${loc[1]} ${loc[2]}` : loc[1];
  }
  return { sido, sigungu: sigungu || null };
}

// 집 호수 토큰 — "101동"·"아파트101동"·"1203호"·"1203호실"·"3세대", 글자 하나짜리 동 "B동"·"가동". 뒤에 한글이 이어지는 "동대문"·"3호선",
// 앞에 글자가 붙은 "부평동"은 아니다. (둘째 갈래의 괄호 1은 앞 글자 보존용 — 지울 때 "$1" 로 되돌린다.)
const UNIT_TOKEN = /\d+\s*(?:동|호(?:실)?|세대)(?![가-힣])|(^|[^가-힣A-Za-z0-9])[A-Za-z가-힣]\s*(?:동|호)(?![가-힣])/g;
// 호 없이 적은 집 호수("OO빌라 302"·"주공아파트 103-1102"·"B1") — 뜻이 있는 숫자(3층·2단지·3호선·7번 출구·2차, 붙여 쓴 것만)만 남기고
// 숫자 덩어리는 다 지운다. 과잉 삭제("365열린의원"→"열린의원")는 표시가 어색해질 뿐이라 집 호수가 새는 쪽보다 낫다.
const BARE_NUMBER = /[A-Za-z]?\d+(?:\s*[-/]\s*\d+)*(?!\d|층|단지|호선|번|차)/g;

/**
 * 워크넷 수집 공고의 jobs.location(화면 근무지) — 도로명 주소 + 상세 주소("인천광역시 검단구 고산로45번길 18, 온누리노인요양원"),
 * 주소가 없으면 지역("인천 검단구"). 심사평가원 명부 주소와 같은 꼴(", " 뒤에 상세)이라 한 칸에 섞여도 화면·검색엔진 주소 분해가 같다.
 * 🔴 종전에는 지역만 저장해, 좌표(내 주변)는 건물 단위인데 글자는 구까지만 나왔다(오너 지적 2026-10-16 "API 는 상세 주소를 준다").
 *    도로명이 없으면 상세("3층"·건물 이름)만으로는 주소가 아니다 — 지역으로 돌아간다.
 * 🔴 상세 주소는 자유 입력이다(실측 365건 중 252건에 있고, 그중 35건이 "101동 1203호" 꼴). 집 호수가 공개 화면·검색엔진에 나가면
 *    사는 집이 특정된다 — 동·호·세대와 뜻 없는 숫자 덩어리를 지우고 남는 글자(건물 이름·층)만 싣는다. 글자(한글·영문)가 안 남으면
 *    ("101-1203"·"1203"·".") 상세를 통째로 뺀다.
 * 🔴 요양·간병 공고(withDetail=false)는 상세 칸을 아예 싣지 않는다 — 방문요양·입주간병은 근무지가 **어르신 댁**이라 건물 이름만으로도
 *    취약한 노인의 자택이 좁혀진다(검증 지적 2026-10-16). 도로명 주소(고용24 에 이미 공개)와 좌표(내 주변)는 그대로다.
 */
export function workplaceOf(j: { addr: string; detailAddr: string; region: string }, { withDetail = true } = {}): string | null {
  const road = cleanAddress(j.addr);
  if (!road) return j.region.trim() || null;
  if (!withDetail) return road;
  const detail = j.detailAddr.normalize("NFKC").replace(UNIT_TOKEN, "$1").replace(BARE_NUMBER, " ").replace(/\s+/g, " ").trim();
  // 숫자를 지운 자리에 남는 쉼표·빈 괄호(",10층" → ", ,10층" · "OO빌딩 (101호)" → "OO빌딩 ()")까지 합친 글자째 걷어낸다.
  return cleanAddress(/[가-힣A-Za-z]/.test(detail) ? `${road}, ${detail}` : road);
}

/**
 * 주소 글자의 빈 자리 걷어내기 — 심사평가원 명부는 빈 칸을 0·빈 괄호로 채워 보낸다(2026-10-17 실측 약 1,000곳):
 * "아란13길 15-0,  0동 0층 0호 (아라일동)" → "아란13길 15, (아라일동)" · "문화로 282- , (대사동)" → "문화로 282, (대사동)" · "양벌로 327, ()" → "양벌로 327".
 * 건물 부번 0("-0")은 '부번 없음'이다. 근무지를 주소 글자로 싣고부터(2026-10-16) 카드·상세·검색엔진에 깨진 주소처럼 나갔다.
 */
export const cleanAddress = (s: string): string => s
  .replace(/\(\s*\)/g, "")
  .replace(/(^|[\s,])0\s*(?:동|층|호)(?=[\s,(]|$)/g, "$1")
  .replace(/(\d)-0(?!\d)/g, "$1")
  .replace(/(\d)-\s*(?=,|$)/g, "$1")
  .replace(/,(?:\s*,)+\s*/g, ", ")
  .replace(/\s+/g, " ")
  .replace(/\s+,/g, ",")
  .replace(/,\s*$/, "")
  .trim();

/** 도로명(또는 번지)까지 든 주소인가 — 시도·시군구뿐인 글자("서울특별시 양천구"·"서울 양천구")나 시도를 못 읽는 글자는 아니다. */
export const isFullAddress = (s: string | null | undefined): s is string => !!s && !!regionOfLocation(s).sido && !!streetOfLocation(s);

type JobPlace = { location: string | null; sido?: string | null; sigungu?: string | null };

/** 공고의 정규화 지역 — 저장된 값(jobs.sido/sigungu, 필터·RPC 와 같은 값)을 먼저, 없으면 근무지 글자에서(옛 행·등록 폼 초안). */
export function regionOfJob(j: JobPlace): NormalizedRegion {
  return j.sido ? { sido: j.sido, sigungu: j.sigungu ?? null } : regionOfLocation(j.location);
}

/** 공고의 짧은 지역 "경기도 성남시 수정구"(머리글·옆 목록용). 시도를 못 읽는 글자(자유 입력)는 그대로. */
export function regionLabelOf(j: JobPlace): string | null {
  const { sido, sigungu } = regionOfJob(j);
  return sido ? [sido, sigungu].filter(Boolean).join(" ") : j.location;
}

/** nurse 편의 래퍼 — jobs.location 하나에서 (sido, sigungu) 산출. ingest·백필이 같은 값을 내도록 단일 경로. */
export function regionOfLocation(location: string | null | undefined): NormalizedRegion {
  return normalizeJobRegion(null, location);
}

/**
 * 위치 글자에서 시도·시군구 단어를 뺀 나머지(도로명·번호) — 검색엔진 주소(streetAddress)용.
 * 시도를 못 읽으면("서울시 …"·자유 입력) 원문 그대로 돌려준다 — 지역 칸을 못 채워도 위치가 통째로 사라지지 않게.
 */
export function streetOfLocation(location: string | null | undefined): string | null {
  const { sido, sigungu } = regionOfLocation(location);
  const words = tokens(location);
  return (sido ? words.slice(1 + (sigungu?.split(" ").length ?? 0)) : words).join(" ") || null;
}

/**
 * 두 지역이 **같은 동네**인가 — 시·도가 같고, 양쪽 다 시·군·구가 있으면 그것도 같다(표기 차이는 흡수한다).
 * 사업자 인증 화면의 기관 직접 등록이 '같은 동네·같은 이름의 남의 기관'을 막을 때 쓴다(사칭 방지, app/mypage/actions).
 * 시·군·구는 띄어쓰기와 '시'를 빼고 앞부분이 겹치면 같다고 본다 — "부천시"(구가 생기기 전 주소)와 "부천시 원미구",
 * "성남분당구"(심사평가원 표기)와 "성남시 분당구"가 같은 동네다. 한쪽 시·군·구가 비면 시·도만 본다(모르면 막는 쪽이 안전).
 * 시·도를 모르면 같다고 하지 않는다 — 지역을 모르는 동명 행 하나가 전국의 같은 이름 등록을 다 막으면 안 된다.
 */
export function sameArea(a: NormalizedRegion, b: NormalizedRegion): boolean {
  if (!a.sido || a.sido !== b.sido) return false;
  if (!a.sigungu || !b.sigungu) return true;
  const n = (s: string) => s.replace(/\s+/g, "").replace(/시(?=.+구$)/, "").replace(/시$/, "");
  const x = n(a.sigungu);
  const y = n(b.sigungu);
  return x.startsWith(y) || y.startsWith(x);
}
