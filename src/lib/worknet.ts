import "server-only";

// 워크넷(고용24) 채용정보 오픈API(210L01) — 간호·요양보호 키워드 구인공고 수집.
// 응답은 고정 스키마 XML(<wanted> 반복)이라 파서 의존성 대신 정규식 추출(기존 worknet 직업정보 코드와 동일 방식).
const LIST = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";
const DETAIL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210D01.do";
// 인증키는 env 필수(하드코딩 금지). sync-hospitals의 DATA_GO_KR_API_KEY와 동일하게 미설정 시 fail-fast.
const authKey = (): string => {
  const k = process.env.WORKNET_RECRUIT_API_KEY;
  if (!k) throw new Error("WORKNET_RECRUIT_API_KEY 환경변수 누락");
  return k;
};
const PAGE = 100; // 페이지당 최대
const MAX_PAGES = 150; // 키워드당 안전 상한(요양보호 ~12000건 → 120페이지)
const CONCURRENCY = 8; // work24 동시 요청 제한(과도한 병렬은 차단/타임아웃 유발)

// 간호사·간호조무사(="간호" 부분일치) + 요양보호사. authNo로 합집합 중복 제거.
export const NURSE_KEYWORDS = ["간호", "요양보호"] as const;

export type WorknetJob = {
  authNo: string; // 채용공고번호(고유) → jobs.external_id
  company: string;
  title: string;
  salTpNm: string; // 급여형태(연봉/월급/시급)
  sal: string; // 급여 텍스트
  region: string;
  holidayTpNm: string; // 근무형태(주5일 등)
  minEdubg: string; // 학력
  career: string; // 경력
  regDt: string; // 등록일 "YY-MM-DD"
  deadline: string | null; // 마감일 "YYYY-MM-DD"(상시/무기한이면 null)
  url: string; // 공고 상세 링크
  addr: string; // 근무지 주소
  infoSvc: string; // 상세 API 호출용(VALIDATION 등)
  specialty: string | null; // title에서 추출한 진료과(필터용, JOB_SPECIALTIES 값)
  employmentType: string | null; // empTpCd/급여형태 → 고용형태(필터용, EMPLOYMENT_TYPES 값)
};

// title 키워드 → 진료과(JOB_SPECIALTIES). 첫 매칭. 없으면 null(진료과 필터에서 "전체"로만 노출).
const SPEC_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["중환자실", /중환자|ICU/i],
  ["응급실", /응급/],
  ["수술실", /수술|마취회복|\bOR\b/i],
  ["투석실", /투석/],
  ["정신과", /정신|폐쇄병동/],
  ["마취과", /마취/],
  ["외래", /외래|검진|주사실/],
  ["요양병원", /요양|재활|노인|실버|주간보호|방문/],
  ["병동", /병동|입원|일반병실/],
];
function deriveSpecialty(title: string): string | null {
  return SPEC_RULES.find(([, re]) => re.test(title))?.[0] ?? null;
}

// empTpCd(10/11 정규직, 20/21 계약직) + 급여형태(시급→파트타임) → 고용형태(EMPLOYMENT_TYPES).
function deriveEmploymentType(empTpCd: string, salTpNm: string): string | null {
  if (salTpNm === "시급") return "파트타임";
  if (empTpCd === "10" || empTpCd === "11") return "정규직";
  if (empTpCd === "20" || empTpCd === "21") return "계약직";
  return null;
}

const pick = (xml: string, tag: string) =>
  xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1].trim() ?? "";

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

// "26-07-08" 또는 "채용시까지  26-09-07" → "YYYY-MM-DD"(date). 날짜 없으면(상시채용) null.
export function parseDeadline(s: string): string | null {
  const m = [...s.matchAll(/(\d{2})-(\d{2})-(\d{2})/g)].pop();
  if (!m || m[1] >= "90") return null; // 20YY>=2090은 상시채용 센티넬 → 마감일 없음(null)
  const iso = `20${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function parsePage(xml: string): { jobs: WorknetJob[]; total: number } {
  const total = Number(pick(xml, "total")) || 0;
  const jobs = [...xml.matchAll(/<wanted>([\s\S]*?)<\/wanted>/g)].map((m) => {
    const b = m[1];
    const title = decode(pick(b, "title"));
    const salTpNm = pick(b, "salTpNm");
    return {
      authNo: pick(b, "wantedAuthNo"),
      company: pick(b, "company"),
      title,
      salTpNm,
      sal: pick(b, "sal"),
      region: pick(b, "region"),
      holidayTpNm: pick(b, "holidayTpNm"),
      minEdubg: pick(b, "minEdubg"),
      career: pick(b, "career"),
      regDt: pick(b, "regDt"),
      deadline: parseDeadline(pick(b, "closeDt")),
      url: decode(pick(b, "wantedInfoUrl")),
      addr: pick(b, "basicAddr"),
      infoSvc: pick(b, "infoSvc") || "VALIDATION",
      specialty: deriveSpecialty(title),
      employmentType: deriveEmploymentType(pick(b, "empTpCd"), salTpNm),
    };
  });
  return { jobs, total };
}

async function fetchPage(keyword: string, startPage: number): Promise<{ jobs: WorknetJob[]; total: number }> {
  const qs = new URLSearchParams({
    authKey: authKey(),
    callTp: "L",
    returnType: "XML",
    startPage: String(startPage),
    display: String(PAGE),
    keyword,
  });
  const res = await fetch(`${LIST}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`워크넷 API ${res.status}`);
  return parsePage(await res.text());
}

// 동시성 제한 배치 실행.
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

async function fetchKeyword(keyword: string): Promise<WorknetJob[]> {
  const first = await fetchPage(keyword, 1);
  if (first.jobs.length === 0) return [];
  const pages = Math.min(Math.ceil(first.total / first.jobs.length) || 1, MAX_PAGES);
  const rest = pages > 1
    ? await inBatches(Array.from({ length: pages - 1 }, (_, i) => i + 2), CONCURRENCY, (p) => fetchPage(keyword, p))
    : [];
  return [first, ...rest].flatMap((p) => p.jobs);
}

// 키워드 합집합 수집 → authNo 중복 제거.
export async function fetchNurseJobs(keywords: readonly string[] = NURSE_KEYWORDS): Promise<WorknetJob[]> {
  const all: WorknetJob[] = [];
  for (const kw of keywords) all.push(...await fetchKeyword(kw));
  const seen = new Set<string>();
  return all.filter((j) => j.authNo && !seen.has(j.authNo) && seen.add(j.authNo));
}

// 상세 API(210D01) — 리스트에 없는 풍부한 필드. 전체제목·직무내용·연락처·모집인원·근무시간·복지·전형·정확한 마감일.
export type WorknetDetail = {
  title: string | null;        // wantedTitle (앞잘림 없는 전체 제목)
  description: string | null;  // jobCont (실제 직무 상세)
  recruitCount: number | null; // collectPsncnt (모집인원)
  managerPhone: string | null; // contactTelno (담당 연락처)
  managerName: string | null;  // empChargerDpt (담당 부서/고용센터)
  deadline: string | null;     // receiptCloseDt "YYYY-MM-DD" (리스트보다 정확)
  shiftType: string | null;    // workdayWorkhrCont (근무시간)
  benefits: string[];          // fourIns + retirepay + etcWelfare
  applyDetail: string | null;  // 전형방법·제출서류·접수방법·자격·우대
};

// 짧은 필드: 모든 공백을 한 칸으로. 숫자·hex(&#xd; 등) 문자참조 모두 공백 처리(기존 \d+는 hex 문자 d/a를 놓쳐 리터럴 잔존).
const clean1 = (s: string) => decode(s.replace(/&#x?[0-9a-f]+;/gi, " ")).replace(/\s+/g, " ").trim();

// 본문(직무내용): 줄바꿈 보존 — 워크넷은 &#xd;/&#xa;와 실제 개행으로 행 구조를 표현. 수평 공백만 정리.
const cleanBody = (s: string) =>
  decode(s.replace(/&#x?0*(?:d|a);/gi, "\n").replace(/&#0*1[03];/g, "\n").replace(/&#x?[0-9a-f]+;/gi, " "))
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ") // 개행 외 공백만 축약
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function parseDetail(xml: string): WorknetDetail | null {
  if (!xml.includes("<wantedDtl>")) return null; // 인증오류·빈 응답 방어
  const rm = pick(xml, "receiptCloseDt").match(/(\d{4})(\d{2})(\d{2})/);
  const tel = pick(xml, "contactTelno");
  const recruit = Number(pick(xml, "collectPsncnt"));
  const benefits = [...pick(xml, "fourIns").split(/\s+/), pick(xml, "retirepay"), pick(xml, "etcWelfare")]
    .map((s) => s.trim()).filter(Boolean);
  const applyDetail = [
    pick(xml, "selMthd") && `전형: ${clean1(pick(xml, "selMthd"))}`,
    pick(xml, "submitDoc") && `제출서류: ${clean1(pick(xml, "submitDoc"))}`,
    pick(xml, "rcptMthd") && `접수방법: ${clean1(pick(xml, "rcptMthd"))}`,
    pick(xml, "certificate") && `자격/면허: ${clean1(pick(xml, "certificate"))}`,
    pick(xml, "pfCond") && `우대: ${clean1(pick(xml, "pfCond"))}`,
  ].filter(Boolean).join("\n");
  return {
    title: decode(pick(xml, "wantedTitle")) || null,
    description: cleanBody(pick(xml, "jobCont")) || null,
    recruitCount: Number.isFinite(recruit) && recruit > 0 ? recruit : null,
    managerPhone: /\d{2,}/.test(tel) ? tel.trim() : null, // "--" 등 빈값 제외
    managerName: pick(xml, "empChargerDpt") || null,
    deadline: rm && rm[1] < "2090" ? `${rm[1]}-${rm[2]}-${rm[3]}` : null, // 2090+ 상시 센티넬 제외
    shiftType: clean1(pick(xml, "workdayWorkhrCont")) || null,
    benefits,
    applyDetail: applyDetail || null,
  };
}

async function fetchDetail(authNo: string, infoSvc: string): Promise<WorknetDetail | null> {
  const qs = new URLSearchParams({ authKey: authKey(), callTp: "D", returnType: "XML", wantedAuthNo: authNo, infoSvc: infoSvc || "VALIDATION" });
  try {
    const res = await fetch(`${DETAIL}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return parseDetail(await res.text());
  } catch {
    return null;
  }
}

// 공고 상세 배치 조회. 실패분은 맵에서 누락(호출부에서 기존 저장값 유지).
export async function fetchDetails(items: ReadonlyArray<{ authNo: string; infoSvc: string }>): Promise<Map<string, WorknetDetail>> {
  const pairs = await inBatches([...items], CONCURRENCY * 2, async (it) => [it.authNo, await fetchDetail(it.authNo, it.infoSvc)] as const);
  const map = new Map<string, WorknetDetail>();
  for (const [id, d] of pairs) if (d) map.set(id, d);
  return map;
}
