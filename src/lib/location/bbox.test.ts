import { test } from "node:test";
import assert from "node:assert/strict";
import { nearBox } from "./bbox.ts";

test("내 주변 box — 서울 위도에서 10km 는 위도 ±0.0898도, 경도 ±0.1132도(경도가 cos 보정으로 더 넓다)", () => {
  const b = nearBox({ lat: 37.5, lng: 127, radiusM: 10_000 });
  assert.ok(Math.abs(b.latMax - 37.5 - 0.0898) < 0.001, `위도 폭 ${b.latMax - 37.5}`);
  assert.ok(Math.abs(37.5 - b.latMin - 0.0898) < 0.001);
  assert.ok(Math.abs(b.lngMax - 127 - 0.1132) < 0.001, `경도 폭 ${b.lngMax - 127}`);
  assert.ok(b.lngMax - 127 > b.latMax - 37.5, "경도 폭이 위도 폭보다 넓어야 한다");
});
