import { test } from "node:test";
import assert from "node:assert/strict";
import { regionOfLocation } from "./jobRegion.ts";
import { SIDO_SIGUNGU } from "./koreaRegions.ts";

/**
 * 🔴 2026 행정구역 개편 신설구 — 다른 세션 보고서(REGION-WORKORDER-2026-08-12.md)가
 *    "koreaRegions 가 2024-02 기준이라 신설구를 못 고른다" 고 지적했다.
 *    우리는 FK 가 아니라 텍스트라 **등록이 막히지는 않지만**, 목록에 없으면 필터 칩에서 빠진다.
 *    행정구역은 해마다 바뀌므로, 새 구를 넣을 때마다 여기서 **주소 파싱과 목록이 함께** 맞는지 본다.
 */
const short = (sido: string) => sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "");
const inList = (sido: string | null, sigungu: string | null) =>
  !!sido && !!sigungu && (SIDO_SIGUNGU[short(sido)] ?? []).includes(sigungu);

test("인천 신설구 4개 — 주소가 파싱되고 목록에도 있다", () => {
  for (const [addr, gu] of [
    ["인천광역시 제물포구 우현로 100", "제물포구"],
    ["인천 영종구 공항로 1", "영종구"],
    ["인천 검단구 마전동 1", "검단구"],
    ["인천 서해구 연희동 2", "서해구"],
  ] as const) {
    const r = regionOfLocation(addr);
    assert.equal(r.sigungu, gu, `${addr} 파싱`);
    assert.ok(inList(r.sido, r.sigungu), `${gu} 가 koreaRegions 목록에 없다 — 필터 칩에서 빠진다`);
  }
});

/** 🔴 개편 전 이름을 **지우면 안 된다** — 그 이름으로 저장된 공고·이력서가 지역에서 사라진다. */
test("개편 전 인천 구 이름도 그대로 남아 있다", () => {
  for (const gu of ["중구", "동구", "서구"]) {
    assert.ok(SIDO_SIGUNGU["인천"].includes(gu), `인천 ${gu} 가 사라졌다`);
  }
});

test("화성 신설구는 2단 시군구로 잡힌다", () => {
  // 경기는 "수원시 팔달구" 처럼 2단으로 적는 것이 이 표의 규칙이다.
  const r = regionOfLocation("경기 화성시 동탄구 동탄원천로 338-7");
  assert.equal(r.sido, "경기도");
  assert.equal(r.sigungu, "화성시 동탄구");
  assert.ok(inList(r.sido, r.sigungu), "화성시 동탄구 가 목록에 없다");
});
