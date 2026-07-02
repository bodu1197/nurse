import "server-only";
import { cache } from "react";
import { DAY_SECONDS } from "@/lib/constants";

// 워크넷 직업정보 오픈API(212D01, dtlGb=1 요약) — 간호사 직업 프로파일 1건.
// 데이터가 연 단위로만 바뀌어 별도 DB/크론 없이 fetch + revalidate(하루)로 충분.
// 응답은 고정 스키마 XML이라 파서 의존성 대신 정규식 추출.
// ponytail: 평면 스키마 전제. 응답이 더 중첩되면 fast-xml-parser로 교체.

const DETAIL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo212D01.do";
const NURSE_JOB_CD = "K000007494"; // 목록 API(212L01, keyword=간호사)로 확인한 간호사 직업코드. 고정.

export type Salary = { low: number; mid: number; high: number; year: string | null };
export type NurseOccupation = {
  summary: string; // 하는 일
  way: string; // 되는 길
  majors: string[]; // 관련 학과
  certs: string[]; // 관련 자격
  salary: Salary | null; // 단위: 만원
  salaryRaw: string;
  satisfaction: number | null; // 직업만족도 %
  prospect: string; // 일자리 전망
  abilities: string[]; // 업무수행능력
  knowledge: string[]; // 지식
  environment: string[]; // 업무환경
  character: string[]; // 성격
  interest: string[]; // 흥미
  values: string[]; // 직업가치관
};

function pick(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1].trim() ?? "";
}
function pickAll(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1].trim());
}
const bySlash = (s: string) => s.split("/").map((t) => t.trim()).filter(Boolean);
const byComma = (s: string) => s.split(/[,、]/).map((t) => t.trim()).filter(Boolean);

// "조사년도:2025년, 임금 하위(25%) 4000만원, 평균(50%) 4550만원, 상위(25%) 5500만원"
export function parseSalary(sal: string): Salary | null {
  const low = sal.match(/하위\S*\s*([\d,]+)\s*만원/);
  const mid = sal.match(/평균\S*\s*([\d,]+)\s*만원/);
  const high = sal.match(/상위\S*\s*([\d,]+)\s*만원/);
  if (!low || !mid || !high) return null;
  const n = (m: RegExpMatchArray) => Number(m[1].replace(/,/g, ""));
  return { low: n(low), mid: n(mid), high: n(high), year: sal.match(/조사년도\s*[:：]?\s*(\d{4})/)?.[1] ?? null };
}

// React cache(): 한 요청 내 generateMetadata + 페이지 본문 호출을 1회로 dedupe(AbortSignal이 fetch memoization을 끄므로 여기서 합침).
export const getNurseOccupation = cache(async (): Promise<NurseOccupation | null> => {
  const key = process.env.WORKNET_OCCUPATION_API_KEY;
  if (!key) return null;

  const qs = new URLSearchParams({
    authKey: key,
    returnType: "XML",
    target: "JOBDTL",
    jobGb: "1",
    jobCd: NURSE_JOB_CD,
    dtlGb: "1",
  });

  try {
    const res = await fetch(`${DETAIL}?${qs}`, {
      next: { revalidate: DAY_SECONDS },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const xml = await res.text();
    if (!xml.includes("<jobSum>")) return null; // 인증오류·빈 응답 방어

    // 루트 <jobSum> 안에 동명의 자식 <jobSum>(하는 일)이 있어 jobSmclNm 뒤를 앵커로 구분.
    const summary = xml.match(/<jobSmclNm>[\s\S]*?<\/jobSmclNm>\s*<jobSum>([\s\S]*?)<\/jobSum>/)?.[1].trim() ?? "";
    const salaryRaw = pick(xml, "sal");
    const satisRaw = pick(xml, "jobSatis");
    const satis = Number(satisRaw);

    return {
      summary,
      way: pick(xml, "way"),
      majors: pickAll(xml, "majorNm").flatMap(byComma),
      certs: pickAll(xml, "certNm").flatMap(byComma),
      salary: parseSalary(salaryRaw),
      salaryRaw,
      satisfaction: satisRaw !== "" && Number.isFinite(satis) ? satis : null,
      prospect: pick(xml, "jobProspect"),
      abilities: bySlash(pick(xml, "jobAbil")),
      knowledge: bySlash(pick(xml, "knowldg")),
      environment: bySlash(pick(xml, "jobEnv")),
      character: bySlash(pick(xml, "jobChr")),
      interest: bySlash(pick(xml, "jobIntrst")),
      values: bySlash(pick(xml, "jobVals")),
    };
  } catch {
    return null;
  }
});
