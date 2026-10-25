import "server-only";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobRow } from "@/lib/data/jobs";
import { CARE_CATEGORIES } from "@/lib/jobTaxonomy";
import { CARE_DETAIL_DAILY_CAP, CARE_DETAIL_RETRY_MS, isCrawlerUa, needsCareDetail } from "@/lib/careSync";
import { fetchDetails, type WorknetDetail } from "@/lib/worknet";

/**
 * 🧓 요양·간병 공고 — 목록·상세·저장·지원은 간호 공고와 **같은 코드**다(jobs 표, 직종 요양보호사·간병인 — lib/jobTaxonomy
 * CARE_CATEGORIES). 여기 남은 것은 하나뿐이다: 워크넷 수집분의 본문을 **열릴 때** 받아 오는 일.
 * 간호 수집분(1,400건)은 크론(sync-worknet)이 미리 받지만, 요양·간병은 1만 건이라 열리는 것만 받는다.
 */

/** 요청이 크롤러인가 — Next 의 isBot 에 그 목록이 놓치는 네이버(Yeti)·다음·카카오 미리보기·AI 크롤러를 더한다(lib/careSync). */
export async function requestIsBot(): Promise<boolean> {
  const ua = userAgent({ headers: await headers() });
  return ua.isBot || isCrawlerUa(ua.ua);
}

// 사람이 기다리는 자리라 크론(15초)보다 짧게 끊는다. 워크넷 상세는 보통 1초 안팎(실측 2026-10-16).
const CARE_DETAIL_TIMEOUT_MS = 5000;

/**
 * 워크넷 요양·간병 수집 공고의 본문·연락처 — 상세(/jobs/[id])가 열릴 때 워크넷 상세 API(210D01)로 받아 jobs 에 저장한다.
 *
 * allowFetch=false(동적 라우트에서 봇이 연 요청)면 묻지 않는다 — 1만 장을 긁는 크롤러 때문에 API 1만 번을 쓸 이유가 없다(저장된 값만 그린다).
 * 비로그인 캐시본은 봇인지 볼 수 없어 묻되, 하루 상한을 낮춰 부른다(cap = CARE_DETAIL_CACHED_CAP — careSync 주석).
 * 호출 전에 세 겹으로 막는다(이 키는 간호 크론과 나눠 쓴다 — 한도를 태우면 간호 상세 보강까지 멈춘다):
 *   ① needsCareDetail — 본문이 있으면 안 묻고, 실패한 행은 하루 뒤에만(detail_fetched_at 은 **실패해도 찍는다**).
 *   ② 하루 전체 상한(cap, 기본 CARE_DETAIL_DAILY_CAP) — 최근 24시간에 표식이 찍힌 요양·간병 행 수 = 시도한 호출 수.
 *   ③ 조건부 update 로 **먼저 표식을 찍어 이 행을 잡는다** — 같은 공고를 동시에 연 요청끼리, 또 저장이 실패한 뒤 재방문이
 *      각자 또 부르지 않는다(hospitals/search 의 "먼저 적고 나서 부른다"와 같은 원칙).
 * 저장 실패·키 누락은 로그만 남기고 화면은 받은 값으로 그린다(상세 한 장 때문에 500 을 내지 않는다).
 * 제목·마감일은 덮지 않는다 — 크론(sync-care)이 매 수집마다 목록 값으로 되돌려 하루 두 번 바뀐다.
 */
export async function enrichCareJob(job: JobRow, allowFetch: boolean, cap = CARE_DETAIL_DAILY_CAP): Promise<JobRow> {
  const authNo = job.external_id;
  if (!allowFetch || !authNo || !needsCareDetail(job, Date.now())) return job;
  const fail = (what: string, e: unknown) => console.error(`enrichCareJob ${what} failed:`, e instanceof Error ? e.message : e);
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient(); // 환경변수가 없으면 던진다
  } catch (e) {
    fail("admin", e);
    return job;
  }
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - CARE_DETAIL_RETRY_MS).toISOString();

  // ② 전체 상한. 셀 수 없으면 안 부른다(열어 두면 한도를 지키려던 장치가 한도를 태우는 쪽으로 실패한다 — collectorLog 와 같은 선택).
  // ponytail: 세기(count)와 잡기(③)가 한 문장이 아니라, 동시에 들어온 요청 수만큼 상한을 넘을 수 있다(cap + 동시요청수에서 멈춘다 —
  //   다음 요청부터는 늘어난 수가 보인다). collectorLog reserveHiraLookup 과 같은 천장이다. 딱 맞게 막아야 할 만큼 워크넷 한도가
  //   빠듯해지면 "count < cap 일 때만 update" 를 한 문장으로 하는 RPC(advisory lock)로 옮긴다.
  const { count, error: capErr } = await admin
    .from("jobs").select("id", { count: "exact", head: true })
    .eq("source", "worknet").in("job_category", [...CARE_CATEGORIES]).gte("detail_fetched_at", since);
  if (capErr) { fail("cap", capErr.message); return job; }
  if ((count ?? 0) >= cap) {
    console.warn(`[care] 상세 상한 — 최근 24시간 ${count}/${cap}. 저장된 값만 그린다.`);
    return job;
  }

  // ③ 행 잡기 — 아직 아무도 안 물었거나(null), 본문이 비어 있고 마지막 시도가 하루 넘은 행만 내가 가져간다.
  //    쓰기는 service_role, 범위는 이 행 하나·고정 컬럼(lib/supabase/admin 주석 4).
  //    🔴 렌더 중 쓰기라 updated_at 이 오른다 — sync-care 수집 도중에 열린 공고는 그 회차 마감에서 빠지고 다음 회차에 닫힌다(무해).
  const { data: claimed, error: claimErr } = await admin
    .from("jobs").update({ detail_fetched_at: nowIso })
    .eq("id", job.id).eq("source", "worknet").in("job_category", [...CARE_CATEGORIES]) // 쓰기 범위를 요양·간병 워크넷 행으로 못 박는다
    .or(`detail_fetched_at.is.null,and(description.is.null,detail_fetched_at.lt.${since})`)
    .select("id");
  if (claimErr) { fail("claim", claimErr.message); return job; }
  if (!claimed?.length) return job; // 다른 요청이 먼저 잡았다 — 그쪽이 채운다

  let d: WorknetDetail | undefined;
  try {
    // infoSvc 는 저장하지 않았다 — 원문 링크가 전부 infoTypeCd=VALIDATION 이라(크론 실측) 기본값으로 충분하다.
    d = (await fetchDetails([{ authNo, infoSvc: "VALIDATION" }], CARE_DETAIL_TIMEOUT_MS)).get(authNo);
  } catch (e) {
    fail("fetch", e); // WORKNET_RECRUIT_API_KEY 누락은 fetchDetail 의 try 밖에서 던진다
  }
  if (!d) {
    // fetchDetail 은 원인을 삼키고 null 을 준다(타임아웃·원문 없음·한도) — 여기서라도 어느 공고인지 남긴다. 표식은 이미 찍혔다.
    console.warn(`[care] 상세 없음 ${authNo} — 마감으로 내려갔거나 워크넷 장애. 하루 뒤 다시 묻는다.`);
    return { ...job, detail_fetched_at: nowIso };
  }
  const patch = {
    description: d.description,
    recruit_count: d.recruitCount,
    shift_type: d.shiftType,
    benefits: d.benefits,
    apply_detail: d.applyDetail,
    manager_name: d.managerName,
    manager_phone: d.managerPhone,
  };
  const { error } = await admin.from("jobs").update(patch)
    .eq("id", job.id).eq("source", "worknet").in("job_category", [...CARE_CATEGORIES]);
  if (error) fail("save", error.message); // 받은 값은 이번 화면에 그대로 쓴다
  return { ...job, ...patch, detail_fetched_at: nowIso };
}
