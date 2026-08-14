import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inBatches } from "@/lib/worknet"; // 동시 실행 수 제한 — 이미 있는 것을 쓴다
import { recordRun } from "@/lib/collectorLog";
import { fetchHospitals } from "@/lib/hira";

// HIRA 병원정보서비스 **전건** 재수집 후 ykiho 기준 upsert(신규 추가 + 변경 반영).
// 폐업 기관 삭제는 생략(getHospBasisList는 활성 기관만 반환 + reviews FK 고아 위험). 필요 시 개폐업 API로 별도.
//
// ⏰ **자동 크론이 아니다 — 손으로 부를 때만 돈다**(vercel.json 에서 뺐다, 오너 지시 2026-08-14).
//    "병원이 구멍가게도 아니고 매일 오픈하지 않는다" — 맞는 지적이다. 하루 1회 전건 재수집은
//    8만 행 중 거의 전부가 어제와 같은 값이라, 3분짜리 실행을 매일 태우는 낭비였다.
//    이제 명부는 **필요할 때만** 채워진다:
//      · 평소: 병원 검색이 명부에서 못 찾으면 그때 **그 병원 하나만** 받아 넣는다(lib/hira 주석 참고).
//              신규 개원 병원이 들어오는 데 걸리는 시간이 종전 최대 24시간 → 검색하는 즉시가 됐다.
//      · 이 라우트: 종별 컬럼을 새로 추가했다거나 명부가 통째로 의심스러울 때 관리자가 1회 돌린다.
//        (CRON_SECRET 이 있어야 한다 — 아래 검증 참고.)
//
// 🔴 지우지 마라. 전건을 다시 받을 길이 없으면 명부가 한 번 틀어졌을 때 복구 수단이 없다.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: 최대 5분

// 🔴 종전에는 10,000건씩 받으면서 남은 페이지를 **한꺼번에** Promise.all 로 던졌다. 그런데 HIRA 는
//    10,000건 한 페이지에 **35초**가 걸린다(실측 2026-08-11: 10000→35초 / 5000→21초 / 2000→12초).
//    8개를 동시에 던지면 서로 밀려 45초 제한을 넘고, 한 페이지만 실패해도 실행 전체가 502 로 죽는다
//    (실측: 로컬에서 2회 연속 타임아웃).
//    → 페이지를 작게(12초) 쪼개고 동시 실행 수를 묶는다.
// 🔴 동시 실행 수는 **실측으로 정했다**(전체 실행 시간, maxDuration 300초 기준):
//      6 → 239초(여유 61초)   12 → 173초(여유 127초)
//    시간의 대부분은 upsert 가 아니라 HIRA 왕복이다 — 묶음 크기보다 이 값이 훨씬 크게 듣는다.
//    더 올리기 전에 반드시 다시 재라. 동시 요청이 늘면 개별 페이지가 느려져 어느 지점부터 되레 손해다.
const PAGE = 2000;
const CONCURRENCY = 12;
// 🔴 8만 건이면 왕복 수가 그대로 시간이다. 1,000개씩 보내면 80왕복이라 실행이 241초까지 갔다
//    (실측 2026-08-11, maxDuration 300초 — 여유가 59초뿐이라 조금만 느려져도 통째로 죽는다).
//    2,000개면 40왕복이고 한 번에 보내는 양은 여전히 작다(행당 ~150바이트 = 300KB).
const UPSERT_CHUNK = 2000;

const fetchPage = (key: string, pageNo: number) => fetchHospitals(key, { pageNo, numOfRows: PAGE });

export async function GET(request: Request) {
  // 관리자 수동 실행 전용 — CRON_SECRET 헤더 검증으로 외부 트리거 차단
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return NextResponse.json({ error: "missing DATA_GO_KR_API_KEY" }, { status: 500 });

  const startedAt = Date.now(); // catch 에서도 써야 해서 try 밖에 둔다
  try {
    // 1) 1페이지로 totalCount 확보
    const firstPage = await fetchPage(key, 1);
    const pageCount = Math.min(Math.ceil(firstPage.total / PAGE) || 1, 50); // 안전 상한

    // 2) 나머지 페이지 수집 — 동시 실행 수를 묶는다(전부 한꺼번에 던지면 서로 밀려 타임아웃).
    const rest = pageCount > 1
      ? await inBatches(Array.from({ length: pageCount - 1 }, (_, i) => i + 2), CONCURRENCY, (p) => fetchPage(key, p))
      : [];
    const rows = [firstPage, ...rest].flatMap((p) => p.rows);

    // 3) 청크 단위 upsert(ykiho 충돌 시 갱신)
    const admin = createAdminClient();
    let upserted = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await admin.from("hospitals").upsert(chunk, { onConflict: "ykiho" });
      if (error) return NextResponse.json({ error: error.message, upserted }, { status: 500 });
      upserted += chunk.length;
    }

    await recordRun(admin, {
      collector: "hospitals", ok: true, startedAt,
      stats: { total: firstPage.total, pages: pageCount, upserted, graded: rows.filter((r) => r.cl_cd_nm).length },
    });

    return NextResponse.json({ ok: true, total: firstPage.total, pages: pageCount, upserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    // 🔴 이건 실제로 몇 달 동안 매주 실패하고 있었는데 아무도 몰랐다(2026-08-11 발견).
    //    그래서 실패를 반드시 남긴다 — /admin/collectors 에 "실패" 로 뜨게.
    await recordRun(createAdminClient(), { collector: "hospitals", ok: false, error: msg, startedAt });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
