import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNurseJobs, fetchDetails } from "@/lib/worknet";
import { regionOfLocation } from "@/lib/jobRegion";
import { departmentFromText, stillValid } from "@/lib/jobTaxonomy";

// 워크넷(고용24) 채용정보 "간호" 키워드 수집 → jobs upsert.
// 워크넷 공고는 "구인 광고"다 — 병원 명부(hospitals, 심사평가원)와 다른 것이라 명부에 레코드를 만들지 않는다.
// 회사명은 광고 자체(jobs.company_name)에 텍스트로만 담는다(hospital_id는 null).
// ⏰ 크론(vercel.json): 하루 4회 KST 00:30/06:30/12:30/18:30 = UTC "30 3,9,15,21 * * *"(6시간 간격).
//    모든 워크넷 공고는 마감일이 있어 KST 자정에 그날 마감분이 빠진다 → 00:30 실행이 그 저점을 즉시 메운다.
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
    if (jobs.length === 0) return NextResponse.json({ ok: true, fetched: 0, jobs: 0 });

    const admin = createAdminClient();

    // ?reset=1: 상세 파싱 로직 변경 후 기존 보강분을 재처리하려 마커 초기화(앱 경유 1회성 운영용).
    if (new URL(request.url).searchParams.get("reset") === "1") {
      const { error } = await admin.from("jobs").update({ detail_fetched_at: null }).eq("source", "worknet").not("detail_fetched_at", "is", null);
      if (error) return NextResponse.json({ error: `reset: ${error.message}` }, { status: 500 });
    }

    // 상세 API 보강 — 리스트엔 없는 직무내용·연락처·모집인원·근무시간·복지·전형.
    //    보강 완료는 전용 마커 detail_fetched_at으로 판별(성공 파싱마다 세팅). 접수정보 없는 공고도 1회로 종료 → starvation 방지.
    //    미보강분만 실행당 상한(?detail=, 기본 1500)으로 증분. 초기 백필은 여러 번 실행하거나 ?detail 상향(로컬).
    const detailMax = Math.min(Math.max(0, Number(new URL(request.url).searchParams.get("detail") ?? 1500) || 1500), 15000);
    type Stored = { title: string; specialty: string | null; facility_type: string | null; job_category: string | null; description: string | null; recruit_count: number | null; manager_phone: string | null; manager_name: string | null; shift_type: string | null; benefits: string[]; apply_detail: string | null; deadline: string | null; detail_fetched_at: string | null };
    const stored = new Map<string, Stored>();
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await admin
        .from("jobs")
        .select("external_id,title,specialty,facility_type,job_category,description,recruit_count,manager_phone,manager_name,shift_type,benefits,apply_detail,deadline,detail_fetched_at")
        .eq("source", "worknet").range(from, from + 999);
      if (error) return NextResponse.json({ error: `jobs select: ${error.message}` }, { status: 500 });
      for (const r of page ?? []) if (r.external_id) stored.set(r.external_id, r as Stored);
      if (!page || page.length < 1000) break;
    }
    // 아직 상세 미보강(detail_fetched_at null) 공고만 호출. 신규 공고는 stored에 없으므로 자동 포함.
    const need = jobs.filter((j) => !stored.get(j.authNo)?.detail_fetched_at).slice(0, detailMax).map((j) => ({ authNo: j.authNo, infoSvc: j.infoSvc }));
    const details = await fetchDetails(need);

    // 리스트 기본 직무설명(상세 미보강 공고용 임시).
    const listDesc = (j: (typeof jobs)[number]) =>
      [j.company, j.holidayTpNm && `근무형태: ${j.holidayTpNm}`, j.minEdubg && `학력: ${j.minEdubg}`, j.career && `경력: ${j.career}`, j.addr && `근무지: ${j.addr}`].filter(Boolean).join("\n");

    // jobs upsert. 필드별 우선순위: 이번 상세(d) → 기존 저장값(s) → 리스트 기본. 리스트 재실행이 상세 보강값을 덮지 않게 보존.
    // 광고 자체에 회사명을 담고, 병원 명부는 참조하지 않는다(hospital_id: null).
    const rows = jobs.map((j) => {
      const d = details.get(j.authNo);
      const s = stored.get(j.authNo);
      const region = regionOfLocation(j.region || null); // 지역 드롭다운·필터용 정규화(백필과 같은 경로)
      // 🗂 진료과는 상세를 받은 뒤 다시 뽑는다. 리스트에는 제목뿐이라 10.8% 밖에 안 잡히는데,
      //    상세의 사업내용(busiCont)·직무내용(jobCont)까지 보면 22.3% 로 오른다(실측 400건).
      //    상세를 아직 못 받은 공고는 리스트 단계 추론값(j.specialty)을 그대로 쓴다.
      // 🔴 저장값(s.specialty)을 남길지 말지가 핵심이다.
      //    · 상세를 **이번에 받았으면**(d) 지금 규칙이 본 것이 정답이다 — null 이면 null 로 둔다.
      //      옛 값을 `?? s?.specialty` 로 살려두면 **규칙을 고쳐도 옛 오분류가 영원히 남는다**.
      //      실제로 그래서 "요양원에 분만실 8건"이 정리 후에도 크론 한 번에 되살아났다(2026-07-29).
      //    · 상세를 못 받았으면(d 없음) 제목만으로는 근거가 얕으므로 저장값을 지킨다.
      //      단, 그 저장값이 **지금 규칙으로 설명되지 않으면** 옛 규칙 산물이니 버린다.
      // 🔴 판정에 쓰는 텍스트는 **실제로 저장할 텍스트와 같아야** 한다. 상세를 받았는데 본문이
      //    비어 오면(jobCont 공백) description 컬럼은 아래에서 옛 값을 지키는데, 판정만 빈 본문으로
      //    하면 근거가 컬럼에 남아 있는데도 진료과가 지워진다.
      const finalTitle = d?.title ?? s?.title ?? j.title;
      const finalDesc = d?.description ?? s?.description ?? listDesc(j);
      const fresh = d ? departmentFromText(finalTitle, d.busiCont, finalDesc) : j.specialty;
      // 🔴 저장값을 버릴지 판단할 때, **근거가 컬럼에 남아 있는지**를 함께 본다.
      //    진료과는 제목·직무내용뿐 아니라 상세의 사업내용(busiCont)으로도 맞추는데 그건 저장하지
      //    않는다. 상세는 공고당 한 번만 받으므로(detail_fetched_at), 보강이 끝난 공고에서
      //    "제목·본문에 없다"를 근거로 지우면 busiCont 로 맞춘 정상값이 영영 사라진다.
      //    → 이미 보강된 공고는 저장값을 그대로 둔다. 규칙 변경을 반영하려면 마이그레이션으로
      //      detail_fetched_at 을 비워 상세를 다시 받게 한다(그때 fresh 가 정답을 준다).
      const keep = s?.specialty
        && (s.detail_fetched_at || stillValid(s.specialty, `${s.title ?? ""} ${s.description ?? ""}`))
        ? s.specialty
        : null;
      const specialty = d ? fresh : (fresh ?? keep);
      return {
        company_name: j.company || null,
        hospital_id: null,
        title: finalTitle,
        specialty,
        // 기관 종별·직종은 워크넷이 코드로 정확히 준다(누락 0건) — 추론이 아니라 정답이다.
        // 다만 산업분류가 표에 없는 3.2% 는 유도가 null 이라, 그때는 저장값을 지키지 않으면
        // 마이그레이션이 회사명으로 채워둔 값이 첫 동기화(6시간 내)에 통째로 날아간다.
        facility_type: j.facilityType ?? s?.facility_type ?? null,
        job_category: j.jobCategory ?? s?.job_category ?? null,
        employment_type: j.employmentType,
        location: j.region || null,
        sido: region.sido,
        sigungu: region.sigungu,
        salary_text: [j.salTpNm, j.sal].filter(Boolean).join(" ") || null,
        description: finalDesc,
        recruit_count: d?.recruitCount ?? s?.recruit_count ?? null,
        manager_phone: d?.managerPhone ?? s?.manager_phone ?? null,
        manager_name: d?.managerName ?? s?.manager_name ?? null,
        shift_type: d?.shiftType ?? s?.shift_type ?? null,
        benefits: d?.benefits ?? s?.benefits ?? [],
        apply_detail: d?.applyDetail ?? s?.apply_detail ?? null,
        source: "worknet" as const,
        external_url: j.url || null,
        external_id: j.authNo,
        status: "open" as const,
        posted_at: toIso(j.regDt),
        // 마감일은 리스트가 매 실행 갱신되는 필드라 최신(j) 우선 — 연장/변경 반영. 상세·저장값은 리스트 null(상시)일 때 보완.
        deadline: j.deadline ?? d?.deadline ?? s?.deadline ?? null,
        // 상세 성공 수신 시 마커 세팅(내용값 무관), 아니면 기존 마커 보존.
        detail_fetched_at: d ? syncStart : (s?.detail_fetched_at ?? null),
      };
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

    const enrichedRemaining = jobs.filter((j) => !stored.get(j.authNo)?.detail_fetched_at && !details.has(j.authNo)).length;
    return NextResponse.json({ ok: true, fetched: jobs.length, jobsUpserted: upserted, jobsClosed: closedRows?.length ?? 0, detailsFetched: details.size, enrichRemaining: enrichedRemaining });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 502 });
  }
}
