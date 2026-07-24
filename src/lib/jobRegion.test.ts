import { test } from "node:test";
import assert from "node:assert/strict";
import { regionOfLocation } from "./jobRegion.ts";

test("워크넷 region 형('경기 성남시') — 축약 시도 흡수 + 시군구", () => {
  assert.deepEqual(regionOfLocation("경기 성남시"), { sido: "경기도", sigungu: "성남시" });
});

test("워크넷 전남광주 통합 토큰 — 병합 캐노니컬 + 시군구 보존", () => {
  assert.deepEqual(regionOfLocation("전남광주 목포시"), { sido: "전남광주통합특별시", sigungu: "목포시" });
  assert.deepEqual(regionOfLocation("전남광주 북구"), { sido: "전남광주통합특별시", sigungu: "북구" });
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
