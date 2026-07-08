import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNurseJobs, fetchWantedTitles, isTruncatedTitle } from "@/lib/worknet";

// 워크넷(고용24) 채용정보 "간호" 키워드 수집 → hospitals/jobs upsert.
// jobs.hospital_id가 NOT NULL이므로 회사명 단위로 워크넷 병원 레코드를 만들어 연결.
// ponytail: 병원 매칭은 (source='worknet', name) 기준. 사업자번호 컬럼이 없어 동명 회사는 1개로 합쳐짐 — 필요 시 busino 컬럼 추가.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "26-07-08" → ISO. 파싱 실패·비정상 날짜면 현재 시각.
function toIso(regDt: string): string {
  const m = regDt.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return new Date().toISOString();
  const d = new Date(`20${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const syncStart = new Date().toISOString(); // 이번 실행 이전 갱신분 = 목록 이탈분 판별 기준
    const jobs = await fetchNurseJobs();
    if (jobs.length === 0) return NextResponse.json({ ok: true, fetched: 0, hospitals: 0, jobs: 0 });

    const admin = createAdminClient();

    // 1) 회사명 → 병원 id 맵. 기존 워크넷 병원 조회 후, 없는 회사만 신규 insert(재실행 시 중복 방지).
    const names = [...new Set(jobs.map((j) => j.company).filter(Boolean))];
    const nameToId = new Map<string, string>();

    // 기존 워크넷 병원 조회(회사명 IN). 조회 실패 시 중단 — 계속하면 전원 미존재로 간주해 중복 병원 insert 위험.
    for (let i = 0; i < names.length; i += 500) {
      const chunk = names.slice(i, i + 500);
      const { data, error } = await admin.from("hospitals").select("id,name").eq("source", "worknet").in("name", chunk);
      if (error) return NextResponse.json({ error: `hospitals select: ${error.message}` }, { status: 500 });
      for (const h of data ?? []) nameToId.set(h.name, h.id);
    }

    // 신규 회사 insert
    const missing = names.filter((n) => !nameToId.has(n));
    const byName = new Map(jobs.map((j) => [j.company, j])); // 회사명→대표 공고(지역·주소용). 루프 밖 1회 생성.
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      const { data, error } = await admin
        .from("hospitals")
        .insert(chunk.map((name) => ({ name, source: "worknet", region: byName.get(name)?.region || null, address: byName.get(name)?.addr || null })))
        .select("id,name");
      if (error) return NextResponse.json({ error: `hospitals insert: ${error.message}` }, { status: 500 });
      for (const h of data ?? []) nameToId.set(h.name, h.id);
    }

    // 2) 전체 제목 보강 — 리스트 title은 고정폭 잘림("..."). 아직 전체제목 미확보(잘린)분만 상세 API 호출(증분).
    //    실행당 상한(?detail=, 기본 1500)으로 Vercel 시간 준수. 초기 백필은 여러 번 실행하거나 ?detail 상향(로컬).
    const detailMax = Math.min(Math.max(0, Number(new URL(request.url).searchParams.get("detail") ?? 1500) || 1500), 15000);
    const storedTitle = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin.from("jobs").select("external_id,title").eq("source", "worknet").range(from, from + 999);
      if (error) return NextResponse.json({ error: `jobs title select: ${error.message}` }, { status: 500 });
      for (const r of page ?? []) if (r.external_id) storedTitle.set(r.external_id, r.title);
      if (!page || page.length < 1000) break;
    }
    // 상세 호출 없이 확보 가능한 최선 제목: 리스트가 안 잘렸으면 그대로, 아니면 저장된 완전 제목 재사용.
    const bestTitle = (j: (typeof jobs)[number]) => {
      if (!isTruncatedTitle(j.title)) return j.title;
      const s = storedTitle.get(j.authNo);
      return s && !isTruncatedTitle(s) ? s : (s ?? j.title);
    };
    const need = jobs.filter((j) => isTruncatedTitle(bestTitle(j))).slice(0, detailMax).map((j) => ({ authNo: j.authNo, infoSvc: j.infoSvc }));
    const detailTitles = await fetchWantedTitles(need);
    const titleOf = (j: (typeof jobs)[number]) => detailTitles.get(j.authNo) ?? bestTitle(j);

    // 3) jobs upsert (source, external_id) 기준. 병원 미매칭 공고는 제외(flatMap).
    const rows = jobs.flatMap((j) => {
      const hospital_id = nameToId.get(j.company);
      if (!hospital_id) return [];
      return [{
        hospital_id,
        title: titleOf(j),
        specialty: j.specialty,
        employment_type: j.employmentType,
        location: j.region || null,
        salary_text: [j.salTpNm, j.sal].filter(Boolean).join(" ") || null,
        description: [j.company, j.holidayTpNm && `근무형태: ${j.holidayTpNm}`, j.minEdubg && `학력: ${j.minEdubg}`, j.career && `경력: ${j.career}`, j.addr && `근무지: ${j.addr}`].filter(Boolean).join("\n"),
        source: "worknet" as const,
        external_url: j.url || null,
        external_id: j.authNo,
        status: "open" as const,
        posted_at: toIso(j.regDt),
        deadline: j.deadline,
      }];
    });

    // (source, external_id) 유니크 인덱스 기준 upsert — 신규 추가 + 기존 갱신(status='open' 재활성 포함).
    let upserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin.from("jobs").upsert(chunk, { onConflict: "source,external_id" });
      if (error) return NextResponse.json({ error: `jobs upsert: ${error.message}`, upserted }, { status: 500 });
      upserted += chunk.length;
    }

    // 워크넷 목록에서 사라진 공고(충원·마감·철회)는 우리 사이트도 close — 조기 마감 반영.
    // 이번 upsert로 갱신된 live 공고는 updated_at >= syncStart. 갱신 안 된 open 공고(=목록 이탈분)만 close.
    // ponytail: 잘림(캡 초과) 시 일부 오탐 가능하나 다음 실행의 upsert가 status='open'으로 복구(self-healing).
    const { data: closedRows, error: closeErr } = await admin
      .from("jobs")
      .update({ status: "closed" })
      .eq("source", "worknet")
      .eq("status", "open")
      .lt("updated_at", syncStart)
      .select("id");
    if (closeErr) return NextResponse.json({ error: `jobs close: ${closeErr.message}`, upserted }, { status: 500 });

    const stillTruncated = jobs.filter((j) => isTruncatedTitle(titleOf(j))).length;
    return NextResponse.json({ ok: true, fetched: jobs.length, hospitals: nameToId.size, jobsUpserted: upserted, jobsClosed: closedRows?.length ?? 0, titlesFetched: detailTitles.size, titlesStillTruncated: stillTruncated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 502 });
  }
}
