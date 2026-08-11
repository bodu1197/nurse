import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicJob, ymd, employmentTypeOf, isNursePublicJob, jobCategoryOf, fetchNursePublicJobs } from "./alio.ts";

/** 공공채용정보 오픈API 가 실제로 준 응답 한 건(2026-08-11, recrutPblntSn 303646). */
const RAW = {
  recrutPblntSn: 303646,
  instNm: "서울대학교치과병원",
  recrutPbancTtl: "서울대학교치과병원 촉탁간호직(병동, 수술장) 채용 공고",
  ncsCdNmLst: "보건.의료",
  hireTypeNmLst: "비정규직",
  workRgnNmLst: "서울",
  recrutSeNm: "신입+경력",
  acbgCondNmLst: "학력무관",
  recrutNope: 2,
  pbancBgngYmd: "20260807",
  pbancEndYmd: "20260817",
  srcUrl: "https://snudh.recruiter.co.kr/app/jobnotice/view?systemKindCode=MRS2&jobnoticeSn=262580",
  aplyQlfcCn: "간호사 면허 소지자",
  scrnprcdrMthdExpln: "1차 서류전형\n2차 면접",
  prefCn: "취업지원대상자 가점",
  prefCondCn: "취업지원대상자",
};

test("응답 한 건을 우리 모양으로 옮긴다", () => {
  const j = toPublicJob(RAW)!;
  assert.equal(j.id, "303646"); // 알리오 화면 idx 와 같은 값 — 외부 링크가 이 번호로 이어진다
  assert.equal(j.org, "서울대학교치과병원");
  assert.equal(j.location, "서울");
  assert.equal(j.employmentType, "계약직");
  assert.equal(j.recruitCount, 2);
  assert.equal(j.postedAt, "2026-08-07");
  assert.equal(j.deadline, "2026-08-17");
  assert.equal(j.description, "간호사 면허 소지자");
  assert.match(j.applyDetail!, /접수처: https:\/\/snudh\.recruiter\.co\.kr/);
});

/**
 * 🔴 이 API 는 빈 값을 null 이 아니라 **빈 문자열**로 준다. `??` 로 대체를 쓰면 ""가 그대로
 *    통과해 우대 정보가 통째로 빠진다(`??` 는 null/undefined 만 본다).
 */
test("우대내용이 빈 문자열이면 우대조건으로 넘어간다", () => {
  const j = toPublicJob({ ...RAW, prefCn: "", prefCondCn: "취업지원대상자" })!;
  assert.match(j.applyDetail!, /우대: 취업지원대상자/);
});

test("우대 정보가 둘 다 비면 우대 줄을 만들지 않는다", () => {
  const j = toPublicJob({ ...RAW, prefCn: "", prefCondCn: "" })!;
  assert.doesNotMatch(j.applyDetail!, /우대:/);
});

/** 🔴 '간호업무보조' 는 간호사 자리가 아니다 — 부정 전방탐색이 실제로 막는지 확인한다. */
test("간호업무보조만 있는 공고는 간호직이 아니다", () => {
  assert.equal(jobCategoryOf("○○병원 간호업무보조 채용", "간호조무사 자격 소지자"), "간호조무직");
});

test("근무지역이 여럿이면 첫 번째만 쓴다 — 우리 지역 축은 한 값이다", () => {
  assert.equal(toPublicJob({ ...RAW, workRgnNmLst: "서울,경기,인천" })!.location, "서울");
});

test("채용인원 0(미정)은 숫자로 적지 않는다", () => {
  assert.equal(toPublicJob({ ...RAW, recrutNope: 0 })!.recruitCount, null);
});

test("공고번호나 제목이 없으면 버린다", () => {
  assert.equal(toPublicJob({ ...RAW, recrutPblntSn: 0 }), null);
  assert.equal(toPublicJob({ ...RAW, recrutPbancTtl: "" }), null);
});

test("YYYYMMDD 를 날짜로 옮긴다", () => {
  assert.equal(ymd("20260817"), "2026-08-17");
  assert.equal(ymd(""), null);
  assert.equal(ymd("2026-08-17"), null); // 이미 ISO 면 형식이 다르다 — 조용히 통과시키지 않는다
});

/**
 * 🔴 '비정규직' 은 '정규직' 을 부분 문자열로 포함한다 — 정규직을 먼저 보면 비정규직 공고가
 *    전부 '정규직' 으로 뒤집혀 간호사에게 거짓말이 된다.
 */
test("비정규직을 정규직으로 뒤집지 않는다", () => {
  assert.equal(employmentTypeOf("비정규직"), "계약직");
  assert.equal(employmentTypeOf("정규직"), "정규직");
  assert.equal(employmentTypeOf("무기계약직"), "정규직"); // 정년 보장 자리를 계약직이라 적지 않는다
  assert.equal(employmentTypeOf("청년인턴"), "인턴");
  assert.equal(employmentTypeOf(""), null);
  // 병원 ATS 쪽 표기 — '임시직' 과 '계약직'
  assert.equal(employmentTypeOf("임시직"), "계약직");
  assert.equal(employmentTypeOf("계약직"), "계약직");
  // 🔴 실측(중앙대의료원): 계약직 공고인데 제목에 "정규직 전환 기회부여" 가 붙는다.
  //    '정규직' 을 먼저 보면 계약직이 정규직으로 뒤집혀 간호사에게 거짓말이 된다.
  assert.equal(employmentTypeOf("계약직 전담간호사 모집 (정규직 전환 기회부여)"), "계약직");
});

/**
 * 아래는 전부 **실측 583건(진행중 전수, 2026-08-11)에서 실제로 나온 행**이다.
 * 규칙을 "제목만" 이나 "NCS 보건.의료만" 으로 바꾸면 여기서 깨진다 — 그게 이 시험의 목적이다.
 */
test("제목에 직종이 없는 병원 공채는 응시자격으로 잡는다", () => {
  assert.ok(isNursePublicJob(
    "2026년 8월 전남대학교병원 직원(대체근로자) 공개채용 공고",
    "예방관리센터 교육전담간호사(뇌혈관) : 간호사 면허 소지자  방사선사 : 방사선사 면허 소지자",
  ));
});

test("제목에 간호가 있으면 응시자격이 비어도 간호 자리다", () => {
  assert.ok(isNursePublicJob("서울적십자병원 정규직 간호사(내과전담) 신규채용 공고", null));
});

/**
 * 🔴 '간호조무사' 에는 '간호사' 가 들어 있지 않다(간-호-조-무-사). 이 구분이 무너지면
 *    간호사가 '간호직' 칩에서 조무사 공고를 보게 된다.
 */
test("간호조무사 공고를 간호직으로 넣지 않는다", () => {
  // 실측: 국민건강보험공단 서울요양원 — 응시자격이 조무사뿐이다
  assert.equal(jobCategoryOf("국민건강보험공단 서울요양원 직원 채용공고",
    "◈ 간호조무사(정규직) - 간호조무사 자격을 받은 자 - 장기요양기관에서 간호조무사 업무 경력 2년 이상"), "간호조무직");
});

test("둘을 같이 뽑는 공채는 간호직으로 둔다 — 간호사 자리가 실제로 있다", () => {
  assert.equal(jobCategoryOf("2026년 8월 전남대학교병원 직원(대체근로자) 공개채용 공고",
    "예방관리센터 교육전담간호사(뇌혈관): 간호사 면허 소지자  간호업무보조: 제한없음"), "간호직");
});

test("공기업 보건관리자도 간호직이다 — 병원 밖 간호사 자리", () => {
  // 실측: 한국철도공사 보건관리원 · 한국남동발전 별정직(간호사)
  assert.equal(jobCategoryOf("한국철도공사 전남본부 기간제근로자(보건관리원) 채용공고",
    "의료법에 따른 간호사로서 해당분야 2년 이상 경력자"), "간호직");
});

/**
 * 🔴 여기가 이 파일에서 가장 중요한 시험이다.
 *    부르는 쪽(sync-alio)은 **이 함수가 돌려주지 않은 공고를 전부 마감 처리한다.**
 *    그래서 "덜 받았는데 정상인 척 돌려주는" 경로가 곧 살아 있는 국립대병원 공고의 삭제다.
 *    다 못 받았으면 반드시 던져야 한다 — 그 실행은 실패하고, 아무것도 닫히지 않는다.
 */
const raw = (id: number) => ({ ...RAW, recrutPblntSn: id });

test("전부 받으면 정상 반환한다", async () => {
  const jobs = await fetchNursePublicJobs(async (p) =>
    p === 1 ? { rows: [raw(1), raw(2)], total: 3 } : { rows: [raw(3)], total: 3 });
  assert.equal(jobs.length, 3);
});

test("중간 페이지가 짧게 와서 덜 받으면 던진다 — 조용히 넘어가면 나머지가 마감된다", async () => {
  await assert.rejects(
    fetchNursePublicJobs(async (p) => (p === 1 ? { rows: [raw(1)], total: 50 } : { rows: [], total: 50 })),
    /부분 응답/,
  );
});

test("totalCount 가 없으면 던진다 — 완주를 확인할 수단이 없다", async () => {
  // 이 가드가 없으면 `received >= total(0)` 이 1페이지에서 참이 되어 한 페이지만 받고 정상 종료한다.
  await assert.rejects(
    fetchNursePublicJobs(async () => ({ rows: [raw(1)], total: 0 })),
    /totalCount/,
  );
});

test("공고가 하나도 없는 날은 빈 배열 — 던지지 않는다", async () => {
  assert.deepEqual(await fetchNursePublicJobs(async () => ({ rows: [], total: 0 })), []);
});

test("같은 공고번호가 페이지 경계에 겹쳐도 한 번만 담는다", async () => {
  const jobs = await fetchNursePublicJobs(async (p) =>
    p === 1 ? { rows: [raw(1), raw(2)], total: 3 } : { rows: [raw(2)], total: 3 });
  assert.equal(jobs.length, 2);
});

test("간호가 어디에도 없으면 버린다 — 병원이 낸 비간호 공고 포함", () => {
  // 실측: NCS 가 '보건.의료' 인 병원 공고지만 방사선사 자리다. 기관이 병원이라고 통과시키면 안 된다.
  assert.ok(!isNursePublicJob(
    "2026년 전남대학교병원 직원(방사선취급감독자) 상시 공개채용 공고",
    "방사선취급감독자 면허 소지자",
  ));
  assert.ok(!isNursePublicJob("2026년 KOTRA 행정직 채용 공고", "제한없음"));
});
