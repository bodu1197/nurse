import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNursePublicJobs, publicJobUrl } from "@/lib/alio";
import { regionOfLocation } from "@/lib/jobRegion";
import { departmentFromText } from "@/lib/jobTaxonomy";
import { lookupHospitalsBestEffort } from "@/lib/hospitalRegistry";
import { recordRun } from "@/lib/collectorLog";

/**
 * 공공기관 채용정보(잡알리오) 간호 공고 수집 → jobs upsert(source='public_data').
 *
 * 워크넷이 못 보는 자리를 메운다: 국립대병원(서울대·분당서울대·경북대·부산대·전남대·충남대·
 * 제주대·강원대·충북대·전북대·경상국립대)·국립암센터·국립중앙의료원·적십자병원·보훈병원.
 * 실측(2026-08-11): 진행중 공공기관 공고 583건 중 간호 자리 31건.
 *
 * 워크넷과 같은 계약이다 — **수집 공고는 광고가 아니다**:
 *   · hospital_id 는 null. 회사명은 공고 자체(company_name)에 텍스트로만 담는다
 *     (hospitals 는 심사평가원 병원 명부라 수집 공고로 행을 만들지 않는다 — 오너 확정).
 *   · 노출·간편지원 규칙은 lib/jobState 의 COLLECTED_SOURCES 와 jobs_listed.is_live 가 정한다.
 *
 * ⏰ 크론(vercel.json): 하루 1회 KST 07:00 = UTC "0 22 * * *".
 *    공공기관 공고는 평일 업무시간에 몇 건씩 올라오고 마감이 2주 뒤라 6시간 간격이 필요 없다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now(); // catch 에서도 써야 해서 try 밖에 둔다
  try {
    const syncStart = new Date().toISOString(); // 이번 실행 이전 갱신분 = 목록 이탈분 판별 기준
    const jobs = await fetchNursePublicJobs();
    // 🔴 0건이면 **아무것도 하지 않고 끝낸다.** 아래 close 는 "목록에 없는 것"을 닫으므로,
    //    API 가 빈 응답을 준 날 그대로 흘려보내면 살아 있는 공고를 전부 마감시킨다.
    if (jobs.length === 0) return NextResponse.json({ ok: true, fetched: 0, jobsUpserted: 0 });

    const admin = createAdminClient();

    // 🏥 기관 종별·시군구는 **심사평가원 명부**에서 가져온다. API 는 등급을 안 주고 근무지는 시도까지뿐이라
    //    (실측: 31건 전부 시군구 없음 → 간호사가 시군구를 고르는 순간 통째로 사라졌다),
    //    이름이 같은 명부 기관을 찾아 채운다. 동명이 갈리면 안 채운다 — lib/hospitalRegistry 주석 참고.
    const registry = await lookupHospitalsBestEffort(admin, jobs.map((j) => j.org));

    // 🔴 기존 저장값을 읽어 둔다. 명부 조회가 실패하면(BestEffort → 빈 Map) 아래 upsert 가
    //    **이미 맞게 채워져 있던 종별·지역을 null 로 덮어쓴다.** 일시적 실패 한 번에 데이터가
    //    지워지고, 다음 실행에 다시 채워지는 진동이 생긴다. 못 찾았으면 옛 값을 지킨다.
    type Stored = { external_id: string; facility_type: string | null; location: string | null };
    const stored = new Map<string, Stored>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin
        .from("jobs").select("external_id,facility_type,location")
        .eq("source", "public_data").range(from, from + 999);
      if (error) return NextResponse.json({ error: `jobs select: ${error.message}` }, { status: 500 });
      for (const r of page ?? []) if (r.external_id) stored.set(r.external_id, r as Stored);
      if (!page || page.length < 1000) break;
    }

    const rows = jobs.map((j) => {
      const reg = registry.get(j.org);
      const s = stored.get(j.id);
      // 🔴 명부의 `region`("경기 수원팔달구")이 아니라 **`address`** 를 쓴다. HIRA 의 시군구 표기는
      //    표준이 아니다 — "대전 대전중구"·"전남광주 광주동구" 처럼 시도가 앞에 붙어 있어서,
      //    그대로 저장하면 시군구 필터에 koreaRegions 에 없는 값("대전중구")이 새로 생기고
      //    이력서 매칭("중구")도 영영 안 걸린다(실측 2026-08-11: 알리오 8건이 그렇게 들어갔다).
      //    주소는 표준형이라("대전광역시 중구 문화로 282") 기존 규칙이 그대로 정답을 낸다.
      const loc = reg?.address ?? s?.location ?? j.location;
      const region = regionOfLocation(loc);
      return {
        company_name: j.org || null,
        hospital_id: null,
        title: j.title,
        specialty: departmentFromText(j.title, j.description),
        // 🔴 기관명으로 **추측하지 않는다.** "전남대학교병원" 을 이름 규칙에 넣으면 /병원/ 에 걸려
        //    '병원' 이 되는데, 그 표에서 '병원' 은 종합병원이 **아니라는** 뜻이다 — 상급종합인
        //    국립대병원을 그렇게 적으면 화면이 거짓말을 한다. 명부에서 못 찾으면 비워 둔다.
        facility_type: reg?.facilityType ?? s?.facility_type ?? null,
        // 간호사·간호조무사는 다른 칩이다 — 뭉뚱그리면 간호사가 '간호직' 에서 조무사 공고를 본다.
        job_category: j.jobCategory,
        employment_type: j.employmentType,
        // 🔴 화면·JSON-LD 의 "지역" 은 이 컬럼을 읽는다. 필터(sido/sigungu)와 **같은 값**이어야
        //    "수원시 팔달구로 걸러 놓고 상세에는 경기라고 적혀 있는" 어긋남이 안 생긴다.
        //    주소 원문을 그대로 넣으면 너무 길어서 정규화된 결과를 다시 조립한다.
        location: [region.sido, region.sigungu].filter(Boolean).join(" ") || j.location,
        sido: region.sido,
        sigungu: region.sigungu,
        // 🔴 좌표는 안 넣는다. API 의 근무지역은 "서울"·"전남광주" 처럼 **시도까지만** 이라
        //    지오코딩하면 시청 좌표가 찍히고, 「내 주변 채용」이 그 공고를 시청 옆이라고 거짓말한다.
        description: j.description,
        recruit_count: j.recruitCount,
        apply_detail: j.applyDetail,
        source: "public_data" as const,
        external_url: publicJobUrl(j.id),
        external_id: j.id,
        // ongoingYn=Y 로 받은 것만 있으므로 전부 접수 중이다.
        status: "open" as const,
        posted_at: j.postedAt ? new Date(`${j.postedAt}T00:00:00+09:00`).toISOString() : syncStart,
        deadline: j.deadline,
      };
    });

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin.from("jobs").upsert(chunk, { onConflict: "source,external_id" });
      if (error) return NextResponse.json({ error: `jobs upsert: ${error.message}`, upserted }, { status: 500 });
      upserted += chunk.length;
    }

    // 접수가 끝난 공고(ongoingYn 이 N 으로 바뀌어 목록에서 빠진 것)는 우리도 close.
    // 이번 upsert 로 갱신된 것은 updated_at >= syncStart 라 남고, 나머지 open 만 닫힌다.
    const { data: closedRows, error: closeErr } = await admin
      .from("jobs").update({ status: "closed" })
      .eq("source", "public_data").eq("status", "open").lt("updated_at", syncStart)
      .select("id");
    if (closeErr) return NextResponse.json({ error: `jobs close: ${closeErr.message}`, upserted }, { status: 500 });

    const stats = { fetched: jobs.length, jobsUpserted: upserted, jobsClosed: closedRows?.length ?? 0, registryMatched: registry.size };
    await recordRun(admin, { collector: "alio", ok: true, stats, startedAt });

    return NextResponse.json({
      ok: true,
      fetched: jobs.length,
      jobsUpserted: upserted,
      jobsClosed: closedRows?.length ?? 0,
      // 명부 보강이 조용히 죽는 것을 알아채려면 숫자가 응답에 있어야 한다(0 이면 조회가 실패했거나 이름이 안 맞은 것).
      registryMatched: registry.size,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    await recordRun(createAdminClient(), { collector: "alio", ok: false, error: msg, startedAt });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
