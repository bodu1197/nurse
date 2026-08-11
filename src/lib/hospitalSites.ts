// 🔴 `server-only` 를 안 붙인다 — 파서가 Node 시험에서 돌아야 한다(recruiterAts.ts 와 같은 이유).
import { jobCategoryOf } from "./alio.ts";

/**
 * 자체 채용 홈페이지를 쓰는 상급종합병원 수집.
 *
 * 마이다스인 ATS(lib/recruiterAts)로 20곳을 열고 남은 병원들이다. 이들은 공용 솔루션이 아니라
 * **각자 만든 게시판**이라 사이트마다 주소도 마크업도 다르다. 그렇다고 파일을 병원 수만큼 만들지 않는다 —
 * 공고 하나가 결국 "상세 링크 + 제목 + 마감일" 이라는 점은 같으므로, **링크 패턴만 설정으로 받는
 * 엔진 하나**로 처리한다. 병원이 늘면 SITES 에 줄을 더한다.
 *
 * 🔴 여기 없는 병원은 **아직 못 여는 것**이다(삼성서울·서울아산·서울대·서울성모·강북삼성 등).
 *    링크 패턴을 못 찾았거나 접속이 막혀 있다 — 확인되는 대로 SITES 에 추가한다.
 */
export type Site = {
  /** external_id 접두. 호스트 접두로 마감 처리 범위를 좁히므로 '-' 를 넣지 말 것. */
  key: string;
  /** 심사평가원 명부의 정확한 이름(기본) — 종별·지역이 여기서 붙는다. */
  hospital: string;
  /** 화면에 보일 이름. 명부명에 법인명이 붙어 카드에 못 쓸 때만 적는다. */
  display?: string;
  listUrl: string;
  /** 상세 링크 정규식(따옴표 안의 href 값). 캡처 없이 전체가 링크가 되게 쓴다. */
  linkPattern: RegExp;
  /**
   * 공고를 유일하게 가리키는 쿼리 파라미터들(순서대로 이어 붙여 external_id 를 만든다).
   * 🔴 "링크의 마지막 숫자" 같은 편법을 쓰면 안 된다 — 한림은 마지막 숫자가 **연도(adoptyy=2026)** 라
   *    그 해 공고가 전부 같은 id 로 뭉개진다. 반대로 링크 전체를 id 로 쓰면 `pageIndex` 처럼
   *    페이지가 바뀌면 같이 변하는 값 때문에 **같은 공고가 새 공고로 다시 들어온다.**
   *    그래서 무엇이 공고를 가리키는지 사이트마다 못 박는다.
   */
  idParams: readonly string[];
  /**
   * 링크가 URL 이 아니라 `href="javascript:view('1933')"` 인 사이트용.
   * 캡처 1번이 공고 id 이고, 그 id 로 detailUrl 이 실제 주소를 만든다.
   * 🔴 이런 사이트는 상세가 **POST 폼**인 경우가 있다 — GET 으로 열리는 주소를 반드시 확인하고 적을 것.
   *    안 열리는 주소를 넣으면 간호사가 눌렀을 때 빈 화면을 본다.
   */
  idPattern?: RegExp;
  detailUrl?: (id: string) => string;
  /** 제목으로 병원을 가르는 규칙(한 사이트가 여러 병원일 때). 위에서부터 첫 매칭. */
  branches?: ReadonlyArray<readonly [RegExp, string]>;
};

export const SITES: readonly Site[] = [
  {
    key: "hallym",
    hospital: "한림대학교성심병원",
    listUrl: "https://recruit.hallym.or.kr/index.jsp",
    linkPattern: /hrt_p20_detail\.jsp\?[^"']+/,
    // 공고를 가리키는 건 (지점, 연도, 회차) 셋의 조합이다. adoptcnt 만 쓰면 해가 바뀔 때 겹친다.
    idParams: ["locate", "adoptyy", "adoptcnt"],
    // 한 페이지에 평촌·동탄·춘천·강남이 섞여 나온다. 명부에 따로 있는 곳만 갈라 준다.
    // 🔴 명부 표기를 **글자 그대로** 옮긴다. '강남성심'·'한강성심'은 명부에 공백이 들어 있어
    //    붙여 쓰면 매칭이 안 되고 종별·지역이 통째로 비어 버린다.
    branches: [
      [/동탄/, "한림대학교동탄성심병원"],
      [/춘천/, "한림대학교춘천성심병원"],
      [/강남/, "한림대학교 강남성심병원"],
      [/한강/, "한림대학교 한강성심병원"],
    ],
  },
  {
    key: "eumc",
    hospital: "이화여자대학교의과대학부속목동병원",
    listUrl: "https://www.eumc.ac.kr/intro/recrut/list.do",
    linkPattern: /\.\/view\.do\?bbs_no=\d+[^"']*/,
    // 🔴 pageIndex 는 넣지 않는다 — 공고가 2페이지로 밀리면 id 가 바뀌어 같은 공고가 새로 들어온다.
    idParams: ["bbs_no"],
    branches: [[/서울병원/, "이화여자대학교의과대학부속서울병원"]],
  },
  {
    key: "gnah",
    hospital: "강릉아산병원",
    listUrl: "https://www.gnah.co.kr/kor/CMS/RecruitMgr/list.do?mCode=MN122",
    linkPattern: /\/kor\/CMS\/RecruitMgr\/view\.do\?[^"']*recruit_seq=\d+/,
    idParams: ["recruit_seq"],
  },
  {
    key: "cmcism",
    hospital: "가톨릭대학교인천성모병원",
    listUrl: "https://www.cmcism.or.kr/center/recruit_list",
    // href 끝에 `&` 가 붙어 오므로 `seq=\d+` 로 끊으면 안 된다 — 뒤를 열어 둔다.
    linkPattern: /\/center\/recruit_view\?seq=\d+[^"']*/,
    idParams: ["seq"],
  },
  {
    key: "dsmc",
    hospital: "계명대학교동산병원",
    listUrl: "https://www.dsmc.or.kr/content/01dsmc/07_03.php",
    linkPattern: /\/content\/01dsmc\/07_03\.php\?proc_type=view[^"']+/,
    // b_num 이 공고를 가른다(a_num 은 게시판 번호라 모든 행이 같다).
    idParams: ["b_num"],
    branches: [
      [/대구동산/, "계명대학교대구동산병원"],
      [/경주동산/, "계명대학교 경주동산병원"],
    ],
  },
  {
    key: "kyuh",
    hospital: "학교법인 건양교육재단 건양대학교병원",
    display: "건양대학교병원",
    // 🔴 `/prog/recruitNotice/list.do` 는 직종 필터를 붙여도 **0건**이 온다(실측) — 목록이
    //    JS 로 그려진다. 반면 `/recruit/index.do` 는 서버가 공고를 박아서 준다.
    listUrl: "https://www.kyuh.ac.kr/recruit/index.do",
    linkPattern: /\/prog\/recruitNotice\/view\.do\?noticeId=[^"']+/,
    idParams: ["noticeId"],
    branches: [[/부여/, "학교법인 건양교육재단 건양대학교부여병원"]],
  },
  {
    key: "kosin",
    hospital: "고신대학교복음병원",
    listUrl: "https://www.kosinmed.or.kr/service/service_3.php",
    linkPattern: /\/service\/service_3\.php\?boardid=recruit[^"']*mode=view[^"']*idx=\d+/,
    idParams: ["idx"],
  },
  {
    key: "kuh",
    hospital: "건국대학교병원",
    // 🔴 홈(`/`)은 `location.href="main.do"` 만 든 리다이렉트 껍데기(286바이트)라 링크가 안 보였다.
    //    JS 앱이 아니라 그냥 한 단계 더 들어가야 하는 사이트였다.
    listUrl: "https://www.kuh.ac.kr/recruit/apply/noticeList.do",
    linkPattern: /\/recruit\/apply\/noticeView\.do\?anc_seq=\d+[^"']*/,
    idParams: ["anc_seq"],
  },
  // 🔴 백병원(paik)은 여기 있었는데 **뺐다.** 같은 병원이 마이다스인 ATS 에도 있고
  //    (paik.recruiter.co.kr, 간호 7건 vs 자체 사이트 3건), 두 곳에서 담으면 external_id 가
  //    달라 **같은 공고 카드가 두 번 뜬다.** 더 많이·더 정확히(마감일·고용형태) 주는 ATS 로 몰았다
  //    — lib/recruiterAts 의 TENANTS 를 볼 것.
];

export type SiteJob = {
  id: string; // `${key}-${상세링크에서 뽑은 번호}`
  title: string;
  hospital: string; // 명부 매칭용
  displayName: string; // 화면용(jobs.company_name)
  jobCategory: "간호직" | "간호조무직";
  deadline: string | null;
  url: string;
};

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/** 앵커 안쪽 텍스트 → 한 줄. 태그·공백을 걷어낸다. */
export const anchorText = (inner: string): string =>
  decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const noSpace = (s: string) => s.replace(/\s+/g, "");

/**
 * 카드에 보일 제목만 남긴다.
 *
 * 목록의 한 칸이 통째로 앵커라 **병원명·마감일·D-day 가 제목에 섞여 들어온다.**
 * 실제로 화면에 이렇게 나갔다(2026-08-12):
 *   "한림 대학교성심병원 한림대학교성심병원 간호부 정규직 전담간호사 공개채용 공고 마감일 2026.08.31 D-19"
 * 마감일은 이미 카드가 따로 보여 주고, 병원명도 카드에 따로 있다 — 제목에서는 걷어낸다.
 *
 * 🔴 앞에 붙는 병원명은 **띄어쓰기가 목록마다 다르다**("한림 대학교성심병원" vs "한림대학교성심병원").
 *    그래서 글자만 비교해서(공백 무시) 앞 토큰부터 갉아낸다.
 */
export function cleanTitle(text: string, hospital: string): string {
  let t = text
    .replace(/D-\s*\d+/g, " ")
    .replace(/D-?DAY/gi, " ")
    .replace(/마감일\s*\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, " ")
    .replace(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}[^~]{0,12}~[^,\n]{0,30}/g, " ")
    .replace(/^\s*(?:공지|모집중|진행중|접수중|마감)\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // 앞머리에 병원명이 (띄어쓰기가 어긋난 채로) 최대 두 번까지 붙어 온다 — 붙은 만큼 떼어낸다.
  const target = noSpace(hospital);
  for (let round = 0; round < 2; round++) {
    const words = t.split(" ");
    let acc = "";
    let used = 0;
    for (const w of words) {
      acc += noSpace(w);
      used++;
      if (acc === target) break;
      if (!target.startsWith(acc)) { used = 0; break; }
    }
    if (used > 0 && acc === target) t = words.slice(used).join(" ").trim();
    else break;
  }
  return t;
}

/** 텍스트에 든 날짜 중 **가장 뒤의 것**을 마감일로 본다("2026-07-09 ~ 2026-09-30" 형태를 그대로 흡수). */
export function lastDate(text: string): string | null {
  const all = [...text.matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)];
  const m = all[all.length - 1];
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** 상세 링크에서 공고 식별자를 뽑는다. 지정한 파라미터가 하나도 없으면 null(그 행은 버린다). */
export function idFromLink(link: string, params: readonly string[]): string | null {
  const parts: string[] = [];
  for (const p of params) {
    const v = link.match(new RegExp(`[?&]${p}=([^&"'#]+)`))?.[1];
    if (v) parts.push(v.replace(/[^A-Za-z0-9]/g, ""));
  }
  return parts.length > 0 ? parts.join("_") : null;
}

const abs = (listUrl: string, link: string) => new URL(link, listUrl).toString();

/**
 * 목록 HTML → 간호 공고.
 * 🔴 제목에 '간호' 가 있는 것만 담는다. 이 병원들은 목록에 직종 구분을 안 주는 곳이 많다.
 */
export function parseSite(site: Site, html: string): SiteJob[] {
  const re = new RegExp(`href=["'](${site.linkPattern.source})["'][^>]*>([\\s\\S]{0,800}?)</a>`, "g");
  const out: SiteJob[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(re)) {
    const text = anchorText(m[2]);
    if (!/간호/.test(text)) continue;
    const sn = site.idPattern ? m[1].match(site.idPattern)?.[1] ?? null : idFromLink(m[1], site.idParams);
    if (!sn) continue;
    const id = `${site.key}-${sn}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // 지점이 걸리면 그 병원 이름을 화면에도 그대로 쓴다(지점명은 이미 읽을 만하다).
    const branch = site.branches?.find(([r]) => r.test(text))?.[1];
    const hospital = branch ?? site.hospital;
    // 🔴 마감일은 lastDate 가 **정리 전 원문**에서 뽑는다 — 제목에서 날짜를 걷어낸 뒤 찾으면 사라진다.
    const title = cleanTitle(text, hospital);
    if (!title) continue;
    out.push({
      id,
      title: title.slice(0, 200),
      hospital,
      displayName: branch ?? site.display ?? site.hospital,
      jobCategory: jobCategoryOf(text, null),
      deadline: lastDate(text),
      url: site.detailUrl ? site.detailUrl(sn) : abs(site.listUrl, m[1]),
    });
  }
  return out;
}

async function fetchSite(site: Site): Promise<SiteJob[]> {
  const res = await fetch(site.listUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; nurse-link-collector/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${site.key} 목록 ${res.status}`);
  const html = await res.text();
  // 🔴 링크가 하나도 안 잡히면 **실패로 친다.** 빈 배열로 넘기면 부르는 쪽이 "공고가 없구나" 로 읽고
  //    그 병원 공고를 전부 마감시킨다. 사이트 개편으로 마크업이 바뀌면 정확히 이 모양이 된다.
  if (!new RegExp(site.linkPattern.source).test(html)) throw new Error(`${site.key} 상세 링크를 못 찾았다 — 마크업이 바뀌었다`);
  return parseSite(site, html);
}

/** 사이트 하나가 죽어도 나머지는 살린다. 죽은 곳은 돌려줘야 부르는 쪽이 마감 처리를 건너뛴다. */
export async function fetchNurseSiteJobs(
  sites: readonly Site[] = SITES,
  fetchOne: (s: Site) => Promise<SiteJob[]> = fetchSite,
): Promise<{ jobs: SiteJob[]; failed: string[] }> {
  const settled = await Promise.all(
    sites.map(async (s) => {
      try {
        return { key: s.key, rows: await fetchOne(s) };
      } catch {
        return { key: s.key, rows: null };
      }
    }),
  );
  const jobs: SiteJob[] = [];
  const failed: string[] = [];
  for (const s of settled) {
    if (s.rows === null) failed.push(s.key);
    else jobs.push(...s.rows);
  }
  return { jobs, failed };
}
