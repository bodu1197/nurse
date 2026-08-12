import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNurseAtsJobs, fetchAtsDescription, TENANTS } from "@/lib/recruiterAts";
import { fetchNurseSiteJobs, SITES } from "@/lib/hospitalSites";
import { fetchBoardJobs, fetchBoardDetail, BOARDS } from "@/lib/jobBoards";
import { lookupHospitalsBestEffort } from "@/lib/hospitalRegistry";
import { regionOfLocation } from "@/lib/jobRegion";
import { departmentFromText } from "@/lib/jobTaxonomy";
import { recordRun } from "@/lib/collectorLog";
import { geocodeAddress } from "@/lib/kakao";
import { inBatches } from "@/lib/worknet";

/**
 * 대학병원 채용 ATS(마이다스인 「리크루터」) 간호 공고 수집 → jobs upsert(source='crawl').
 *
 * 잡알리오가 못 닿는 **사립 상급종합병원**을 메운다 — 세브란스·고대의료원(안암·구로·안산)·한양대·
 * 중앙대·아주대·경희대·길병원 등. 병원마다 서브도메인만 다르고 경로가 같아 파서 하나로 20곳이 열린다.
 * 실측(2026-08-11): 접수중 169건 중 간호 34건.
 *
 * 수집 공고의 계약은 워크넷·잡알리오와 같다 — hospital_id 는 null(명부에 행을 만들지 않는다),
 * 노출·간편지원은 lib/jobState 의 COLLECTED_SOURCES 와 jobs_listed.is_live 가 정한다.
 *
 * ⏰ 크론(vercel.json): 하루 2회 KST 08:00·20:00 = UTC "0 11,23 * * *".
 *    병원 공고는 업무시간에 올라오고 마감이 짧은 것(1주)이 섞여 있어 하루 한 번은 놓치기 쉽다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 🔴 try 밖에 둔다 — catch 에서도 실행 시간을 남겨야 한다.
  const startedAt = Date.now();
  try {
    const syncStart = new Date().toISOString();
    // 공용 ATS(20곳) + 자체 홈페이지(SITES) — 둘 다 source='crawl' 이라 같은 경로로 처리한다.
    const [ats, sites, boards] = await Promise.all([fetchNurseAtsJobs(), fetchNurseSiteJobs(), fetchBoardJobs()]);
    const jobs = [
      ...ats.jobs.map((j) => ({ key: j.host, id: j.id, title: j.title, hospital: j.hospital, alt: null as string | null, displayName: j.displayName, jobCategory: j.jobCategory, employmentType: j.employmentType, postedAt: j.postedAt, deadline: j.deadline, url: j.url, sn: j.sn as number | null })),
      ...sites.jobs.map((j) => ({ key: j.id.split("-")[0], id: j.id, title: j.title, hospital: j.hospital, alt: null as string | null, displayName: j.displayName, jobCategory: j.jobCategory, employmentType: null as string | null, postedAt: null as string | null, deadline: j.deadline, url: j.url, sn: null as number | null })),
      // 집계 사이트(인재채움뱅크) — 병원이 행마다 다르다. 명부 매칭도 행마다 한다.
      // 🔴 이름이 두 가지로 온다: 제목의 `[포항여성병원]`(label)과 등기명 `삼정의료재단포항여성병원`(company).
      //    어느 쪽이 명부에 있는지는 병원마다 다르므로 **둘 다 조회**한다 — 하나만 보면 매칭이 반토막 난다.
      ...boards.jobs.map((j) => ({ key: j.id.split("-")[0], id: j.id, title: j.title, hospital: j.label, alt: j.company as string | null, displayName: j.label, jobCategory: j.jobCategory, employmentType: null as string | null, postedAt: null as string | null, deadline: j.deadline, url: j.url, sn: null as number | null })),
    ];
    const failed = [...ats.failed, ...sites.failed, ...boards.failed];
    if (jobs.length === 0) return NextResponse.json({ ok: true, fetched: 0, jobsUpserted: 0, failedHosts: failed });

    const admin = createAdminClient();

    // 🏥 기관 종별·지역은 심사평가원 명부에서. ATS 목록에는 근무지가 아예 없다.
    const registry = await lookupHospitalsBestEffort(admin, jobs.flatMap((j) => (j.alt ? [j.hospital, j.alt] : [j.hospital])));
    // 🔴 둘 다 명부에 있으면 **주소가 있는 쪽**을 고른다. 그냥 `??` 로 두면 주소 없는 행이 먼저
    //    걸려 좌표를 못 얻는다 = 「내 주변 채용」에서 빠진다(같은 병원이 명부에 여러 이름으로 있다).
    const regOf = (j: { hospital: string; alt: string | null }) => {
      const a = registry.get(j.hospital);
      const b = j.alt ? registry.get(j.alt) : undefined;
      if (a?.address) return a;
      if (b?.address) return b;
      return a ?? b;
    };

    // 기존 저장값 — 명부 조회가 실패했거나 상세를 못 받았을 때 옛 값을 지킨다.
    // (BestEffort 가 빈 Map 을 돌려줄 수 있는데, 그때 이미 맞던 종별·지역을 null 로 덮으면 안 된다.)
    type Stored = { external_id: string; facility_type: string | null; location: string | null; description: string | null; detail_fetched_at: string | null; posted_at: string | null; lat: number | null; lng: number | null; geocoded_at: string | null; employment_type: string | null; salary_text: string | null; deadline: string | null };
    const stored = new Map<string, Stored>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin
        .from("jobs").select("external_id,facility_type,location,description,detail_fetched_at,posted_at,lat,lng,geocoded_at,employment_type,salary_text,deadline")
        // 🔴 정렬이 없으면 페이지 경계에서 행이 새거나 겹친다(Postgres 는 순서를 보장하지 않는다).
        .eq("source", "crawl").order("external_id").range(from, from + 999);
      if (error) return NextResponse.json({ error: `jobs select: ${error.message}` }, { status: 500 });
      for (const r of page ?? []) if (r.external_id) stored.set(r.external_id, r as Stored);
      if (!page || page.length < 1000) break;
    }

    // 본문은 공고당 한 번만 받는다(내용이 바뀌면 병원이 새 공고를 낸다).
    // 본문은 ATS 공고만 받는다(자체 홈페이지는 사이트마다 상세 구조가 달라 아직 제목·링크만 쓴다).
    const need = jobs.filter((j) => j.sn !== null && !stored.get(j.id)?.detail_fetched_at);
    const bodies = new Map<string, string>();
    for (let i = 0; i < need.length; i += 6) {
      const got = await Promise.all(
        need.slice(i, i + 6).map(async (j) => [j.id, await fetchAtsDescription(j.key, String(j.sn))] as const),
      );
      for (const [id, body] of got) if (body) bodies.set(id, body);
    }

    // 🔴 집계 사이트는 **목록에 제목·회사명뿐**이라 상세를 안 받으면 카드가 텅 빈다
    //    (오너 신고 2026-08-12: 「채용 상세 정보」에 지역 한 줄만 나왔다).
    //    상세에는 급여·근무형태·마감일·근무지 주소·모집요강이 다 있다.
    const boardKeys = new Set(BOARDS.map((b) => b.key));
    // 🔴 한 번에 받는 수를 묶는다. 상세는 한 장이 2MB 라, 처음 도는 날처럼 대상이 많으면
    //    maxDuration(300초)을 넘겨 **upsert 전에 죽고 그날 수집이 통째로 날아간다.**
    //    남은 건 다음 크론이 가져간다(마커가 없으니 대상으로 계속 남는다).
    const needDetail = jobs
      .filter((j) => boardKeys.has(j.key) && !stored.get(j.id)?.detail_fetched_at)
      .slice(0, 40);
    const details = new Map(
      (await inBatches(needDetail, 6, async (j) => [j.id, await fetchBoardDetail(j.url)] as const))
        // 🔴 "받았다" 로 치는 기준은 **뭐라도 읽혔는가** 다. 마크업이 바뀌어 전부 null 인 객체가
        //    와도 마커를 찍으면 그 공고는 영원히 다시 안 받는다 — 빈 카드가 굳어 버린다.
        .flatMap(([id, d]) => (d && Object.values(d).some(Boolean) ? [[id, d] as const] : [])),
    );

    // 📍 좌표 — 「내 주변 채용」이 이걸 본다. 이 사이트들은 근무지를 아예 안 주므로
    //    **명부 주소**를 지오코딩한다. geocoded_at 마커로 공고당 한 번만 시도한다.
    // 🔴 주소를 여기서 함께 뽑아 둔다 — 아래에서 `regOf(j)!.address!` 처럼 단언하면 필터 조건이
    //    바뀌는 순간 조용히 TypeError 가 나고 크론 전체가 502 로 죽는다. 타입이 보장하게 한다.
    // 🔴 상세의 **근무지 주소**가 명부 주소보다 앞선다 — 실제로 일하는 곳이고, 명부에 아예 없는
    //    병원(요양원·의원)도 이걸로 좌표를 얻는다. 명부 주소는 그게 없을 때의 폴백이다.
    const needGeo = jobs.flatMap((j) => {
      const address = stored.get(j.id)?.geocoded_at ? null : (details.get(j.id)?.address ?? regOf(j)?.address ?? null);
      return address ? [{ id: j.id, address }] : [];
    });
    const coords = new Map(
      await inBatches(needGeo, 6, async (g) => [g.id, await geocodeAddress(g.address)] as const),
    );
    const geoTried = new Set(needGeo.map((g) => g.id));

    const rows = jobs.map((j) => {
      const reg = regOf(j);
      const s = stored.get(j.id);
      const d = details.get(j.id);
      // 명부 주소가 표준형이라 지역 축이 그대로 맞는다(HIRA 의 region 표기는 비표준 — sync-alio 주석 참고).
      // 집계 사이트는 상세의 근무지 주소가 실제 근무지라 그쪽을 먼저 본다.
      // 🔴 저장값이 명부보다 앞선다. 상세는 한 번만 받으므로 2회차부터 d 가 없는데, 명부를 먼저 보면
      //    **좌표는 상세 주소로 찍히고 지역은 명부 주소로 바뀌어** 둘이 어긋난다.
      const loc = d?.address ?? s?.location ?? reg?.address ?? null;
      const region = regionOfLocation(loc);
      const description = bodies.get(j.id) ?? d?.description ?? s?.description ?? null;
      return {
        // 🔴 명부 매칭은 j.hospital(법인명 포함 정확명)로, **화면에는 부를 만한 이름**을 쓴다.
        //    안 그러면 카드에 "학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)" 이 찍힌다.
        company_name: j.displayName,
        hospital_id: null,
        title: j.title,
        specialty: departmentFromText(j.title, description),
        facility_type: reg?.facilityType ?? s?.facility_type ?? null,
        job_category: j.jobCategory,
        employment_type: j.employmentType ?? d?.employmentType ?? s?.employment_type ?? null,
        // 급여는 상세에만 있다(목록에는 아예 없다). 없으면 화면이 "급여 협의" 로 받는다.
        salary_text: d?.salaryText ?? s?.salary_text ?? null,
        location: [region.sido, region.sigungu].filter(Boolean).join(" ") || s?.location || null,
        sido: region.sido,
        sigungu: region.sigungu,
        // 🔴 명부 주소로만 지오코딩한다 — 주소를 못 얻은 공고는 좌표 없이 둔다.
        //    엉뚱한 좌표를 찍느니 「내 주변」에서 빠지는 편이 낫다.
        lat: coords.get(j.id)?.lat ?? s?.lat ?? null,
        lng: coords.get(j.id)?.lng ?? s?.lng ?? null,
        geocoded_at: geoTried.has(j.id) ? syncStart : (s?.geocoded_at ?? null),
        description,
        apply_detail: null,
        source: "crawl" as const,
        external_url: j.url,
        external_id: j.id,
        status: "open" as const,
        // 🔴 등록일이 없는 공고에 매번 syncStart 를 찍으면 **영원히 "오늘 등록"** 이 되어
        //    관리자 대시보드의 '오늘' 숫자를 부풀리고 목록 정렬도 계속 위로 올린다. 처음 본 날을 지킨다.
        posted_at: j.postedAt ? new Date(`${j.postedAt}T00:00:00+09:00`).toISOString() : (s?.posted_at ?? syncStart),
        // 목록에 마감일이 없는 출처(집계 사이트)는 상세의 접수 종료일을 쓴다.
        // 🔴 저장값 폴백이 반드시 있어야 한다. 상세는 공고당 한 번만 받으므로 2회차부터 d 가 없고,
        //    폴백이 없으면 **첫 실행에 채운 마감일이 매 실행 null 로 지워진다**(실측: 16건 → 0건).
        deadline: j.deadline ?? d?.deadline ?? s?.deadline ?? null,
        detail_fetched_at: bodies.has(j.id) || details.has(j.id) ? syncStart : (s?.detail_fetched_at ?? null),
      };
    });

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin.from("jobs").upsert(chunk, { onConflict: "source,external_id" });
      if (error) return NextResponse.json({ error: `jobs upsert: ${error.message}`, upserted }, { status: 500 });
      upserted += chunk.length;
    }

    // 🔴 마감 처리는 **응답에 성공한 병원의 공고만** 닫는다.
    //    한 곳이 점검 중일 때 source='crawl' 전체를 닫으면, 멀쩡한 나머지 19곳 덕분에
    //    `failed.length === 0` 같은 전역 가드를 통과해 버리고 **그 병원 공고만 통째로 사라진다.**
    //    external_id 가 `{host}-{공고번호}` 라 호스트 접두로 범위를 정확히 좁힐 수 있다.
    const alive = [...TENANTS.map((t) => t.host), ...SITES.map((s) => s.key), ...BOARDS.map((b) => b.key)]
      .filter((h) => !failed.includes(h));
    let closed = 0;
    for (const host of alive) {
      const { data: closedRows, error: closeErr } = await admin
        .from("jobs").update({ status: "closed" })
        .eq("source", "crawl").eq("status", "open").lt("updated_at", syncStart)
        .like("external_id", `${host}-%`)
        .select("id");
      if (closeErr) return NextResponse.json({ error: `jobs close(${host}): ${closeErr.message}`, upserted }, { status: 500 });
      closed += closedRows?.length ?? 0;
    }

    // 🔴 이름 개수(registry.size)가 아니라 **명부에 붙은 공고 수**를 센다 —
    //    집계 사이트는 이름을 둘씩 조회해서 registry.size 가 실제보다 부풀어 보인다.
    const registryMatched = jobs.filter((j) => regOf(j)).length;
    const stats = {
      tenants: TENANTS.length, sites: SITES.length, boards: BOARDS.length,
      fetchedAts: ats.jobs.length, fetchedSites: sites.jobs.length, fetchedBoards: boards.jobs.length,
      jobsUpserted: upserted, jobsClosed: closed, registryMatched,
      // 상세 수집도 센다 — 이게 0 으로 굳으면 카드가 제목만 남는다(오너 신고 2026-08-12).
      detailsFetched: bodies.size + details.size,
    };
    await recordRun(admin, { collector: "ats", ok: failed.length === 0, stats, failed, startedAt });

    return NextResponse.json({
      ok: true,
      tenants: TENANTS.length,
      sites: SITES.length,
      boards: BOARDS.length,
      fetchedAts: ats.jobs.length,
      fetchedSites: sites.jobs.length,
      fetchedBoards: boards.jobs.length,
      fetched: jobs.length,
      jobsUpserted: upserted,
      jobsClosed: closed,
      descriptionsFetched: bodies.size + details.size,
      registryMatched,
      // 실패한 병원 사이트를 숨기지 않는다 — 계속 비어 있으면 그 테넌트 주소가 바뀐 것이다.
      failedHosts: failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    // 🔴 실패도 반드시 남긴다 — 성공만 기록하면 "며칠째 실패 중"을 영영 알 수 없다.
    await recordRun(createAdminClient(), { collector: "ats", ok: false, error: msg, startedAt });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
