// 🔴 `server-only` 를 안 붙인다 — 파서가 Node 시험에서 돌아야 한다(hospitalSites 와 같은 이유).
import { jobCategoryOf } from "./alio.ts";
import { decodeEntities, readHtml } from "./html.ts";
import { cleanTitle, lastDate } from "./hospitalSites.ts";

/**
 * 집계 사이트 수집 — **여러 병원의 공고를 한 목록에 모아 놓은 곳**.
 *
 * 🔴 `lib/hospitalSites` 와 왜 나눴나: 그쪽은 `Site` 하나에 병원 하나를 가정해 `hospital`(명부명)이
 *    **설정 고정값**이다. 집계 사이트는 한 목록에 39건이면 39개 병원이라 **회사명을 행마다 읽어야**
 *    한다. 억지로 한 엔진에 밀어 넣으면 잘 돌고 있는 단일 병원 9곳까지 흔들린다 — 따로 둔다.
 *
 * 지금 대상: **고용노동부 인재채움뱅크**(matchingbank.career.co.kr, career.co.kr 위탁).
 *   「대체인력」(육아휴직·출산 대체) 전문이라 워크넷에 안 올라오는 공고가 많다.
 *   실측(2026-08-12, 39건 대조): 우리 DB 와 겹치는 것 **2건(5%)**, 31건은 아예 없던 공고.
 */
export type Board = {
  /** external_id 접두. 마감 처리 범위를 이 접두로 좁히므로 '-' 를 넣지 말 것. */
  key: string;
  /** 사람이 읽을 출처 이름 — 로그·모니터링 화면에 쓴다. */
  label: string;
  /** 페이지 번호로 목록 주소를 만든다. */
  pageUrl: (page: number) => string;
  /** 몇 쪽까지 볼 것인가(간호 공고가 끊기면 그전에 멈춘다). */
  maxPages: number;
};

export const BOARDS: readonly Board[] = [
  {
    key: "mbank",
    label: "고용노동부 인재채움뱅크",
    // jc=M003 = 간호사·간호조무사. 🔴 이 필터를 믿으면 안 된다 — 원무·물리치료사가 섞여 온다(실측).
    //    제목에 '간호' 검사를 아래에서 한 번 더 한다.
    pageUrl: (p) => `https://matchingbank.career.co.kr/jobs/list.asp?page=${p}&so3=1&jc=M003&sch_so=3&pagesize=20`,
    maxPages: 5,
  },
];

export type BoardJob = {
  id: string; // `${key}-${공고번호}`
  /** 사이트가 준 회사명. 법인명이 붙어 있다 — "삼정의료재단포항여성병원". */
  company: string;
  /**
   * 화면에 쓸 이름이자 명부 조회 1순위. 제목 앞 `[포항여성병원]` 에서 뽑는다.
   * 없으면 company 를 그대로 쓴다.
   */
  label: string;
  title: string;
  jobCategory: "간호직" | "간호조무직";
  deadline: string | null;
  url: string;
};

/**
 * 제목 앞 `[기관명]` 을 떼어 **부를 만한 이름**으로 쓴다.
 *
 * 🔴 사이트가 주는 회사명은 법인 등기명이라("(학)가톨릭학원가톨릭대학교성빈센트병원")
 *    ① 카드에 그대로 찍히면 못 읽고 ② 심사평가원 명부와 이름이 안 맞아 **종별·지역·좌표가 통째로
 *    빈다** = 「내 주변 채용」에서 빠진다. 제목의 대괄호에는 보통 진짜 병원명이 들어 있다.
 * 🔴 단, `[경남 김해]` 같은 **지역 태그**도 같은 자리에 온다. 병원류 접미로 끝날 때만 이름으로 친다 —
 *    아니면 지역명이 병원명 자리에 찍히고 명부 조회도 헛돈다.
 */
export function labelOf(title: string, company: string): { label: string; rest: string } {
  const m = title.match(/^\s*\[\s*([^\]]{2,30}?)\s*\]\s*/);
  if (m && isOrgName(m[1], company)) return { label: m[1], rest: title.slice(m[0].length) };
  // 지역 태그는 정보라 제목에 남긴다.
  return { label: company, rest: title };
}

/** 대괄호 안이 기관명인가 — 병원류 접미로 끝나거나, 회사명과 사실상 같은 이름일 때. */
const isOrgName = (inner: string, company: string): boolean => {
  if (/(병원|의원|요양원|의료원|보건소|한의원|치과|클리닉|센터|타운|재단|약국)$/.test(inner)) return true;
  // "[중증장애인요양시설송죽원]" vs "중증장애인요양시설 송죽원" 처럼 띄어쓰기·괄호만 다른 경우.
  // 🔴 4자 미만은 검사하지 않는다 — 짧은 조각이 회사명에 우연히 들어 있어 지역 태그를 이름으로 오인한다.
  const a = bare(inner);
  const b = bare(company);
  return a.length >= 4 && (b.startsWith(a) || a.startsWith(b));
};

const bare = (s: string) => s.replace(/[\s()（）[\]·.,\-–—]/g, "");

/**
 * 목록 HTML → 공고.
 *
 * 🔴 회사명과 제목이 **다른 블록**에 있다:
 *      `<span class="tx">회사명</span> … <a href="/jobs/view.asp?id_num=N" class="tx">제목</a>`
 *    앵커만 보는 정규식으로는 짝이 안 맞아 회사명이 통째로 빈다. 둘을 한 번에 잡는다.
 * 🔴 `.{0,3000}?` 는 **최소 일치**다. 탐욕적으로 두면 앞쪽 회사명이 뒤쪽 공고에 붙는다 —
 *    간호사 공고에 엉뚱한 병원 이름이 찍히는 종류의 버그다.
 */
export function parseMbank(html: string): BoardJob[] {
  const re = /<span class="tx">([\s\S]*?)<\/span>[\s\S]{0,3000}?<a href="(\/jobs\/view\.asp\?id_num=(\d+))[^"]*" class="tx">([\s\S]*?)<\/a>/g;
  const out: BoardJob[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(re)) {
    const company = text(m[1], NAME_MAX);
    const title = text(m[4], TITLE_MAX);
    const sn = m[3];
    // 사이트 필터가 원무·물리치료사를 섞어 보내므로 우리가 다시 거른다.
    if (!company || !title || !/간호/.test(title)) continue;
    const id = `mbank-${sn}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // 제목이 "[병원명] 실제 제목" 형태다 — 카드에 이름이 두 번 찍히지 않게 걷어낸다.
    const { label, rest } = labelOf(title, company);
    out.push({
      id,
      company,
      label,
      title: cleanTitle(rest, label),
      jobCategory: jobCategoryOf(title, null),
      deadline: lastDate(title),
      url: `https://matchingbank.career.co.kr${m[2]}`,
    });
  }
  return out;
}

/**
 * 태그·엔티티를 걷어낸 알맹이 글자.
 * 🔴 길이를 자른다 — 회사명은 사이트가 주는 값이라 상한이 없는데, 이 이름을 그대로 명부 조회
 *    `.in()` 에 넘긴다. 한글은 URL 인코딩에서 글자당 9바이트라 이름 하나가 길면 **조회 전체가
 *    실패해 종별·지역·좌표가 통째로 빈다**(이 저장소가 이미 한 번 당한 함정 — hospitalRegistry 주석).
 */
/** 명부 조회(`.in()`)에 실릴 이름 상한. 제목은 카드에 쓰는 값이라 조금 더 길게 둔다. */
const NAME_MAX = 100;
const TITLE_MAX = 200;

const text = (s: string, max: number) =>
  decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "))
    // 숫자 엔티티(&#39; 등)도 푼다 — 병원명에 작은따옴표·괄호가 섞여 온다.
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

async function fetchPage(board: Board, page: number): Promise<BoardJob[]> {
  const res = await fetch(board.pageUrl(page), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; nurse-link-collector/1.0)", Accept: "text/html,*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${board.key} 목록 ${res.status}`);
  // 🔴 이 사이트는 EUC-KR 이다 — res.text() 로 읽으면 한글이 깨져 '간호' 검사에서 전부 탈락한다.
  const html = await readHtml(res);
  // 🔴 링크가 하나도 없을 때 **1쪽이면 실패**, 2쪽 이후면 **목록 끝**이다. 둘을 구분해야 한다:
  //    · 1쪽까지 비면 사이트 개편이다 — 빈 결과로 넘기면 부르는 쪽이 "공고 없음" 으로 읽고
  //      이 출처의 공고를 전부 마감시킨다.
  //    · 마지막 쪽 다음은 원래 빈 목록을 준다(실측: 간호 카테고리는 2쪽까지, 3쪽부터 0건).
  //      이걸 실패로 치면 **정상인데도 모니터링이 늘 빨간불**이고 마감 처리까지 영영 건너뛴다.
  if (!/\/jobs\/view\.asp\?id_num=\d+/.test(html)) {
    if (page === 1) throw new Error(`${board.key} 공고 링크를 못 찾았다 — 마크업이 바뀌었다`);
    return [];
  }
  return parseMbank(html);
}

/**
 * 집계 사이트에서 간호 공고를 모은다.
 * 🔴 한 곳이 죽어도 나머지는 살리고 **죽은 곳을 돌려준다** — 부르는 쪽이 그때 마감 처리를 건너뛴다.
 */
export async function fetchBoardJobs(
  boards: readonly Board[] = BOARDS,
  getPage: (b: Board, p: number) => Promise<BoardJob[]> = fetchPage,
): Promise<{ jobs: BoardJob[]; failed: string[] }> {
  const jobs: BoardJob[] = [];
  const failed: string[] = [];
  for (const b of boards) {
    try {
      const seen = new Set<string>();
      for (let p = 1; p <= b.maxPages; p++) {
        const rows = await getPage(b, p);
        // 🔴 1쪽이 0건이면 **고장으로 친다.** 링크는 있는데 한 건도 못 읽는 경우가 있다
        //    (회사명 쪽 마크업만 바뀌면 그렇다 — 회사명과 제목은 다른 블록에 있다). 그대로 빈
        //    결과를 넘기면 부르는 쪽이 "공고 없음" 으로 읽고 **이 출처 공고를 전부 마감**시킨다.
        if (p === 1 && rows.length === 0) throw new Error(`${b.key} 1쪽에서 공고를 못 읽었다 — 마크업이 바뀌었다`);
        const fresh = rows.filter((r) => !seen.has(r.id));
        // 새 공고가 없으면 마지막 쪽을 다시 받은 것이다(페이지 상한을 넘기면 그렇게 준다).
        if (fresh.length === 0) break;
        for (const r of fresh) { seen.add(r.id); jobs.push(r); }
      }
    } catch (e) {
      // 🔴 사유를 버리지 않는다 — 화면에는 사이트 이름만 남아 "왜 죽었는지" 를 알 수 없다.
      console.error(`[jobBoards] ${b.key} 수집 실패:`, e instanceof Error ? e.message : e);
      failed.push(b.key);
    }
  }
  return { jobs, failed };
}
