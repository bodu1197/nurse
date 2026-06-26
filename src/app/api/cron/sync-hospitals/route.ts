import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 주 1회 Vercel Cron — HIRA 병원정보서비스 재수집 후 ykiho 기준 upsert(신규 추가 + 변경 반영).
// 폐업 기관 삭제는 생략(getHospBasisList는 활성 기관만 반환 + reviews FK 고아 위험). 필요 시 개폐업 API로 별도.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: 최대 5분

const HIRA = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const PAGE = 10000; // 페이지 수 최소화(전체 ~8페이지) — 순차 80페이지는 타임아웃
const UPSERT_CHUNK = 1000; // 큰 단일 upsert 페이로드 회피

type Item = { ykiho?: string; yadmNm?: string; addr?: string; sidoCdNm?: string; sgguCdNm?: string };
type Row = { ykiho: string; name: string; address: string | null; region: string | null };

async function fetchPage(key: string, pageNo: number): Promise<{ rows: Row[]; total: number }> {
  const qs = new URLSearchParams({ serviceKey: key, pageNo: String(pageNo), numOfRows: String(PAGE), _type: "json" });
  const res = await fetch(`${HIRA}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(45000) }).catch(() => null);
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

    // 2) 나머지 페이지 병렬 수집(한국 data.go.kr 왕복이 느려 순차는 타임아웃)
    const rest = pageCount > 1
      ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => fetchPage(key, i + 2)))
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
