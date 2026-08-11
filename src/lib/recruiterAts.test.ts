import { test } from "node:test";
import assert from "node:assert/strict";
import { toAtsJob, hospitalOf, kstDate, isOpenNurse, extractBody, fetchNurseAtsJobs, TENANTS } from "./recruiterAts.ts";

const tenant = { host: "hyumc", hospital: "한양대학교병원" };

/** 실제 list.json 응답 한 건(2026-08-11, hyumc). */
const RAW = {
  jobnoticeSn: 262777,
  jobnoticeName: "암병원 종양간호팀 간호사 (임시직)",
  receiptState: "접수중",
  recruitClassName: "임시직",
  applyStartDate: { time: 1786352400000 },
  applyEndDate: { time: 1786694459000 },
};

test("목록 한 건을 우리 모양으로 옮긴다", () => {
  const j = toAtsJob(tenant, RAW)!;
  assert.equal(j.id, "hyumc-262777"); // 병원마다 공고번호가 겹치므로 호스트를 붙여야 유일해진다
  assert.equal(j.hospital, "한양대학교병원");
  assert.equal(j.jobCategory, "간호직");
  assert.equal(j.employmentType, "계약직"); // '임시직' → 우리 표의 계약직
  assert.match(j.url, /hyumc\.recruiter\.co\.kr.*jobnoticeSn=262777/);
});

/**
 * 🔴 명부명은 법인명이 붙어 있어 채용 카드에 그대로 쓸 수 없다. 매칭용 이름과 표시용 이름을
 *    갈라 두지 않으면, 간호사가 보는 카드에 "학교법인 고려중앙학원 …" 이 찍힌다.
 */
test("화면 이름과 명부 이름을 따로 둔다", () => {
  const kumc = TENANTS.find((t) => t.host === "kumc")!;
  const j = toAtsJob(kumc, { ...RAW, jobnoticeName: "[안암병원 26-116] 간호부 3교대 모집" })!;
  assert.match(j.hospital, /학교법인 고려중앙학원/); // 명부 매칭용 — 한 글자도 바꾸면 종별이 안 붙는다
  assert.equal(j.displayName, "고려대학교 안암병원"); // 화면용
  // 표에 없는 병원은 명부명이 이미 읽을 만하다 — 그대로 쓴다
  assert.equal(toAtsJob(tenant, RAW)!.displayName, "한양대학교병원");
});

test("공고번호나 제목이 없으면 버린다", () => {
  assert.equal(toAtsJob(tenant, { ...RAW, jobnoticeSn: 0 }), null);
  assert.equal(toAtsJob(tenant, { ...RAW, jobnoticeName: "" }), null);
});

/**
 * 🔴 한 테넌트가 여러 병원인 곳이 있다. 지점을 안 가리면 고대 구로·안산 공고가 전부 안암병원으로,
 *    강남세브란스가 신촌으로 찍힌다 — 간호사가 근무지를 잘못 보고 지원한다.
 */
test("제목의 지점 표기로 병원을 가린다", () => {
  const kumc = TENANTS.find((t) => t.host === "kumc")!;
  assert.match(hospitalOf(kumc, "[구로병원 26-30] 간호부 모집"), /구로병원/);
  assert.match(hospitalOf(kumc, "[안산병원 26-12] 간호부 모집"), /안산병원/);
  assert.match(hospitalOf(kumc, "[안암병원 26-116] 간호부 모집"), /안암병원/); // 규칙 없음 → 기본값

  const yuhs = TENANTS.find((t) => t.host === "yuhs")!;
  assert.match(hospitalOf(yuhs, "[일반-강남] 간호사(계약직)"), /강남세브란스/);
  assert.match(hospitalOf(yuhs, "[일반-신촌] 간호사(계약직)"), /^연세대학교의과대학세브란스병원$/);
});

/** 🔴 병원명은 명부에 있는 이름 그대로여야 종별·지역이 붙는다. 오타 하나면 필터에서 사라진다. */
test("테넌트 목록에 빈 이름·중복 호스트가 없다", () => {
  const hosts = TENANTS.map((t) => t.host);
  assert.equal(new Set(hosts).size, hosts.length, "호스트가 중복되면 같은 공고를 두 번 담는다");
  for (const t of TENANTS) {
    assert.ok(t.hospital.trim().length > 0, `${t.host} 의 병원명이 비었다`);
    for (const [, name] of t.branches ?? []) assert.ok(name.trim().length > 0);
  }
});

test("접수중인 간호 공고만 고른다", () => {
  assert.ok(isOpenNurse(RAW));
  assert.ok(!isOpenNurse({ ...RAW, receiptState: "마감" }));
  assert.ok(!isOpenNurse({ ...RAW, jobnoticeName: "행정직 모집" }));
});

test("epoch 밀리초를 KST 날짜로 옮긴다", () => {
  // 실제 응답이 함께 준 분해값이 {year:126(=2026), month:7(0부터=8월), date:14} 였다 → 8/14 가 정답.
  assert.equal(kstDate(1786694459000), "2026-08-14");
  // 🔴 KST 경계: UTC 로는 전날 15:00 이 KST 로는 다음 날 자정이다. UTC 로 자르면 마감일이 하루 당겨진다.
  assert.equal(kstDate(Date.parse("2026-08-13T15:00:00Z")), "2026-08-14");
  assert.equal(kstDate(Date.parse("2026-08-13T14:59:00Z")), "2026-08-13");
  assert.equal(kstDate(null), null);
  assert.equal(kstDate(0), null);
});

test("상세 본문에서 알맹이만 뽑는다", () => {
  const html = `<html><head><script>var x=1</script></head><body>
    <div>메뉴</div><div>로그인</div>
    <p>■ 채용개요</p><p>1. 모집부문 : 암병원 종양간호팀 간호사</p><p>2. 지원자격 : 간호사 면허증 소지자</p>
  </body></html>`;
  const body = extractBody(html)!;
  assert.match(body, /모집부문/);
  assert.doesNotMatch(body, /var x=1/, "스크립트가 본문에 섞이면 안 된다");
});

test("알맹이가 없으면 본문을 만들지 않는다", () => {
  assert.equal(extractBody("<html><body><div>로그인</div></body></html>"), null);
});

/**
 * 🔴 이 시험이 이 파일의 이유다. 부르는 쪽(sync-ats)은 목록에 없는 공고를 마감 처리한다.
 *    병원 한 곳이 점검 중이라 응답이 없을 때 그 사실을 숨기면, 그 병원 공고가 통째로 사라진다.
 *    실패한 호스트를 **반드시 돌려줘야** 부르는 쪽이 마감 처리를 건너뛴다.
 */
test("한 곳이 죽어도 나머지는 살리고, 죽은 곳을 알려준다", async () => {
  const ts = [
    { host: "a", hospital: "A병원" },
    { host: "b", hospital: "B병원" },
  ];
  const { jobs, failed } = await fetchNurseAtsJobs(ts, async (t) => {
    if (t.host === "b") throw new Error("점검중");
    return [toAtsJob(t, RAW)!];
  });
  assert.equal(jobs.length, 1);
  assert.deepEqual(failed, ["b"]);
});

test("전부 성공하면 실패 목록이 비어 있다", async () => {
  const { jobs, failed } = await fetchNurseAtsJobs([{ host: "a", hospital: "A병원" }], async (t) => [toAtsJob(t, RAW)!]);
  assert.equal(jobs.length, 1);
  assert.deepEqual(failed, []);
});

/**
 * 🔴 공고번호는 external_id 와 원본 링크에 그대로 들어간다. 문자열이 섞여 오면 링크가 깨지고
 *    external_id 가 오염된다 — 숫자가 아니면 버린다.
 */
test("공고번호가 숫자가 아니면 버린다", () => {
  assert.equal(toAtsJob(tenant, { ...RAW, jobnoticeSn: "262777&x=1" as unknown as number }), null);
  assert.equal(toAtsJob(tenant, { ...RAW, jobnoticeSn: 1.5 }), null);
  // 정상값은 원본 번호를 그대로 들고 다닌다(id 를 문자열로 되쪼개지 않으려고)
  assert.equal(toAtsJob(tenant, RAW)!.sn, 262777);
});

/**
 * 🔴 본문을 자를 때는 잘랐다고 말한다. 조용히 끊으면 간호사가 그게 전문인 줄 알고
 *    뒤에 있는 접수기간·제출서류를 못 본다.
 */
test("본문이 길면 잘린 사실을 알린다", () => {
  const long = `채용개요\n${"가".repeat(5000)}`;
  const body = extractBody(`<body><p>${long}</p></body>`)!;
  assert.ok(body.length < 5000);
  assert.match(body, /이하 생략/);
  // 짧으면 아무 말도 덧붙이지 않는다
  const short = extractBody("<body><p>채용개요</p><p>모집부문: 암병원 종양간호팀 간호사 1명</p><p>지원자격: 간호사 면허증 소지자</p></body>")!;
  assert.match(short, /모집부문/);
  assert.doesNotMatch(short, /이하 생략/);
});
