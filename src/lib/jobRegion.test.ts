import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalSido, regionOfLocation, sameArea, streetOfLocation } from "./jobRegion.ts";
import { SIDO_SIGUNGU } from "./koreaRegions.ts";

test("워크넷 region 형('경기 성남시') — 축약 시도 흡수 + 시군구", () => {
  assert.deepEqual(regionOfLocation("경기 성남시"), { sido: "경기도", sigungu: "성남시" });
});

test("워크넷 전남광주 통합 토큰 — 병합 캐노니컬 + 시군구 보존", () => {
  assert.deepEqual(regionOfLocation("전남광주 목포시"), { sido: "전남광주통합특별시", sigungu: "목포시" });
  assert.deepEqual(regionOfLocation("전남광주 북구"), { sido: "전남광주통합특별시", sigungu: "북구" });
});

test("같은 시도 안에서 한 시군구의 첫 단어로 시작하는 다른 시군구가 없다 — 공고 옆 '같은 지역' 목록의 접두 일치(getJobs city)가 기대는 성질", () => {
  // 공고의 시도는 canonicalSido 로 모은 값이다 — 광주·전남은 한 시도(전남광주통합특별시)로 합쳐 본다.
  const bySido = new Map<string, string[]>();
  for (const [name, list] of Object.entries(SIDO_SIGUNGU)) {
    const key = canonicalSido(name) ?? name;
    bySido.set(key, [...(bySido.get(key) ?? []), ...list]);
  }
  for (const [sido, list] of bySido) {
    const cities = new Set(list.map((s) => s.split(" ")[0]));
    for (const city of cities) {
      const strays = list.filter((s) => s.startsWith(city) && s.split(" ")[0] !== city);
      assert.deepEqual(strays, [], `${sido} ${city}`);
    }
  }
});

test("검색엔진 주소의 도로명 칸 — 시도·시군구 단어를 뺀 나머지, 시도를 못 읽으면 원문", () => {
  assert.equal(streetOfLocation("서울특별시 강북구 월계로 187"), "월계로 187");
  assert.equal(streetOfLocation("경기도 성남시 분당구 대왕판교로 1"), "대왕판교로 1", "2단 시군구는 두 단어를 뺀다");
  assert.equal(streetOfLocation("세종특별자치시 한누리대로 90-3"), "한누리대로 90-3", "세종은 시군구가 없다");
  assert.equal(streetOfLocation("서울 강북구"), null, "워크넷 지역만 있는 공고");
  assert.equal(streetOfLocation("본원 3층"), "본원 3층", "시도를 못 읽으면 원문");
  assert.equal(streetOfLocation(null), null);
});

test("직접등록 주소형 — 2단 시군구('구' 결합) / 단일 시군구", () => {
  assert.deepEqual(regionOfLocation("경기도 성남시 분당구 대왕판교로"), { sido: "경기도", sigungu: "성남시 분당구" });
  assert.deepEqual(regionOfLocation("서울특별시 강남구 테헤란로 123"), { sido: "서울특별시", sigungu: "강남구" });
});

test("세종 — 시군구 없는 2단계 지역", () => {
  assert.deepEqual(regionOfLocation("세종특별자치시 전의면"), { sido: "세종특별자치시", sigungu: null });
});

test("목록 밖 값·빈 값 — 미승격(null)", () => {
  assert.deepEqual(regionOfLocation("테스트 주소(실제 병원 아님)"), { sido: null, sigungu: null });
  assert.deepEqual(regionOfLocation(null), { sido: null, sigungu: null });
});

test("같은 동네 — 기관 직접 등록의 사칭 검사 기준(표기 차이는 같은 동네, 다른 구·다른 시는 다른 동네)", () => {
  const r = regionOfLocation;
  assert.equal(sameArea(r("서울 종로구"), r("서울특별시 종로구 종로 1")), true, "공단 표기 ↔ 직접 등록 주소");
  assert.equal(sameArea(r("서울 종로구"), r("서울 중구")), false);
  assert.equal(sameArea(r("경기도 부천시 길주로 1"), r("경기도 부천시 원미구 길주로 1")), true, "구가 생기기 전 주소");
  assert.equal(sameArea(r("경기 성남시 수정구"), r("경기도 성남시 분당구 구미로 1")), false, "같은 시의 다른 구");
  assert.equal(sameArea(r("경기도 광주시 1"), r("경기도 광명시 1")), false);
  assert.equal(sameArea(r("인천"), r("인천광역시 제물포구 1")), true, "한쪽 시군구를 모르면 시·도만 본다");
  assert.equal(sameArea(r("서울 종로구"), r("부산 중구")), false);
  assert.equal(sameArea(r(null), r("서울 종로구")), false, "지역을 모르는 행은 같은 동네로 치지 않는다");
});
