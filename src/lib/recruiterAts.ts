// 🔴 `server-only` 를 안 붙인다 — 순수 파서·매핑이 Node 시험에서 돌아야 한다(alio.ts 와 같은 이유).
//    이 파일에는 비밀이 없다(인증 없는 공개 채용 페이지).
import { jobCategoryOf, employmentTypeOf } from "./alio.ts";

/**
 * 대학병원 채용 ATS(마이다스인 「리크루터」) 수집 — **사립 상급종합병원**의 간호 공고.
 *
 * 왜 필요한가(2026-08-11):
 * 잡알리오는 **공공기관만** 다룬다. 상급종합병원 47곳 중 실제로 공고를 얻을 수 있던 곳은 3곳뿐이었고,
 * 세브란스·고대의료원·한양대·중앙대·아주대 같은 사립은 원천 자체가 없었다.
 * 그런데 이들 상당수가 **같은 ATS 를 쓴다** — 병원마다 서브도메인만 다르고 경로·응답이 같다.
 * 그래서 병원별 파서 20개가 아니라 **파서 하나**로 20개 기관이 열린다.
 *   실측: 접수중 169건 중 간호 34건(알리오 8건의 4배).
 *
 * 계약:
 *   목록 `POST /app/jobnotice/list.json` (인증 없음, form body `page`·`pageSize`)
 *   상세 `GET  /app/jobnotice/view?systemKindCode=MRS2&jobnoticeSn=…`
 *
 * 🔴 간호 판정은 **제목만** 본다. 상세 본문까지 봐도 더 찾아지는 것이 **0건**이었다
 *    (실측: 접수중 169건 전수 대조). 본문을 보면 "간호사 면허 우대" 한 줄 붙은 행정직만 딸려 온다.
 */
const PAGE_SIZE = 100; // 응답이 받아 주는 최대(화면 셀렉트도 100 이 최대)
const MAX_PAGES = 5; // 접수중이 이어지는 동안만 넘긴다 — 최대 500건이면 어느 병원이든 넉넉하다
const CONCURRENCY = 6; // 병원 사이트다 — 과하게 두드리지 않는다

type Tenant = {
  /** `{host}.recruiter.co.kr` */
  host: string;
  /** 기본 병원명 — **심사평가원 명부의 정확한 이름**이어야 종별·지역이 붙는다(lib/hospitalRegistry). */
  hospital: string;
  /** 한 테넌트가 여러 병원을 쓸 때, 제목으로 가른다. 위에서부터 첫 매칭. `[정규식, 명부명]` */
  branches?: ReadonlyArray<readonly [RegExp, string]>;
};

/**
 * 🖥 화면에 쓸 이름. 명부명은 법인명이 붙어 있어 채용 카드에 그대로 쓰면 못 읽는다 —
 *    "학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)" 같은 것이 카드에 찍힌다.
 *    **매칭은 명부명으로, 표시는 이 이름으로** 한다(둘을 하나로 합치면 종별이 안 붙는다).
 */
const DISPLAY_NAME: Readonly<Record<string, string>> = {
  "학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)": "고려대학교 안암병원",
  "고려대학교의과대학부속구로병원": "고려대학교 구로병원",
  "고려대학교의과대학부속안산병원": "고려대학교 안산병원",
  "의료법인 길의료재단 길병원": "길병원",
  "연세대학교의과대학세브란스병원": "세브란스병원",
  "연세대학교의과대학 강남세브란스병원": "강남세브란스병원",
  "연세대학교 의과대학 용인세브란스병원": "용인세브란스병원",
  "연세대학교 원주세브란스기독병원": "원주세브란스기독병원",
  "서울특별시서울의료원": "서울의료원",
  "인하대학교의과대학부속병원": "인하대학교병원",
  "학교법인 울산공업학원 울산대학교병원": "울산대학교병원",
};

/** 명부명 → 화면용 이름. 표에 없으면 명부명이 이미 읽을 만하다는 뜻이라 그대로 쓴다. */
export const displayNameOf = (hospital: string): string => DISPLAY_NAME[hospital] ?? hospital;

/**
 * 🔴 병원명은 전부 **명부에 있는 이름 그대로** 확인해서 넣었다(2026-08-11). 한 글자만 달라도
 *    종별("상급종합병원")과 지역이 안 붙어 필터에서 사라진다.
 * 🔴 한 테넌트가 여러 병원인 곳이 있다 — 고려대의료원(안암·구로·안산), 연세의료원(신촌·강남·용인·원주),
 *    중앙대(서울·광명), 경북대(대구·칠곡). 제목 앞에 지점이 적혀 있어 그걸로 가른다.
 */
export const TENANTS: readonly Tenant[] = [
  { host: "ajoumc", hospital: "아주대학교병원" },
  { host: "caumc", hospital: "중앙대학교병원", branches: [[/광명/, "중앙대학교광명병원"]] },
  { host: "cbnuh", hospital: "충북대학교병원" },
  { host: "cnuh", hospital: "전남대학교병원", branches: [[/화순/, "화순전남대학교병원"], [/빛고을/, "빛고을전남대학교병원"]] },
  { host: "dcmc", hospital: "대구가톨릭대학교병원" },
  { host: "gilhospital", hospital: "의료법인 길의료재단 길병원" },
  { host: "gnuh", hospital: "경상국립대학교병원", branches: [[/창원/, "창원경상국립대학교병원"]] },
  { host: "hyumc", hospital: "한양대학교병원" },
  { host: "jbuh", hospital: "전북대학교병원" },
  { host: "khu", hospital: "경희대학교병원", branches: [[/강동/, "강동경희대학교병원"]] },
  { host: "knuh", hospital: "경북대학교병원", branches: [[/칠곡/, "칠곡경북대학교병원"]] },
  {
    host: "kumc",
    hospital: "학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)",
    branches: [[/구로/, "고려대학교의과대학부속구로병원"], [/안산/, "고려대학교의과대학부속안산병원"]],
  },
  { host: "pnuh", hospital: "부산대학교병원" },
  { host: "pnuyh", hospital: "양산부산대학교병원" },
  { host: "snubh", hospital: "분당서울대학교병원" },
  { host: "snudh", hospital: "서울대학교치과병원", branches: [[/관악/, "관악서울대학교치과병원"]] },
  { host: "wkuh", hospital: "원광대학교병원" },
  {
    host: "yuhs",
    hospital: "연세대학교의과대학세브란스병원", // 제목의 "[일반-신촌]" 이 기본이다
    branches: [
      [/강남/, "연세대학교의과대학 강남세브란스병원"],
      [/용인/, "연세대학교 의과대학 용인세브란스병원"],
      [/원주/, "연세대학교 원주세브란스기독병원"],
    ],
  },
  { host: "amc", hospital: "경상북도안동의료원" },
  { host: "smc", hospital: "서울특별시서울의료원" },
  // 🔴 아래는 **검색으로 찾았다**(오너 제안 2026-08-12). 서브도메인을 약어로 넘겨짚어 찔러보는
  //    방식으로는 못 찾은 것들이다 — 인하대는 `inha` 가 아니라 `inhauh`, 고신대는 `kosin` 이 아니라
  //    `kosinmed` 였다. "이 병원 채용공고" 를 검색하면 실제 주소가 결과에 그대로 나온다.
  //    막혔다고 적어 뒀던 인하대·울산대가 사실 이 ATS 에 있었다.
  { host: "inhauh", hospital: "인하대학교의과대학부속병원" },
  { host: "uuh", hospital: "학교법인 울산공업학원 울산대학교병원" },
  { host: "nmc", hospital: "국립중앙의료원" },
  { host: "ncc", hospital: "국립암센터" },
  { host: "scmc", hospital: "성남시의료원" },
  {
    // 🔴 백병원은 자체 사이트(lib/hospitalSites)로도 긁을 수 있지만 **여기로 몰았다.**
    //    같은 공고를 두 곳에서 담으면 external_id 가 달라 카드가 두 번 뜬다.
    //    ATS 쪽이 더 많이(7 vs 3) 그리고 마감일·고용형태까지 준다.
    host: "paik",
    hospital: "인제대학교부산백병원",
    branches: [
      [/상계/, "인제대학교 상계백병원"],
      [/일산/, "인제대학교일산백병원"],
      [/해운대/, "인제대학교 해운대백병원"],
    ],
  },
];

/** 목록 응답 한 건(우리가 쓰는 필드만). 날짜는 `{ time: epoch밀리초 }` 모양으로 온다. */
export type AtsRaw = {
  jobnoticeSn: number;
  jobnoticeName: string;
  receiptState: string; // "접수중" | "마감" …
  recruitClassName: string; // "공채" | "정규직" | "계약직" | "임시직" …
  applyStartDate?: { time: number } | null;
  applyEndDate?: { time: number } | null;
};

export type AtsJob = {
  id: string; // `${host}-${jobnoticeSn}` → jobs.external_id (공고번호가 병원마다 겹쳐 호스트를 붙인다)
  host: string;
  sn: number; // 원본 공고번호 — id 를 문자열로 되쪼개지 않으려고 그대로 들고 다닌다

  title: string;
  hospital: string; // 명부 정확명 — 종별·지역 매칭에 쓴다
  displayName: string; // 화면에 보일 이름 — jobs.company_name
  employmentType: string | null;
  jobCategory: "간호직" | "간호조무직";
  postedAt: string | null; // "YYYY-MM-DD"
  deadline: string | null;
  url: string;
};

/** epoch 밀리초 → KST 기준 "YYYY-MM-DD". 값이 없으면 null. */
export function kstDate(t: number | null | undefined): string | null {
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return null;
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 제목으로 지점을 가린다. 규칙이 없으면 테넌트 기본 병원. */
export function hospitalOf(tenant: Tenant, title: string): string {
  return tenant.branches?.find(([re]) => re.test(title))?.[1] ?? tenant.hospital;
}

export const atsUrl = (host: string, sn: number | string) =>
  `https://${host}.recruiter.co.kr/app/jobnotice/view?systemKindCode=MRS2&jobnoticeSn=${sn}`;

/** 접수중인 간호 공고인가 — 제목만 본다(위 주석의 실측 근거). */
export const isOpenNurse = (r: AtsRaw): boolean =>
  r?.receiptState === "접수중" && /간호/.test(r.jobnoticeName ?? "");

/** 목록 한 건 → 우리 모양. 공고번호·제목이 없으면 버린다. */
export function toAtsJob(tenant: Tenant, r: AtsRaw): AtsJob | null {
  // 공고번호는 URL 과 external_id 에 들어간다 — 문자열이 섞여 오면 버린다(원문을 그대로 끼워 넣지 않는다).
  const sn = Number(r?.jobnoticeSn);
  if (!Number.isInteger(sn) || sn <= 0 || !r.jobnoticeName) return null;
  const title = r.jobnoticeName.trim();
  const hospital = hospitalOf(tenant, title);
  return {
    id: `${tenant.host}-${sn}`,
    host: tenant.host,
    sn,
    title,
    hospital,
    displayName: displayNameOf(hospital),
    // 고용형태는 채용구분(공채/정규직/임시직)과 제목 둘 다에 흩어져 있다 — 붙여서 한 번에 본다.
    employmentType: employmentTypeOf(`${r.recruitClassName ?? ""} ${title}`),
    jobCategory: jobCategoryOf(title, null),
    postedAt: kstDate(r.applyStartDate?.time),
    deadline: kstDate(r.applyEndDate?.time),
    url: atsUrl(tenant.host, sn),
  };
}

/** 한 페이지. 응답이 기대한 모양이 아니면 **던진다** — 아래 주석의 이유로 빈 배열로 넘기면 안 된다. */
async function fetchPage(host: string, page: number): Promise<AtsRaw[]> {
  const res = await fetch(`https://${host}.recruiter.co.kr/app/jobnotice/list.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (compatible; nurse-link-collector/1.0)",
    },
    // 🔴 페이지 파라미터는 `currentPage` 다. `page` 로 보내면 **조용히 무시되고 늘 1페이지가 온다**
    //    (실측 2026-08-11: page=2 로 요청해도 currentPage=1, 같은 목록). 이름을 바꾸지 말 것.
    body: `currentPage=${page}&pageSize=${PAGE_SIZE}`,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${host} 목록 ${res.status}`);
  const body = await res.json();
  // 🔴 `list` 가 배열이 아니면 **실패로 친다.** 빈 배열로 넘기면 부르는 쪽이 "이 병원은 공고가
  //    없구나" 로 읽고 그 병원 공고를 전부 마감시킨다. 점검 페이지가 200 을 주는 경우가 그렇다.
  if (!Array.isArray(body?.list)) throw new Error(`${host} 목록 응답이 예상과 다르다`);
  return body.list as AtsRaw[];
}

/**
 * 한 테넌트의 접수중 간호 공고.
 * 🔴 접수중 공고는 최신순 앞쪽에 몰려 있어 오늘은 1페이지로 충분하지만(실측: 2페이지부터 접수중 0),
 *    그건 **보장이 아니라 관측**이다. 접수중이 하나라도 있는 페이지가 이어지는 동안 계속 넘긴다.
 */
async function fetchTenant(tenant: Tenant): Promise<AtsJob[]> {
  const out: AtsJob[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await fetchPage(tenant.host, page);
    const open = rows.filter(isOpenNurse);
    for (const r of open) {
      const j = toAtsJob(tenant, r);
      if (j) out.push(j);
    }
    // 접수중이 한 건도 없는 페이지를 만나면 그 뒤는 전부 마감분이다(목록이 최신순).
    if (rows.length < PAGE_SIZE || rows.every((r) => r.receiptState !== "접수중")) break;
  }
  return out;
}

/**
 * 모든 테넌트에서 접수중 간호 공고를 모은다.
 *
 * 🔴 한 병원 사이트가 죽어도 **나머지는 살린다.** 20곳을 한 줄에 꿰면 어느 한 곳의 점검 시간에
 *    전체 수집이 0건이 되고, 부르는 쪽이 살아 있는 공고를 전부 마감시킨다.
 *    대신 **몇 곳이 실패했는지 돌려준다** — 부르는 쪽이 그 수를 보고 마감 처리를 건너뛴다.
 */
export async function fetchNurseAtsJobs(
  tenants: readonly Tenant[] = TENANTS,
  fetchOne: (t: Tenant) => Promise<AtsJob[]> = fetchTenant,
): Promise<{ jobs: AtsJob[]; failed: string[] }> {
  const jobs: AtsJob[] = [];
  const failed: string[] = [];
  for (let i = 0; i < tenants.length; i += CONCURRENCY) {
    const settled = await Promise.all(
      tenants.slice(i, i + CONCURRENCY).map(async (t) => {
        try {
          return { host: t.host, rows: await fetchOne(t) };
        } catch {
          return { host: t.host, rows: null };
        }
      }),
    );
    for (const s of settled) {
      if (s.rows === null) failed.push(s.host);
      else jobs.push(...s.rows);
    }
  }
  return { jobs, failed };
}

/** 상세 본문(모집부문·지원자격·전형절차). 실패하면 null — 목록만으로도 공고는 성립한다. */
export async function fetchAtsDescription(host: string, sn: string): Promise<string | null> {
  try {
    const res = await fetch(atsUrl(host, sn), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; nurse-link-collector/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return extractBody(await res.text());
  } catch {
    return null;
  }
}

/** 상세 HTML → 읽을 수 있는 본문. 태그가 잘게 쪼개져 있어 줄 단위로 모은 뒤 다시 잇는다. */
export function extractBody(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<\/?(?:p|div|br|tr|li|h\d)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const lines = text.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  // 채용 본문은 "채용개요"·"모집" 부터가 알맹이다. 못 찾으면 전체에서 앞뒤 군더더기만 덜어낸다.
  const start = lines.findIndex((l) => /채용개요|모집부문|모집분야|지원자격/.test(l));
  const body = (start >= 0 ? lines.slice(Math.max(0, start - 2)) : lines).join("\n").trim();
  if (body.length < 20) return null;
  // 🔴 자를 때는 **잘랐다고 말한다.** 아무 말 없이 끊으면 간호사가 그게 공고 전문인 줄 알고
  //    뒤에 있는 접수기간·제출서류를 못 본다. 원본 링크는 카드·상세에 이미 있다.
  return body.length > LIMIT ? `${body.slice(0, LIMIT)}\n\n… 이하 생략 — 원본 공고에서 전문을 확인하세요.` : body;
}

const LIMIT = 4000;
