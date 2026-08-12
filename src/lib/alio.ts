// 🔴 `server-only` 를 안 붙인다 — 파서·매핑 시험(alio.test.ts)이 Node 에서 돌아야 한다
//    (붙이면 ERR_MODULE_NOT_FOUND). 인증키는 이 파일에서 env 로만 읽고 밖으로 안 나간다.

/**
 * 공공기관 채용정보 오픈API — **국립대병원·국립암센터·적십자병원** 등의 간호 공고.
 * 워크넷에는 거의 없는 자리다(대형·공공 병원은 자체 채용사이트와 알리오에만 올린다).
 *
 * 엔드포인트: `apis.data.go.kr/1051000/recruitment/list` (인사혁신처, JSON)
 * 인증키: `PUBLIC_RECRUIT_API_KEY` — data.go.kr 에서 이 서비스로 **활용신청한 키**여야 한다.
 *   🔴 `DATA_GO_KR_API_KEY`(심사평가원·국세청용)와 **다른 키다.** 포털 키는 계정당 하나처럼 보여도
 *      활용신청한 API 에서만 열린다 — 옛 키로 이 엔드포인트를 부르면 403
 *      `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 다(실측 2026-08-11). 섞어 쓰지 말 것.
 *
 * 🔴 종전에는 job.alio.go.kr 화면을 긁었다(활용신청 전이라 그것 말고 길이 없었다). 지금은 API 를 쓴다:
 *   · 공고 하나당 상세 요청이 **필요 없다** — 응시자격·전형절차·우대까지 목록 응답에 들어 있다
 *   · 화면 마크업이 바뀌어도 안 깨진다
 *   · `ongoingYn=Y` 로 "지금 접수 중" 을 정확히 집는다(긁을 때는 등록일 창으로 근사할 수밖에 없었다)
 *   공고번호(`recrutPblntSn`)는 알리오 화면의 idx 와 **같은 값**이라(실측: 303646 제목 일치)
 *   기존에 저장한 external_id·external_url 이 그대로 이어진다.
 */
const LIST = "https://apis.data.go.kr/1051000/recruitment/list";

// 인증키는 env 필수(하드코딩 금지) — worknet.ts 와 같은 계약.
const authKey = (): string => {
  const k = process.env.PUBLIC_RECRUIT_API_KEY;
  if (!k) throw new Error("PUBLIC_RECRUIT_API_KEY 환경변수 누락");
  return k;
};

const PAGE = 100; // 응답 상한
// 진행중 전체가 583건(실측 2026-08-11) → 6페이지. 공공기관이 한꺼번에 공고를 쏟아도 버티게 여유를 둔다.
const MAX_PAGES = 20;

/** 오픈API 응답 한 건(우리가 쓰는 필드만). 응답에는 이 밖에 결격사유·첨부·전형단계도 있다. */
export type PublicJobRaw = {
  recrutPblntSn: number; // 공고번호(= 알리오 화면 idx)
  instNm: string; // 기관명
  recrutPbancTtl: string; // 채용제목
  ncsCdNmLst: string; // 표준직무 "보건.의료" (쉼표로 여럿)
  hireTypeNmLst: string; // 고용형태 "정규직" | "비정규직" | "무기계약직" …
  workRgnNmLst: string; // 근무지역 "서울" | "전남광주" (쉼표로 여럿)
  recrutSeNm: string; // 채용구분 "신입" | "경력" | "신입+경력"
  acbgCondNmLst: string; // 학력 "학력무관" …
  recrutNope: number; // 채용인원(0 = 미정)
  pbancBgngYmd: string; // 공고 시작일 "YYYYMMDD"
  pbancEndYmd: string; // 공고 종료일 "YYYYMMDD"
  srcUrl: string; // 기관 자체 채용사이트 링크
  aplyQlfcCn: string; // 응시자격
  scrnprcdrMthdExpln: string; // 전형절차/방법
  prefCn: string; // 우대내용
  prefCondCn: string; // 우대조건(요약)
};

export type PublicJob = {
  id: string; // 공고번호 → jobs.external_id
  title: string;
  org: string;
  location: string | null; // 시도 수준(근무지역이 여럿이면 첫 번째)
  employmentType: string | null;
  recruitCount: number | null;
  postedAt: string | null; // "YYYY-MM-DD"
  deadline: string | null; // "YYYY-MM-DD"
  description: string | null; // 응시자격
  applyDetail: string | null; // 전형 + 우대 + 접수처
  jobCategory: "간호직" | "간호조무직";
};

/** "20260805" → "2026-08-05". 형식이 다르면 null. */
export function ymd(s: string | null | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * 고용형태 → 우리 EMPLOYMENT_TYPES(lib/constants). 잡알리오·대학병원 ATS 가 같이 쓴다.
 *
 * 🔴 **순서가 전부다.** 서로가 서로의 부분 문자열이라 한 줄만 위로 올려도 값이 뒤집힌다:
 *      '비정규직' ⊃ '정규직'      → 정규직을 먼저 보면 비정규직이 전부 정규직이 된다
 *      '무기계약직' ⊃ '계약직'    → 계약직을 먼저 보면 정년 보장 자리가 계약직이 된다
 *      "계약직 … (정규직 전환 기회부여)" → 계약을 먼저 봐야 계약직으로 남는다(실측: 중앙대의료원)
 *    전부 간호사에게 거짓말이 되는 종류의 버그다.
 */
export function employmentTypeOf(s: string | null | undefined): string | null {
  const v = (s ?? "").replace(/\s+/g, "");
  if (!v) return null;
  if (v.includes("인턴")) return "인턴";
  if (v.includes("비정규직")) return "계약직";
  if (v.includes("무기계약")) return "정규직"; // 정년이 보장되는 자리다 — 계약직으로 적으면 사실과 다르다
  if (v.includes("임시")) return "계약직"; // 병원 ATS 의 '임시직'
  // 인재채움뱅크 근무형태의 '대체인력' — 휴직자가 돌아오면 끝나는 자리다(본문에도 "계약직(12개월)").
  // 🔴 '대체' 만으로 보면 안 된다. 이 함수는 ATS 에서 **제목까지 붙여** 불리므로
  //    "대체공휴일 근무" 같은 정규직 공고가 계약직으로 뒤집힌다.
  if (v.includes("대체인력")) return "계약직";
  if (v.includes("계약")) return "계약직";
  if (v.includes("정규직")) return "정규직";
  return null;
}

/**
 * 지원할 수 없는 **안내글**인가 — 합격자 발표·전형 일정 공지 따위.
 *
 * 🔴 병원 채용 게시판에는 공고와 그 후속 안내가 같이 올라온다. 안내글을 채용 카드로 띄우면
 *    간호사가 눌러 들어가 "지원하기" 를 찾다 헛걸음한다(오너 지적 2026-08-12:
 *    "2026년도 서울대학교병원 간호직 직원 채용 4차 최종면접 합격자 발표 및 5차 신체검사 일정 공고").
 *    이미 끝난 전형의 결과라 지원 자체가 불가능하다.
 */
export function isAnnouncementOnly(title: string): boolean {
  // 🔴 괄호 안의 곁다리 문구는 보지 않는다. "간호사 채용(1차 서류전형 결과는 개별 통보)" 처럼
  //    **열려 있는 공고**의 부연에 같은 말이 들어가는데, 그걸로 거르면 진짜 공고가 사라진다.
  const t = title.replace(/[(（[][^)）\]]*[)）\]]/g, "").replace(/\s+/g, "");
  return /(합격자발표|합격자명단|합격자조회|최종합격자안내|전형결과|면접일정|면접전형일정|신체검사일정|시험일정)/.test(t);
}

/**
 * 이 공고가 간호 자리인가 — **제목 또는 응시자격에 '간호'**.
 *
 * 실측(2026-08-11, 진행중 583건 전수):
 *   · 제목만 보면 21건. "○○대학교병원 직원 공개채용" 형태의 공채를 놓친다 —
 *     응시자격에 "교육전담간호사: 간호사 면허 소지자" 라고 적힌 바로 그것들이다.
 *   · 제목+응시자격이면 31건. 이게 실제 간호 자리의 집합이다.
 *
 * 🔴 우대조건(prefCondCn·prefCn)은 **일부러 안 본다.** "간호사 자격 우대" 한 줄이 붙은
 *    행정직·시설직까지 딸려 온다(옛 화면 긁기에서 KOTRA 행정직·한국마사회 경마지원직이 그렇게 들어왔다).
 * 🔴 표준직무(NCS)로 좁히지도 않는다. NCS=보건.의료로 거르면 적십자 복지회관 간호사 공고처럼
 *    NCS 가 '사회복지.종교' 로 달린 진짜 간호 자리를 놓친다(실측 2건).
 */
export function isNursePublicJob(title: string, eligibility: string | null | undefined): boolean {
  return /간호/.test(`${title} ${eligibility ?? ""}`);
}

/**
 * 간호직인가 간호조무직인가 — 직종 칩(JOB_CATEGORIES)이 갈리는 값이라 뭉뚱그리면 안 된다.
 *
 * 🔴 '간호조무사' 는 '간호' 를 포함하지만 '간호사' 는 **포함하지 않는다**(간-호-조-무-사).
 *    그래서 '간호사' 를 먼저 보는 것만으로 갈린다.
 * 🔴 둘을 같이 뽑는 공고(병원 공채)는 **간호직**으로 둔다 — 간호사 자리가 실제로 있으므로
 *    간호사가 '간호직' 칩에서 그 공고를 못 보면 놓치는 쪽이 더 나쁘다.
 *    실측: 서울요양원 공고만 조무직(응시자격이 "간호조무사 자격을 받은 자" 뿐), 나머지 30건은 간호직.
 */
export function jobCategoryOf(title: string, eligibility: string | null | undefined): "간호직" | "간호조무직" {
  const t = `${title} ${eligibility ?? ""}`;
  if (/간호사|간호직|간호학|간호업무(?!보조)/.test(t)) return "간호직";
  return /간호조무/.test(t) ? "간호조무직" : "간호직";
}

/** 공고 원문 링크. 알리오 상세는 첨부·상세요강까지 다 있고 공고번호가 API 와 같다. */
export const publicJobUrl = (id: string) => `https://job.alio.go.kr/recruitview.do?idx=${id}`;

const clean = (s: string | null | undefined): string | null => {
  const v = (s ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return v || null;
};

/** 응답 한 건 → 우리 모양. 파싱 실패(공고번호·제목 없음)면 null. */
export function toPublicJob(r: PublicJobRaw): PublicJob | null {
  if (!r?.recrutPblntSn || !r.recrutPbancTtl) return null;
  const applyDetail = [
    clean(r.scrnprcdrMthdExpln) && `전형: ${clean(r.scrnprcdrMthdExpln)}`,
    // 🔴 `??` 가 아니라 `||` 다. 이 API 는 빈 값을 null 이 아니라 **빈 문자열**로 준다 —
    //    `??` 로 쓰면 prefCn 이 "" 일 때 prefCondCn 으로 안 넘어가서 우대 정보가 통째로 빠진다.
    clean(r.prefCn || r.prefCondCn) && `우대: ${clean(r.prefCn || r.prefCondCn)}`,
    // 🔴 기관 채용사이트는 **여기에만** 적는다. external_url 로 쓰지 않는다 — 6/31 이 공고가 아니라
    //    사이트 루트(예: https://cnuh.recruiter.co.kr/)라, 눌렀는데 공고가 없는 일이 생긴다.
    r.srcUrl && /^https?:\/\//.test(r.srcUrl) && `접수처: ${r.srcUrl}`,
  ].filter(Boolean).join("\n");
  return {
    id: String(r.recrutPblntSn),
    title: r.recrutPbancTtl.trim(),
    org: (r.instNm ?? "").trim(),
    // 근무지역이 여럿이면("서울,경기") 첫 번째만 쓴다 — 우리 지역 축은 한 값이다.
    location: (r.workRgnNmLst ?? "").split(",")[0].trim() || null,
    employmentType: employmentTypeOf(r.hireTypeNmLst),
    recruitCount: Number.isFinite(r.recrutNope) && r.recrutNope > 0 ? r.recrutNope : null,
    postedAt: ymd(r.pbancBgngYmd),
    deadline: ymd(r.pbancEndYmd),
    description: clean(r.aplyQlfcCn),
    applyDetail: applyDetail || null,
    jobCategory: jobCategoryOf(r.recrutPbancTtl, r.aplyQlfcCn),
  };
}

async function fetchPage(pageNo: number): Promise<{ rows: PublicJobRaw[]; total: number }> {
  const qs = new URLSearchParams({
    serviceKey: authKey(), // 디코딩 상태로 보관하고 여기서 인코딩한다(이중 인코딩 방지)
    resultType: "json",
    numOfRows: String(PAGE),
    pageNo: String(pageNo),
    ongoingYn: "Y", // 지금 접수 중인 것만. 마감분은 목록에서 빠지고 호출부가 close 한다.
  });
  const res = await fetch(`${LIST}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`공공채용 API ${res.status}`);
  const body = await res.json();
  // 인증 실패는 200 이 아니라 별도 봉투로 온다 — 조용히 0건으로 넘어가지 않게 세워 둔다.
  if (body?.OpenAPI_ServiceResponse) {
    throw new Error(`공공채용 API 인증 오류: ${body.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg ?? "unknown"}`);
  }
  return {
    rows: Array.isArray(body?.result) ? (body.result as PublicJobRaw[]) : [],
    total: Number(body?.totalCount) || 0,
  };
}

/**
 * 지금 접수 중인 공공기관 간호 공고 전체.
 *
 * 🔴 **완주를 totalCount 로 확인한다.** 종전에는 "빈 페이지" 나 "PAGE 보다 짧은 페이지" 를 끝으로
 *    봤는데, API 가 200 으로 응답하면서 중간 페이지를 짧게 주면 그 지점에서 조용히 멈춘다.
 *    그러면 부르는 쪽(sync-alio)이 **못 받은 공고를 전부 마감 처리한다** — 살아 있는 국립대병원
 *    공고가 통째로 사라지는 경로다. 다 못 받았으면 **던진다**: 그 실행은 실패하고 아무것도 안
 *    닫히며, 다음 날 크론이 다시 채운다. 조용히 지우는 것보다 시끄럽게 실패하는 쪽이 낫다.
 */
export async function fetchNursePublicJobs(
  // 시험이 실제 실패 경로(부분 응답·totalCount 누락)를 재현할 수 있게 주입 가능하게 둔다.
  getPage: (pageNo: number) => Promise<{ rows: PublicJobRaw[]; total: number }> = fetchPage,
): Promise<PublicJob[]> {
  const out: PublicJob[] = [];
  const seen = new Set<string>();
  let received = 0;
  let total = 0;
  for (let p = 1; p <= MAX_PAGES; p++) {
    const page = await getPage(p);
    if (p === 1) {
      total = page.total;
      // 🔴 totalCount 가 없으면(필드명 변경·형식 변경) `received >= total` 이 1페이지에서 바로 참이 되어
      //    **한 페이지만 받고 정상 종료한 것처럼 보인다.** 그러면 부르는 쪽이 나머지를 전부 마감한다.
      //    완주를 확인할 수단이 사라진 것이므로 조용히 진행하지 않는다.
      if (page.rows.length > 0 && total <= 0) {
        throw new Error("공공채용 API 가 totalCount 를 주지 않았다 — 완주를 확인할 수 없어 이번 실행은 버린다");
      }
    }
    if (page.rows.length === 0) break;
    received += page.rows.length;
    for (const r of page.rows) {
      if (!isNursePublicJob(r.recrutPbancTtl ?? "", r.aplyQlfcCn)) continue;
      const j = toPublicJob(r);
      if (!j || seen.has(j.id)) continue;
      seen.add(j.id);
      out.push(j);
    }
    if (received >= total) break;
  }
  if (received < total) {
    // 다 못 받았으면 **던진다.** 그 실행은 실패하고 아무것도 닫히지 않으며, 다음 크론이 다시 채운다.
    // 조용히 지우는 것보다 시끄럽게 실패하는 쪽이 낫다.
    const hitCap = received >= MAX_PAGES * PAGE;
    throw new Error(
      hitCap
        ? `공공채용 공고가 ${total}건으로 늘어 상한(${MAX_PAGES}페이지 = ${MAX_PAGES * PAGE}건)을 넘었다 — MAX_PAGES 를 올려야 한다`
        : `공공채용 API 부분 응답: ${total}건 중 ${received}건만 받았다 — 이번 실행은 버린다`,
    );
  }
  return out;
}
