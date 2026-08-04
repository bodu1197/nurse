import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canMatch,
  candidateSidos,
  desiredRegions,
  evaluateMatch,
  matchAxes,
  normalizedEmployment,
  shortSidos,
  talentSpecialtyFilter,
  yearlyKrw,
  type JobFacts,
  type SeekerProfile,
} from "./match.ts";

const seeker = (o: Partial<SeekerProfile> = {}): SeekerProfile => ({
  desired_location: "서울 종로구",
  specialties: [],
  job_categories: [],
  desired_employment_type: null,
  desired_salary: null,
  ...o,
});
const job = (o: Partial<JobFacts> = {}): JobFacts => ({
  sido: "서울특별시",
  sigungu: "종로구",
  specialty: null,
  job_category: null,
  employment_type: "정규직",
  salary_text: null,
  ...o,
});

test("지역 — 이력서 축약 표기와 공고 canonical 표기를 잇는다", () => {
  assert.deepEqual(desiredRegions("서울 종로구, 경기"), [
    { sido: "서울특별시", sigungu: "종로구" },
    { sido: "경기도", sigungu: null },
  ]);
  // 공고 sigungu 는 구까지 온다 — "성남시" 희망이 "성남시 분당구" 공고를 잡아야 한다.
  assert.equal(
    evaluateMatch(seeker({ desired_location: "경기 성남시" }), job({ sido: "경기도", sigungu: "성남시 분당구" })).mismatches.length,
    0,
  );
  // 같은 시도라도 다른 구면 어긋난다. 🔴 지역은 핵심 축이라 화면이 regionOk 로 목록에서 뺀다.
  const off = evaluateMatch(seeker({ desired_location: "서울 종로구" }), job({ sigungu: "강남구" }));
  assert.deepEqual(off.mismatches, ["지역 다름"]);
  assert.equal(off.regionOk, false);
  assert.equal(evaluateMatch(seeker(), job()).regionOk, true);
});

test("지역 — 표에 없는 레거시 값('경기 북부출장소')은 시도 전체로 본다", () => {
  // 그대로 두면 그 사람의 모든 매칭이 '지역 다름'이 된다(실측 57명).
  assert.deepEqual(desiredRegions("경기 북부출장소"), [{ sido: "경기도", sigungu: null }]);
  assert.equal(canMatch(seeker({ desired_location: "화성" })), false); // 시도 목록 밖
});

test("시도 목록 — SQL 후보 좁히기 / 전남광주 통합값은 이력서 표기 둘로 갈린다", () => {
  assert.deepEqual(candidateSidos(seeker({ desired_location: "서울 종로구, 서울 강남구" })), ["서울특별시"]);
  assert.deepEqual(shortSidos(["전남광주통합특별시"]).sort(), ["광주", "전남"]);
  assert.deepEqual(shortSidos(["서울특별시", null]), ["서울"]);
});

test("급여 — 공고 범위는 상한, 이력서 '이상'은 그 값. 단위별 연봉 환산", () => {
  assert.equal(yearlyKrw("월급 220만원 ~ 230만원"), 230_0000 * 12);
  assert.equal(yearlyKrw("월급 210만원 이상"), 210_0000 * 12);
  assert.equal(yearlyKrw("연봉 3000만원 이상"), 3000_0000);
  assert.equal(yearlyKrw("시급 10,030원 이상"), 10_030 * 209 * 12);
  assert.equal(yearlyKrw("협의"), null);
  assert.equal(yearlyKrw(null), null);
});

test("급여 — 단위가 섞이면 구간마다 자기 단위로 환산한다(시급 금액에 월급 숫자가 끼면 안 된다)", () => {
  // 🔴 단위 하나만 보고 전체 최댓값을 고르면 209만원이 시급으로 읽혀 연봉 52억이 된다.
  const mixed = yearlyKrw("시급 10,030원 (월급 209만원)");
  assert.equal(mixed, Math.max(10_030 * 209 * 12, 209_0000 * 12));
  assert.ok(mixed !== null && mixed < 30_000_000, `혼합 단위 오독: ${mixed}`);
  // 단위 없이 시작하는 앞머리가 있어도 뒤의 단위 구간을 읽는다.
  assert.equal(yearlyKrw("면접 후 결정 · 월급 250만원"), 250_0000 * 12);
});

test("병원 쪽 진료과 조건에는 '부서무관'을 끼워 넣는다", () => {
  assert.deepEqual(talentSpecialtyFilter(["응급실"]).sort(), ["부서무관", "응급실"]);
  // 조건이 없으면 빈 배열 — 호출부가 필터를 아예 안 걸도록(전체 인재가 나오는 것은 화면이 따로 막는다).
  assert.deepEqual(talentSpecialtyFilter([]), []);
  // 부서를 안 가리는 간호사는 어느 공고 진료과로 찾아도 후보에 남아야 한다(간호사 쪽 판정과 대칭).
  assert.equal(evaluateMatch(seeker({ specialties: ["부서무관"] }), job({ specialty: "응급실" })).mismatches.length, 0);
});

test("고용형태 — 아르바이트=파트타임, 대응 값 없는 옛 어휘는 축에서 뺀다", () => {
  assert.equal(normalizedEmployment("아르바이트"), "파트타임");
  assert.equal(normalizedEmployment("정규직"), "정규직");
  for (const v of ["스페어", "프리랜서", "무관", null]) assert.equal(normalizedEmployment(v), null);
  // 스페어 희망자는 고용형태를 아예 안 센다 → 지역 하나만 적용돼 1/1 이 된다.
  const r = evaluateMatch(seeker({ desired_employment_type: "스페어" }), job({ employment_type: "계약직" }));
  assert.deepEqual({ matched: r.matched, total: r.total }, { matched: 1, total: 1 });
});

test("안 채운 축은 세지 않는다 — 채운 만큼만 분모가 된다", () => {
  const full = seeker({
    specialties: ["응급실"],
    job_categories: ["간호직"],
    desired_employment_type: "정규직",
    desired_salary: "월급 250만원 이상",
  });
  const perfect = job({ specialty: "응급실", job_category: "간호직", salary_text: "월급 260만원" });
  assert.deepEqual(evaluateMatch(full, perfect), { matched: 5, total: 5, mismatches: [], regionOk: true });
  // 지역만 적은 사람은 분모가 1이다(덜 채웠다고 벌을 주지 않는다).
  assert.equal(evaluateMatch(seeker(), perfect).total, 1);
});

test("어긋난 축은 '없어서'와 '달라서'를 나눠 적는다", () => {
  const s = seeker({ specialties: ["응급실"], job_categories: ["간호직"], desired_salary: "월급 300만원 이상" });
  const r = evaluateMatch(s, job({ specialty: null, job_category: "간호조무직", salary_text: "월급 220만원" }));
  assert.deepEqual(r.mismatches, ["진료과 미표기", "직종 다름", "급여 낮음"]);
  assert.deepEqual({ matched: r.matched, total: r.total }, { matched: 1, total: 4 });
  // 공고 급여를 못 읽는 것은 '낮음'과 다른 말이다.
  assert.deepEqual(evaluateMatch(seeker({ desired_salary: "월급 300만원 이상" }), job({ salary_text: "회사내규" })).mismatches, [
    "급여 확인 불가",
  ]);
});

test("'부서무관'을 고르면 진료과를 조건으로 세지 않는다", () => {
  const r = evaluateMatch(seeker({ specialties: ["부서무관", "내과"] }), job({ specialty: "정형외과" }));
  assert.deepEqual(r.mismatches, []);
  assert.equal(r.total, 1);
});

test("안내용 축 상태 — 비어 있는 항목을 짚어준다", () => {
  const missing = matchAxes(seeker()).filter((a) => !a.filled).map((a) => a.label);
  assert.deepEqual(missing, ["희망 근무부서", "희망 직종", "희망 고용형태", "희망 급여"]);
  const all = matchAxes(
    seeker({ specialties: ["내과"], job_categories: ["간호직"], desired_employment_type: "정규직", desired_salary: "월급 250만원 이상" }),
  );
  assert.equal(all.every((a) => a.filled), true);
});
