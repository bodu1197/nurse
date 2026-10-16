import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalSido, cleanAddress, isFullAddress, regionLabelOf, regionOfLocation, sameArea, streetOfLocation, workplaceOf } from "./jobRegion.ts";
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

test("명부 주소의 빈 자리 — 부번 0·빈 동층호·빈 괄호·매달린 쉼표를 걷어낸다(심사평가원 원문 그대로의 예)", () => {
  for (const [raw, clean] of [
    ["제주특별자치도 제주시 아란13길 15-0,  0동 0층 0호 (아라일동,제주대학교병원)", "제주특별자치도 제주시 아란13길 15, (아라일동,제주대학교병원)"],
    ["대전광역시 중구 문화로 282- , (대사동)", "대전광역시 중구 문화로 282, (대사동)"],
    ["강원특별자치도 정선군 정선읍 봉양1길 145-0,", "강원특별자치도 정선군 정선읍 봉양1길 145"],
    ["경기도 광주시 오포읍 양벌로 327, ()", "경기도 광주시 오포읍 양벌로 327"],
    ["경기도 고양시 덕양구  호국로 804, (성사동)", "경기도 고양시 덕양구 호국로 804, (성사동)"],
    ["강원특별자치도 태백시 보드미길 8-0,  4층 (장성동,근로복지공단태백요양병원)", "강원특별자치도 태백시 보드미길 8, 4층 (장성동,근로복지공단태백요양병원)"],
    ["세종특별자치시  봉산로 74", "세종특별자치시 봉산로 74"],
    ["경기도 김포시 김포한강8로 382, ,10층", "경기도 김포시 김포한강8로 382, 10층"],
  ]) assert.equal(cleanAddress(raw), clean, raw);
  // 뜻 있는 0 은 그대로 — 부번 10·105, 10층, 제10호
  for (const keep of ["부산광역시 해운대구 센텀로 30-10, (우동)", "서울특별시 중구 세종대로 110-105, 10층 제10호", "인천광역시 미추홀구 인주대로 138, 인천보훈병원 지(1,2),1~7층 (용현동)"]) {
    assert.equal(cleanAddress(keep), keep);
  }
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

test("워크넷 근무지 글자 — 도로명 주소 + 상세 주소, 상세가 없으면 도로명만, 도로명이 없으면 지역", () => {
  assert.equal(workplaceOf({ addr: "인천광역시 검단구 고산로45번길 18", detailAddr: "온누리노인요양원", region: "인천 검단구" }),
    "인천광역시 검단구 고산로45번길 18, 온누리노인요양원");
  assert.equal(workplaceOf({ addr: "인천광역시 연수구 청량로 51", detailAddr: "", region: "인천 연수구" }), "인천광역시 연수구 청량로 51");
  assert.equal(workplaceOf({ addr: "", detailAddr: "3층", region: "경기 성남시 수정구" }), "경기 성남시 수정구", "도로명 없이 상세만 있으면 주소가 아니다 — 지역");
  assert.equal(workplaceOf({ addr: " ", detailAddr: "", region: "경기 성남시 수정구" }), "경기 성남시 수정구", "주소가 없으면 종전처럼 지역");
  assert.equal(workplaceOf({ addr: "", detailAddr: "", region: "" }), null);
  // 🔴 집 호수는 뺀다 — 방문요양 근무지(어르신 댁)가 특정되지 않게. 건물 이름·층·동네 이름은 싣는다.
  const road = "경기도 성남시 수정구 수정로 115-1";
  for (const unit of ["101동 1203호", "1203호", "1203호실", "１２０３호", "101동", "3동", "B동 203호", "가동 203호", "A호", "나호", "2세대", "101-1203", "1203", "301", "B1"]) {
    assert.equal(workplaceOf({ addr: road, detailAddr: unit, region: "" }), road, `집 호수 '${unit}' 은 뺀다`);
  }
  for (const ok of ["이편한세상", "성서주공1단지아파트", "3층", "13층", "부평동", "지하철 3호선 근처", "7번 출구 앞", "농협 뒤 쪽", "호수공원 앞", "신세대빌딩 2층", "동대문시장 옆", "2차 상가"]) {
    assert.equal(workplaceOf({ addr: road, detailAddr: ok, region: "" }), `${road}, ${ok}`, `'${ok}' 은 싣는다`);
  }
  // 호수·숫자만 지우고 나머지는 남긴다 — '호' 없이 적은 호수("OO빌라 302")도 지운다
  for (const [input, kept] of [["3층 301호", "3층"], ["이편한세상 101동 1203호", "이편한세상"], ["OO아파트101동1203", "OO아파트"], ["OO빌라 302", "OO빌라"],
    ["주공아파트 103-1102", "주공아파트"], ["에이동 203", "에이동"], ["2단지 103동", "2단지"], ["본관 2층 201호", "본관 2층"],
    ["OO빌라 302 차량진입불가", "OO빌라 차량진입불가"], ["302 층간소음 주의", "층간소음 주의"],
    [",10층", "10층"], ["탑빌딩 , ,7층", "탑빌딩, 7층"], ["OO빌딩 (101호)", "OO빌딩"]]) {
    assert.equal(workplaceOf({ addr: road, detailAddr: input, region: "" }), `${road}, ${kept}`, `'${input}' → '${kept}'`);
  }
  for (const junk of [".", "..", " - ", "·"]) assert.equal(workplaceOf({ addr: road, detailAddr: junk, region: "" }), road, `잡값 '${junk}' 은 뺀다`);
  // 요양·간병 공고는 상세 칸을 아예 싣지 않는다(어르신 댁)
  assert.equal(workplaceOf({ addr: road, detailAddr: "이편한세상 3층", region: "" }, { withDetail: false }), road);
  assert.equal(workplaceOf({ addr: "", detailAddr: "이편한세상", region: "경기 성남시 수정구" }, { withDetail: false }), "경기 성남시 수정구");
  assert.equal(regionLabelOf({ location: "경기도 성남시 수정구 수정로 115-1, 3층" }), "경기도 성남시 수정구");
  assert.equal(regionLabelOf({ location: "경기도 화성시 동탄대로 1", sido: "경기도", sigungu: "화성시 동탄구" }), "경기도 화성시 동탄구", "저장된 정규화 값이 먼저다(신설 구)");
  assert.equal(regionLabelOf({ location: "세종특별자치시 한누리대로 90-3", sido: "세종특별자치시", sigungu: null }), "세종특별자치시");
  assert.equal(regionLabelOf({ location: "본원 3층", sido: null }), "본원 3층", "시도를 못 읽으면 원문");
  assert.equal(regionLabelOf({ location: null }), null);
  // 도로명까지 든 주소인가(sync-ats 가 옛 '지역만' 저장값을 명부 주소로 바꿀지 판단)
  for (const full of ["서울특별시 양천구 목동서로 161, (목동)", "세종특별자치시 전의면 산단길 1", "경기도 성남시 수정구 고등로 57"]) assert.equal(isFullAddress(full), true, full);
  for (const not of ["서울특별시 양천구", "서울 양천구", "세종특별자치시", "본원 3층", "(04564) 서울특별시 중구 1", "", null, undefined]) assert.equal(isFullAddress(not), false, String(not));
  // 저장된 값은 지역 정규화·검색엔진 주소 분해가 그대로 먹어야 한다
  const loc = workplaceOf({ addr: "경기도 성남시 수정구 수정로 115-1", detailAddr: "3층", region: "경기 성남시 수정구" });
  assert.deepEqual(regionOfLocation(loc), { sido: "경기도", sigungu: "성남시 수정구" });
  assert.equal(streetOfLocation(loc), "수정로 115-1, 3층");
});
