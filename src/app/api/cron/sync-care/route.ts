import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCareJobs, regDtToDate } from "@/lib/worknet";
import { regionOfLocation } from "@/lib/jobRegion";
import { geocodeAddressStrict } from "@/lib/kakao";
import { recordRun } from "@/lib/collectorLog";
import { isWorknetUrl, shouldPruneCare, splitGeoRows, type GeoCoords } from "@/lib/careSync";

/**
 * 🧓 워크넷 요양보호사·간병인 공고 수집 → care_jobs(간호사 jobs 와 **별도 표** — 마이그레이션 20261016100000 주석).
 *
 * ⏰ vercel.json: 하루 2회 KST 10:00/22:00 = UTC "0 1,13 * * *". 간호 수집(6시간 간격)보다 드문 이유 —
 *    고유 1만 700건을 220쪽으로 받아 오는 큰 호출(실측 57초)이고, 상세 페이지(/care-jobs/[id])는 색인하지 않아
 *    "몇 시간 늦은 마감"이 검색엔진에 404 로 잡히지 않는다.
 * 상세 API(본문·연락처)는 여기서 부르지 않는다 — 상세 페이지가 처음 열릴 때 그 공고만 받는다(lib/data/careJobs getCareJob).
 *    upsert 는 보낸 키만 갱신하므로 그렇게 채운 본문은 다음 수집에도 지워지지 않는다.
 * 📍 좌표(내 주변)는 여기서 카카오 지오코딩으로 채운다 — 미시도 공고만, 실행당 상한(GEOCODE_MAX)과 시간 예산 안에서.
 * 판단 로직(삭제 가드·묶음 나누기·링크 검증)은 lib/careSync — 테스트가 있다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 한 실행에 지오코딩할 상한. 실측 2026-10-16: 5,500건 ≈ 123초(수집 57초 별도) → 건당 ~22ms(동시 8). 2,000건이면
// 수집 57초 + 45초 ≈ 100초로 300초 안에 넉넉하다. 처음 1만 건은 로컬에서 ?geocode=5500 으로 두 번 돌려 채웠다
// (간호 크론의 ?detail= 과 같은 운영용 손잡이). 그 뒤로는 새 공고(하루 수백 건)만 한다.
const GEOCODE_MAX = 2000;
const GEOCODE_HARD_MAX = 20000; // ?geocode= 로 올려도 이 위로는 못 간다(실수로 100만을 적어도 한 번에 2만 건까지만 — 전체 공고 수 수준)
const GEOCODE_CONCURRENCY = 8; // 카카오 로컬 API 동시 호출 — 간호 크론과 같은 값(과도하면 429)
// 🔴 시간 예산. 카카오가 느린 날(주소당 5초 타임아웃 × 2회) 2,000건이 2,500초가 될 수 있다 — 그러면 300초에
//    강제 종료되어 **저장 전 단계에서 그 회차가 통째로 날아가고 실행 기록도 안 남는다.** 200초가 지나면 지오코딩을
//    멈추고 저장으로 넘어간다(sync-ats 의 outOfTime 과 같은 계약). 못 한 건은 다음 실행이 한다.
const TIME_BUDGET_MS = 200_000;
const UPSERT_CHUNK = 500; // PostgREST 요청 하나에 담는 행 수 — 간호 크론과 같은 값(본문 크기·타임아웃 균형)
const SELECT_PAGE = 1000; // PostgREST max_rows — 그 이상은 조용히 잘리므로 쪽을 넘겨 받는다

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > TIME_BUDGET_MS;
  const admin = createAdminClient();
  try {
    const syncStart = new Date().toISOString(); // 이번 실행에서 못 본 행(= 워크넷에서 내려간 공고) 판별 기준
    // ?geocode= 는 숫자일 때만 쓴다(0 도 "지오코딩 끔"으로 존중 — `|| 기본값` 으로 받으면 0 이 기본값이 된다).
    const geocodeParam = new URL(request.url).searchParams.get("geocode")?.trim();
    // 빈 값(?geocode=)은 Number("")=0 이라 지오코딩이 조용히 꺼진다 — 값이 있을 때만 숫자로 받는다.
    const geocodeWanted = geocodeParam && Number.isFinite(Number(geocodeParam)) ? Number(geocodeParam) : GEOCODE_MAX;
    // 🔴 카카오 키가 없으면 지오코딩을 아예 안 한다 — 키 없음을 "주소 못 찾음"으로 기록하면 전 공고가 좌표 없이 굳는다.
    const geocodeMax = process.env.KAKAO_REST_API_KEY ? Math.min(Math.max(0, Math.floor(geocodeWanted)), GEOCODE_HARD_MAX) : 0;
    const jobs = (await fetchCareJobs()).filter((j) => isWorknetUrl(j.url)); // 원문 링크가 없거나 워크넷이 아니면 상세의 「원본에서 지원하기」가 갈 곳이 없다
    // 🔴 0건은 수집 실패다 — 성공으로 남기면 다음 실행의 삭제 기준치가 0 이 되어 가드가 열린다(shouldPruneCare 주석).
    //    실측: 워크넷이 응답 200 에 total 0 을 돌려주는 날이 있다.
    if (jobs.length === 0) throw new Error("워크넷이 요양보호사 공고를 0건 돌려줬다 — 저장·삭제 모두 건너뜀");
    const today = new Date().toISOString().slice(0, 10);

    // 📍 이미 좌표 시도를 끝낸 공고(geocoded_at 있음)는 다시 안 부른다 — 주소 검색 실패도 포함(jobs 와 같은 계약).
    //    order 를 둔다 — 쪽마다 별개 질의라 순서가 없으면 경계에서 빠진 행을 매 실행 다시 지오코딩한다.
    const geocoded = new Set<string>();
    for (let from = 0; ; from += SELECT_PAGE) {
      const { data, error } = await admin.from("care_jobs").select("external_id")
        .not("geocoded_at", "is", null).order("external_id").range(from, from + SELECT_PAGE - 1);
      if (error) throw new Error(`care_jobs select: ${error.message}`);
      for (const r of data ?? []) geocoded.add(r.external_id);
      if (!data || data.length < SELECT_PAGE) break;
    }
    const needCoords = jobs.filter((j) => j.addr && !geocoded.has(j.authNo));
    // coords 에 들어간 것만 "시도했다"로 기록된다(null = 주소 못 찾음). 일시 장애(undefined)는 넣지 않아 다음 실행이 다시 한다.
    const coords = new Map<string, GeoCoords>();
    let geocodeStoppedEarly = false;
    let geocodeTransient = 0;
    for (let i = 0; i < Math.min(needCoords.length, geocodeMax); i += GEOCODE_CONCURRENCY) {
      if (outOfTime()) { geocodeStoppedEarly = true; break; }
      const batch = needCoords.slice(i, Math.min(i + GEOCODE_CONCURRENCY, geocodeMax));
      const got = await Promise.all(batch.map(async (j) => [j.authNo, await geocodeAddressStrict(j.addr)] as const));
      let answered = 0;
      for (const [id, c] of got) {
        if (c === undefined) { geocodeTransient++; continue; }
        coords.set(id, c);
        answered++;
      }
      // 묶음 전체가 장애(키 오류·429·타임아웃)면 더 돌려도 시간만 쓴다 — 멈추고 저장으로 넘어간다.
      if (answered === 0) { geocodeStoppedEarly = true; break; }
    }

    const rows = jobs.map((j) => {
      const region = regionOfLocation(j.region || null); // 지역 필터용 정규화(간호 크론과 같은 경로)
      return {
        external_id: j.authNo,
        jobs_cd: j.jobsCd,
        title: j.title,
        company_name: j.company || null,
        location: j.region || null,
        sido: region.sido,
        sigungu: region.sigungu,
        salary_text: [j.salTpNm, j.sal].filter(Boolean).join(" ") || null,
        employment_type: j.employmentType, // 상세 페이지의 "고용형태" — 목록 API 가 이미 준다(상세 호출 불필요)
        posted_at: regDtToDate(j.regDt) ?? today,
        deadline: j.deadline, // 매 수집마다 목록 값으로 덮는다 — 그래서 상세 보강(withCareDetail)도 목록 값을 우선한다(안 그러면 하루 두 번 바뀐다)
        external_url: j.url,
        last_seen_at: syncStart,
      };
    });
    // 좌표를 시도한 행만 lat/lng/geocoded_at 키를 갖는다 — 나머지는 키를 빼서 저장된 좌표를 지킨다(lib/careSync 주석).
    const { withGeo, withoutGeo } = splitGeoRows(rows, coords, syncStart);

    let upserted = 0;
    for (const group of [withGeo, withoutGeo]) {
      for (let i = 0; i < group.length; i += UPSERT_CHUNK) {
        const chunk = group.slice(i, i + UPSERT_CHUNK);
        const { error } = await admin.from("care_jobs").upsert(chunk, { onConflict: "external_id" });
        if (error) throw new Error(`care_jobs upsert: ${error.message} (${upserted}건 저장 뒤)`);
        upserted += chunk.length;
      }
    }

    // 워크넷에서 내려간 공고 삭제 — 이번 수집에서 못 본 행. 그 공고의 상세(/care-jobs/[id])는 404 가 되지만
    // 색인하지 않는 페이지라 검색엔진 손해는 없다(간호 공고가 마감 뒤 404 를 내는 것과 같다).
    // 🔴 가드는 **직전 성공 실행의 수집 건수**와 비교한다(shouldPruneCare 주석). 그 기록을 못 읽으면 지우지 않는다 —
    //    오류를 0 으로 읽어 가드가 열리는 일이 없게.
    const { data: lastRun, error: lastErr } = await admin.from("collector_runs").select("stats")
      .eq("collector", "care").eq("ok", true).order("ran_at", { ascending: false }).limit(1).maybeSingle();
    const lastStats = lastRun?.stats;
    const lastFetchedRaw = lastStats && typeof lastStats === "object" && !Array.isArray(lastStats) ? lastStats.fetched : undefined;
    const lastFetched = typeof lastFetchedRaw === "number" ? lastFetchedRaw : null;
    // 기록은 있는데 fetched 가 숫자가 아니면(기록 형식이 바뀐 경우) "첫 실행"으로 오해해 지우지 않는다 — 못 읽은 것이다.
    const pruneSkipped = !!lastErr || (!!lastRun && lastFetched === null) || !shouldPruneCare(rows.length, lastFetched);
    let removed = 0;
    if (!pruneSkipped) {
      const { data, error } = await admin.from("care_jobs").delete().lt("last_seen_at", syncStart).select("external_id");
      if (error) throw new Error(`care_jobs prune: ${error.message}`);
      removed = data?.length ?? 0;
    }

    const attempted = coords.size;
    const stats = {
      fetched: rows.length, upserted, removed, pruneSkipped,
      geocodeAttempted: attempted, geocoded: [...coords.values()].filter(Boolean).length,
      geocodeRemaining: needCoords.length - attempted, geocodeTransient, geocodeStoppedEarly,
      geocodeDisabled: geocodeMax === 0, // 키 없음 또는 ?geocode=0
    };
    await recordRun(admin, { collector: "care", ok: true, startedAt, stats });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    await recordRun(admin, { collector: "care", ok: false, error: msg, startedAt });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
