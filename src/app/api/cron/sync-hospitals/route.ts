import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inBatches } from "@/lib/worknet"; // 동시 실행 수 제한 — 이미 있는 것을 쓴다

// HIRA 병원정보서비스 재수집 후 ykiho 기준 upsert(신규 추가 + 변경 반영).
// 폐업 기관 삭제는 생략(getHospBasisList는 활성 기관만 반환 + reviews FK 고아 위험). 필요 시 개폐업 API로 별도.
//
// ⏰ 크론(vercel.json): **하루 1회** KST 03:00 = UTC "0 18 * * *" (오너 지시 2026-08-11).
//    종전 주 1회에서 바꿨다. 이유가 둘이다:
//      ① 신규 개원 병원이 명부에 들기까지 최대 7일 걸렸다 — 그동안 리뷰도 클레임도 안 된다.
//      ② **실패가 자동 복구된다.** 주 1회일 때는 한 번 죽으면 7일 구멍이었고, 실제로 계속
//         죽고 있었는데 아무도 몰랐다(아래 페이지 크기 주석 참고). 매일이면 다음 날이 메운다.
//    시각도 일부러 이렇게 뒀다 — 공고 크론(워크넷 KST 06, 잡알리오 KST 07)이 명부에서 기관 종별을
//    읽어 가므로(lib/hospitalRegistry), 명부가 **먼저** 갱신돼야 그날 공고에 최신 종별이 붙는다.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: 최대 5분

const HIRA = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
// 🔴 종전에는 10,000건씩 받으면서 남은 페이지를 **한꺼번에** Promise.all 로 던졌다. 그런데 HIRA 는
//    10,000건 한 페이지에 **35초**가 걸린다(실측 2026-08-11: 10000→35초 / 5000→21초 / 2000→12초).
//    8개를 동시에 던지면 서로 밀려 45초 제한을 넘고, 한 페이지만 실패해도 실행 전체가 502 로 죽는다
//    (실측: 로컬에서 2회 연속 타임아웃). 주 1회짜리 크론이라 실패해도 아무도 눈치채지 못한다.
//    → 페이지를 작게(12초) 쪼개고 동시 실행 수를 묶는다.
// 🔴 동시 실행 수는 **실측으로 정했다**(전체 실행 시간, maxDuration 300초 기준):
//      6 → 239초(여유 61초, 하루 1회로 돌리기엔 아슬아슬)   12 → 173초(여유 127초)
//    시간의 대부분은 upsert 가 아니라 HIRA 왕복이다 — 묶음 크기보다 이 값이 훨씬 크게 듣는다.
//    더 올리기 전에 반드시 다시 재라. 동시 요청이 늘면 개별 페이지가 느려져 어느 지점부터 되레 손해다.
const PAGE = 2000;
const CONCURRENCY = 12;
// 🔴 8만 건이면 왕복 수가 그대로 시간이다. 1,000개씩 보내면 80왕복이라 실행이 241초까지 갔다
//    (실측 2026-08-11, maxDuration 300초 — 여유가 59초뿐이라 조금만 느려져도 통째로 죽는다).
//    2,000개면 40왕복이고 한 번에 보내는 양은 여전히 작다(행당 ~150바이트 = 300KB).
const UPSERT_CHUNK = 2000;

// clCdNm = 종별("상급종합"·"종합병원"·"병원"·"요양병원"·"의원"…). 공고의 기관 종별을 여기서 가져온다 —
// 워크넷 산업분류(KSIC)에는 '상급종합' 이라는 개념이 없어 그 칩이 영원히 0건이었다(20260811180000).
type Item = { ykiho?: string; yadmNm?: string; addr?: string; sidoCdNm?: string; sgguCdNm?: string; clCdNm?: string };
type Row = { ykiho: string; name: string; address: string | null; region: string | null; cl_cd_nm: string | null };

async function fetchPage(key: string, pageNo: number, attempt = 1): Promise<{ rows: Row[]; total: number }> {
  const qs = new URLSearchParams({ serviceKey: key, pageNo: String(pageNo), numOfRows: String(PAGE), _type: "json" });
  // 🔴 예산은 **실측으로 잡았다.** 동시 12개로 던졌을 때 페이지당 8~19초다(2026-08-11 실측,
  //    12개 배치 전체 19초). 종전 45초는 너무 헐거워 죽은 연결을 오래 붙잡고, 20초는 너무 빠듯해
  //    정상 페이지까지 끊는다. 30초면 최장(19초) 대비 여유가 58% 다.
  //    최악(모든 페이지가 1회씩 실패)이라도 배치당 60초 × 4배치 = 240초로 maxDuration 300초 안이다.
  const budget = 30000;
  const res = await fetch(`${HIRA}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(budget) }).catch(() => null);
  // 한 페이지가 잠깐 흔들렸다고 하루치 실행을 통째로 버리지 않는다 — 한 번만 다시 시도한다.
  if ((!res || !res.ok) && attempt === 1) return fetchPage(key, pageNo, 2);
  if (!res || !res.ok) throw new Error(`HIRA page ${pageNo} fetch failed`);
  const body = (await res.json())?.response?.body;
  const raw = body?.items?.item;
  const items: Item[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rows = items
    .filter((it) => it.ykiho && it.yadmNm)
    .map((it) => ({
      ykiho: it.ykiho as string,
      name: it.yadmNm as string,
      address: it.addr ?? null,
      region: [it.sidoCdNm, it.sgguCdNm].filter(Boolean).join(" ") || null,
      cl_cd_nm: it.clCdNm?.trim() || null,
    }));
  return { rows, total: Number(body?.totalCount ?? 0) };
}

export async function GET(request: Request) {
  // Vercel Cron 전용 — CRON_SECRET 헤더 검증으로 외부 트리거 차단
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return NextResponse.json({ error: "missing DATA_GO_KR_API_KEY" }, { status: 500 });

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

    return NextResponse.json({ ok: true, total: firstPage.total, pages: pageCount, upserted });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 502 });
  }
}
