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
