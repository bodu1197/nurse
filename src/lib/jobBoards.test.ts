import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMbank, parseMbankDetail, fetchBoardJobs, labelOf, BOARDS, type Board } from "./jobBoards.ts";

/** 실제 인재채움뱅크 목록 마크업(2026-08-12). 회사명과 제목이 **다른 블록**에 있다. */
const HTML = `
<td><div class="tpNm"><span class="tx">의료법인춘혜의료재단(의)</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390197&chk_s=" class="tx">[명지춘혜재활병원] 진료협력센터 간호사(육아휴직대체)</a>
</div></div></div></td>
<td><div class="tpNm"><span class="tx">당당한방병원김해점</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390221&chk_s=" class="tx">[경남 김해] [원무] 당당한방병원 김해점 접수/수납 원무데스크 채용</a>
</div></div></div></td>
<td><div class="tpNm"><span class="tx">연세척병원</span></div></td>
<td><div class="cttCntArea"><div class="txtBx"><div class="tpNm">
  <a href="/jobs/view.asp?id_num=19390150" class="tx">연세척병원 병동간호사 선생님 구인 합니다(3교대) / 육아휴직대체</a>
</div></div></div></td>`;

test("회사명과 제목을 행마다 짝지어 읽는다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows.length, 2, "원무데스크 공고는 담지 않는다");
  assert.equal(rows[0].id, "mbank-19390197");
  assert.equal(rows[0].company, "의료법인춘혜의료재단(의)");
  assert.match(rows[0].title, /진료협력센터 간호사/);
  assert.equal(rows[0].url, "https://matchingbank.career.co.kr/jobs/view.asp?id_num=19390197");
});

/**
 * 🔴 사이트의 직종 필터(jc=M003 = 간호사·간호조무사)를 믿으면 안 된다.
 *    실측에서 원무·물리치료사가 섞여 왔다. 우리가 제목으로 한 번 더 거른다.
 */
test("직종 필터를 통과해 온 비간호 공고를 걸러낸다", () => {
  const titles = parseMbank(HTML).map((r) => r.title);
  assert.ok(!titles.some((t) => /원무데스크/.test(t)));
});

/**
 * 🔴 회사명과 제목 사이를 탐욕적으로 매칭하면 **앞 회사명이 뒤 공고에 붙는다** —
 *    간호사 공고에 엉뚱한 병원 이름이 찍히는 종류의 버그다. 최소 일치여야 한다.
 */
test("앞 행의 회사명이 뒤 공고에 새지 않는다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows[1].company, "연세척병원");
  assert.notEqual(rows[1].company, "당당한방병원김해점");
});

/**
 * 🔴 등기명("삼정의료재단포항여성병원")은 ① 카드에 그대로 찍히면 못 읽고 ② 명부와 이름이 안 맞아
 *    종별·지역·좌표가 통째로 빈다 = 「내 주변」에서 빠진다. 제목의 대괄호 이름을 쓴다.
 */
test("제목 앞 대괄호에서 부를 만한 병원명을 뽑는다", () => {
  const r = labelOf("[포항여성병원]신생아실 간호사 채용", "삼정의료재단포항여성병원");
  assert.equal(r.label, "포항여성병원");
  assert.equal(r.rest, "신생아실 간호사 채용");
  // 공백이 섞인 실제 표기도 잡는다.
  assert.equal(labelOf("[ 서울대학교치과병원 ] 촉탁간호직 채용", "서울대학교치과병원").label, "서울대학교치과병원");
});

/** 🔴 같은 자리에 지역 태그가 온다 — 이걸 병원명으로 쓰면 카드에 "경남 김해" 가 찍히고 명부 조회도 헛돈다. */
test("지역 태그는 병원명으로 쓰지 않고 제목에 남긴다", () => {
  const r = labelOf("[경남 김해] 병동 간호사 모집", "당당한방병원김해점");
  assert.equal(r.label, "당당한방병원김해점");
  assert.equal(r.rest, "[경남 김해] 병동 간호사 모집");
});

/** 병원류 접미가 아니어도 회사명과 사실상 같은 이름이면(띄어쓰기·괄호만 차이) 기관명으로 친다. */
test("띄어쓰기만 다른 기관명도 걷어낸다", () => {
  assert.equal(labelOf("[중증장애인요양시설송죽원] 간호사 채용", "중증장애인요양시설 송죽원").rest, "간호사 채용");
  assert.equal(labelOf("[에이스산업보건연구소 (주) ] 보건관리 간호사", "에이스산업보건연구소 주식회사").rest, "보건관리 간호사");
});

test("대괄호가 없으면 회사명을 그대로 쓴다", () => {
  assert.deepEqual(labelOf("중환자실 3교대 간호사 모집", "더필병원"), {
    label: "더필병원",
    rest: "중환자실 3교대 간호사 모집",
  });
});

test("파서가 label 로 제목의 병원명 중복을 걷어낸다", () => {
  const rows = parseMbank(HTML);
  assert.equal(rows[0].label, "명지춘혜재활병원");
  assert.equal(rows[0].title, "진료협력센터 간호사(육아휴직대체)");
  assert.equal(rows[0].company, "의료법인춘혜의료재단(의)", "명부 2순위로 쓸 등기명도 남긴다");
});

test("간호조무사 공고는 조무직으로 가른다", () => {
  const html = `<span class="tx">e포근한요양원</span>
    <a href="/jobs/view.asp?id_num=1" class="tx">[e포근한요양원] 간호조무사(휴직대체) 채용</a>`;
  assert.equal(parseMbank(html)[0].jobCategory, "간호조무직");
});

test("같은 공고번호는 한 번만 담는다", () => {
  assert.equal(parseMbank(HTML + HTML).length, 2);
});

/**
 * 🔴 부르는 쪽(sync-ats)은 목록에 없는 공고를 마감 처리한다. 사이트가 죽었을 때 그것을
 *    "공고 없음" 으로 넘기면 이 출처의 공고가 통째로 사라진다 — 반드시 실패를 돌려줘야 한다.
 */
test("사이트가 죽으면 실패로 알린다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 3 };
  const { jobs, failed } = await fetchBoardJobs([b], async () => { throw new Error("마크업 변경"); });
  assert.equal(jobs.length, 0);
  assert.deepEqual(failed, ["x"]);
});

/** 마지막 쪽을 넘기면 같은 목록을 다시 준다 — 새 공고가 없으면 멈춰야 무한 반복을 안 한다. */
test("새 공고가 없는 쪽을 만나면 멈춘다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  let calls = 0;
  const { jobs } = await fetchBoardJobs([b], async () => { calls++; return parseMbank(HTML); });
  assert.equal(jobs.length, 2);
  assert.equal(calls, 2, "1쪽에서 담고 2쪽에서 새 공고 0건을 보고 멈춘다");
});

/**
 * 🔴 링크 검사만으로는 못 막는 구멍 — **회사명 쪽 마크업만 바뀌면** 링크는 그대로라 검사를 통과하고
 *    파서만 0건을 돌려준다. 그걸 빈 결과로 넘기면 부르는 쪽이 이 출처 공고를 **전부 마감**시킨다.
 */
test("1쪽에서 한 건도 못 읽으면 실패로 알린다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  const { jobs, failed } = await fetchBoardJobs([b], async () => []);
  assert.equal(jobs.length, 0);
  assert.deepEqual(failed, ["x"], "0건을 '공고 없음' 으로 넘기면 안 된다");
});

/**
 * 🔴 목록 끝(2쪽 이후 빈 목록)을 실패로 치면 **정상인데 늘 실패로 보고**되고, 부르는 쪽이
 *    마감 처리를 영영 건너뛴다. 끝난 것과 깨진 것은 다르다.
 */
test("마지막 쪽 다음의 빈 목록은 실패가 아니다", async () => {
  const b: Board = { key: "x", label: "테스트", pageUrl: () => "http://x", maxPages: 5 };
  const { jobs, failed } = await fetchBoardJobs([b], async (_b, p) => (p === 1 ? parseMbank(HTML) : []));
  assert.equal(jobs.length, 2);
  assert.deepEqual(failed, [], "2쪽이 비었다고 실패로 올리면 안 된다");
});

/** 실제 상세 마크업(2026-08-12). 라벨 뒤 값이 `span.vl` 인 것과 `div.tx` 인 것이 섞여 있다. */
const DETAIL = `
<div class="tps"><span class="lb">급여조건</span><span class="vl">회사내규에 따름</span></div>
<div class="tps"><span class="lb">근무형태</span><span class="vl">
  대체인력 </span></div>
<div class="tps"><span class="lb">담당업무</span><span class="vl"></span></div>
<div class="tps"><span class="lb">경력</span><span class="vl">3년 이상</span></div>
<div class="tps"><span class="lb">종료일</span><div class="tx">2026년 8월 18일 (화)</div></div>
<div class="tps"><span class="lb">근무지 주소</span><div class="tx">서울 중구 을지로 245</div>
  <a href="javascript:" class="lcbtn map"><span class="lbtx">지도</span></a></div>
<div class="asdf" id="custom_recruit"><!-- 템플릿 import : S -->
  <p><b>외상센터 간호사</b> 모집합니다.</p><!-- 템플릿 import : E --></div>
<div class="tps"><span class="lb">급여조건</span><div class="tx">기업정보 쪽 중복 값</div></div>`;

test("상세에서 급여·마감일·근무지 주소를 읽는다", () => {
  const d = parseMbankDetail(DETAIL);
  assert.equal(d.salaryText, "회사내규에 따름");
  assert.equal(d.deadline, "2026-08-18", "「2026년 8월 18일 (화)」 를 날짜로 읽는다");
  assert.equal(d.address, "서울 중구 을지로 245", "명부에 없는 병원도 이 주소로 좌표를 얻는다");
});

/** 🔴 값이 빈 항목(담당업무)에서 다음 항목 값이 앞 라벨에 붙으면 급여 자리에 학력이 찍힌다. */
test("값이 빈 항목이 다음 항목 값을 훔치지 않는다", () => {
  assert.match(parseMbankDetail(DETAIL).description ?? "", /경력: 3년 이상/);
  assert.doesNotMatch(parseMbankDetail(DETAIL).description ?? "", /담당업무/);
});

/** 같은 라벨이 공고 위쪽과 기업정보 아래쪽에 두 번 나온다 — 공고 쪽(먼저 나온 것)을 쓴다. */
test("같은 라벨이 두 번 나오면 공고 쪽을 쓴다", () => {
  assert.equal(parseMbankDetail(DETAIL).salaryText, "회사내규에 따름");
});

/** 🔴 주석을 태그보다 먼저 지워야 한다 — 아니면 본문이 "--> 모집부문" 으로 시작한다(실측). */
test("모집요강 본문에 HTML 주석 잔재가 남지 않는다", () => {
  const body = parseMbankDetail(DETAIL).description ?? "";
  assert.match(body, /외상센터 간호사 모집합니다/);
  assert.doesNotMatch(body, /-->|템플릿 import/);
});

test("「대체인력」은 계약직으로 가른다 — 휴직자가 돌아오면 끝나는 자리다", () => {
  assert.equal(parseMbankDetail(DETAIL).employmentType, "계약직");
});

/** 마감일을 지어내지 않는다 — "채용시 마감" 공고는 종료일이 없다. */
/**
 * 🔴 남의 사이트 버튼이 글자로 남으면, 우리 화면에서는 **눌리지도 않는 문구**가 된다 —
 *    간호사가 지원 방법을 찾다 헛돈다.
 */
test("원본 사이트의 버튼 문구를 걷어낸다", () => {
  const html = `<div id="custom_recruit"><p>병동 간호사 모집. 사람인 입사지원 바로가기 click</p></div>`;
  const body = parseMbankDetail(html).description ?? "";
  assert.match(body, /병동 간호사 모집/);
  assert.doesNotMatch(body, /바로가기|click/i);
});

/**
 * 🔴 잘못된 숫자 엔티티에 fromCodePoint 가 던지면 이 출처 수집이 통째로 실패한다.
 *    풀 수 없는 값은 원문 그대로 남기고(정보를 지우지 않는다), 멀쩡한 것만 푼다.
 */
test("범위를 벗어난 숫자 엔티티에도 던지지 않는다", () => {
  const body = parseMbankDetail(`<div id="custom_recruit"><p>간호사&#1114112;모집&#39;&#9312;</p></div>`).description ?? "";
  assert.match(body, /모집'①/, "멀쩡한 엔티티는 푼다");
  assert.match(body, /간호사/);
});

/** 🔴 끝 마커가 없으면 문서 끝까지(2MB) 삼킨다 — 길이를 묶어 둔다. */
test("끝 마커가 없어도 본문이 무한히 커지지 않는다", () => {
  const html = `<div id="custom_recruit"><p>${"가".repeat(50000)}</p>`;
  assert.ok((parseMbankDetail(html).description ?? "").length <= 3000);
});

test("종료일이 없으면 마감일은 null", () => {
  assert.equal(parseMbankDetail(`<span class="lb">급여조건</span><span class="vl">면접 후 결정</span>`).deadline, null);
});

test("BOARDS 의 key 에 하이픈이 없다 — external_id 접두이자 마감 범위다", () => {
  for (const b of BOARDS) assert.doesNotMatch(b.key, /-/);
});
