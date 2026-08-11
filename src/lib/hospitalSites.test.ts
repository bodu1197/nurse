import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSite, lastDate, idFromLink, anchorText, fetchNurseSiteJobs, SITES, type Site } from "./hospitalSites.ts";

const site: Site = {
  key: "eumc",
  hospital: "이화여자대학교의과대학부속목동병원",
  listUrl: "https://www.eumc.ac.kr/intro/recrut/list.do",
  linkPattern: /\.\/view\.do\?bbs_no=\d+[^"']*/,
  idParams: ["bbs_no"],
  branches: [[/서울병원/, "이화여자대학교의과대학부속서울병원"]],
};

/** 실제 목록 마크업(2026-08-11, eumc). 마감일이 앵커 안의 "시작 ~ 마감" 에 들어 있다. */
const HTML = `
<li><a href="./view.do?bbs_no=30900&pageIndex=1" class="card"><div class="card-body">
  <strong class="title"><span class="color07">D-50</span>[서울병원] 간호부 계약직 기능원 공개채용 공고</strong>
  <div class="card-foot"> 2026-07-09 09:00:00 ~ 2026-09-30 17:00:00 </div>
</div></a></li>
<li><a href="./view.do?bbs_no=30833&pageIndex=1" class="card"><div class="card-body">
  <strong class="title"><span class="color07">D-7</span>[서울병원] 약제팀 계약직 야간약사 공개채용 공고</strong>
  <div class="card-foot"> 2026-08-01 09:00:00 ~ 2026-08-18 17:00:00 </div>
</div></a></li>`;

test("목록에서 간호 공고만 뽑는다", () => {
  const rows = parseSite(site, HTML);
  assert.equal(rows.length, 1, "약사 공고는 담지 않는다");
  assert.equal(rows[0].id, "eumc-30900"); // 공고를 가리키는 건 bbs_no 다
  assert.match(rows[0].title, /간호부 계약직 기능원/);
  assert.equal(rows[0].deadline, "2026-09-30", "시작일이 아니라 마감일을 쓴다");
  assert.equal(rows[0].url, "https://www.eumc.ac.kr/intro/recrut/view.do?bbs_no=30900&pageIndex=1");
});

test("제목의 지점 표기로 병원을 가린다", () => {
  assert.match(parseSite(site, HTML)[0].hospital, /서울병원/);
  const noBranch = parseSite(site, HTML.replace(/\[서울병원\]/g, "[목동]"));
  assert.match(noBranch[0].hospital, /목동병원$/);
});

/** 🔴 "2026-07-09 ~ 2026-09-30" 에서 앞의 것을 잡으면 **오늘 이미 마감된 공고**가 되어 화면에서 사라진다. */
test("기간이 두 개면 뒤의 것이 마감일이다", () => {
  assert.equal(lastDate("2026-07-09 09:00 ~ 2026-09-30 17:00"), "2026-09-30");
  assert.equal(lastDate("마감일 2026.08.31 D-20"), "2026-08-31");
  assert.equal(lastDate("상시채용"), null);
});

/**
 * 🔴 "링크의 마지막 숫자"로 id 를 만들면 한림은 전 공고가 **연도(2026) 하나로 뭉개진다.**
 *    반대로 pageIndex 처럼 페이지에 따라 변하는 값을 넣으면 같은 공고가 새 공고로 다시 들어온다.
 */
test("공고를 가리키는 파라미터로만 id 를 만든다", () => {
  assert.equal(idFromLink("/kor/CMS/RecruitMgr/view.do?mCode=MN122&recruit_seq=1353", ["recruit_seq"]), "1353");
  // 한림: (지점, 연도, 회차) 조합이라야 공고마다 다르다
  assert.equal(
    idFromLink("hrt_p20_detail.jsp?locate=9&adoptcnt=172&inggbn=ing&adoptyy=2026", ["locate", "adoptyy", "adoptcnt"]),
    "9_2026_172",
  );
  assert.notEqual(
    idFromLink("hrt_p20_detail.jsp?locate=1&adoptcnt=185&adoptyy=2026", ["locate", "adoptyy", "adoptcnt"]),
    idFromLink("hrt_p20_detail.jsp?locate=9&adoptcnt=172&adoptyy=2026", ["locate", "adoptyy", "adoptcnt"]),
  );
  assert.equal(idFromLink("/view.do", ["bbs_no"]), null);
});

/**
 * 🔴 어떤 병원은 링크가 주소가 아니라 `href="javascript:view('1933')"` 다. 그대로 두면
 *    간호사가 눌렀을 때 아무 일도 안 일어난다 — id 를 뽑아 **열리는 주소**를 만들어 준다.
 */
test("자바스크립트 링크에서 id 를 뽑아 열리는 주소를 만든다", () => {
  const js: Site = {
    key: "paik",
    hospital: "인제대학교부산백병원",
    listUrl: "https://www.paik.ac.kr/paik/user/job/list.do?menuNo=200041",
    linkPattern: /javascript:view\('\d+'\)[^"']*/,
    idPattern: /view\('(\d+)'\)/,
    idParams: [],
    detailUrl: (id) => `https://www.paik.ac.kr/paik/user/job/view.do?menuNo=200041&jobId=${id}`,
    branches: [[/상계/, "인제대학교 상계백병원"]],
  };
  const html = `<td><a href="javascript:view('1933');">[부산백병원] 건강관리과 계약직 간호조무사 채용공고 2026-08-06 ~ 채용시까지</a></td>
                <td><a href="javascript:view('1900');">[상계백병원] 간호사 채용공고 2026-08-01 ~ 2026-08-20</a></td>`;
  const rows = parseSite(js, html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "paik-1933");
  assert.equal(rows[0].url, "https://www.paik.ac.kr/paik/user/job/view.do?menuNo=200041&jobId=1933");
  assert.equal(rows[0].jobCategory, "간호조무직");
  assert.equal(rows[1].hospital, "인제대학교 상계백병원", "제목의 병원명으로 형제 병원을 가른다");
});

test("태그를 걷어내고 한 줄로 만든다", () => {
  assert.equal(anchorText("<span>D-50</span>간호부  모집\n공고"), "D-50 간호부 모집 공고");
});

/**
 * 🔴 이 시험이 이 파일의 이유다. 부르는 쪽(sync-ats)은 목록에 없는 공고를 마감 처리한다.
 *    사이트 개편으로 링크를 못 찾았을 때 그걸 "공고 없음" 으로 넘기면 그 병원 공고가 통째로 사라진다.
 */
test("한 사이트가 죽어도 나머지는 살리고, 죽은 곳을 알려준다", async () => {
  const a: Site = { ...site, key: "a" };
  const b: Site = { ...site, key: "b" };
  const { jobs, failed } = await fetchNurseSiteJobs([a, b], async (s) => {
    if (s.key === "b") throw new Error("마크업이 바뀌었다");
    return parseSite(s, HTML);
  });
  assert.equal(jobs.length, 1);
  assert.deepEqual(failed, ["b"]);
});

/** key 는 external_id 접두이자 마감 처리 범위다 — '-' 가 들어가면 범위가 어긋난다. */
test("SITES 의 key 에 하이픈이 없고 중복도 없다", () => {
  const keys = SITES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.doesNotMatch(k, /-/);
});

/**
 * 🔴 병원명은 심사평가원 명부와 **글자 그대로** 같아야 종별·지역이 붙는다. 공백 하나만 달라도
 *    매칭이 통째로 실패한다 — 실제로 '한림대학교 강남성심병원'(명부는 공백 있음)을 붙여 써서 틀렸었다.
 *    설정에 빈 이름·앞뒤 공백이 섞이지 않았는지라도 여기서 잡는다.
 */
test("SITES 의 병원명이 비어 있거나 앞뒤 공백이 있지 않다", () => {
  for (const s of SITES) {
    assert.equal(s.hospital, s.hospital.trim(), `${s.key} 병원명에 앞뒤 공백`);
    assert.ok(s.hospital.length > 0, `${s.key} 병원명 없음`);
    // 공고를 가릴 수단이 둘 중 하나는 있어야 한다(쿼리 파라미터 또는 JS 링크에서 뽑는 패턴).
    assert.ok(s.idParams.length > 0 || s.idPattern, `${s.key} 공고 식별 수단 없음`);
    // JS 링크를 쓰면 눌러서 열리는 주소를 만들 방법도 반드시 있어야 한다.
    if (s.idPattern) assert.ok(s.detailUrl, `${s.key} idPattern 만 있고 detailUrl 이 없다 — 링크가 안 열린다`);
    for (const [, name] of s.branches ?? []) {
      assert.equal(name, name.trim(), `${s.key} 지점명에 앞뒤 공백`);
      assert.ok(name.length > 0);
    }
  }
});
