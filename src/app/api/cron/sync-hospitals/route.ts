import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 주 1회 Vercel Cron — HIRA 병원정보서비스 재수집 후 ykiho 기준 upsert(신규 추가 + 변경 반영).
// 폐업 기관 삭제는 생략(getHospBasisList는 활성 기관만 반환 + reviews FK 고아 위험). 필요 시 개폐업 API로 별도.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: 최대 5분

const HIRA = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const PAGE = 1000;

type Item = { ykiho?: string; yadmNm?: string; addr?: string; sidoCdNm?: string; sgguCdNm?: string };

export async function GET(request: Request) {
  // Vercel Cron 전용 — CRON_SECRET 헤더 검증으로 외부 트리거 차단
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return NextResponse.json({ error: "missing DATA_GO_KR_API_KEY" }, { status: 500 });

  const admin = createAdminClient();
  let pageNo = 1;
  let total = 0;
  let pages = 0;
  let upserted = 0;

  while (true) {
    const qs = new URLSearchParams({ serviceKey: key, pageNo: String(pageNo), numOfRows: String(PAGE), _type: "json" });
    const res = await fetch(`${HIRA}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res || !res.ok) return NextResponse.json({ error: `HIRA fetch failed`, pageNo, upserted }, { status: 502 });

    const body = (await res.json())?.response?.body;
    total = Number(body?.totalCount ?? 0);
    const raw = body?.items?.item;
    const items: Item[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (items.length === 0) break;

    const rows = items
      .filter((it) => it.ykiho && it.yadmNm)
      .map((it) => ({
        ykiho: it.ykiho as string,
        name: it.yadmNm as string,
        address: it.addr ?? null,
        region: [it.sidoCdNm, it.sgguCdNm].filter(Boolean).join(" ") || null,
      }));

    if (rows.length) {
      const { error } = await admin.from("hospitals").upsert(rows, { onConflict: "ykiho" });
      if (error) return NextResponse.json({ error: error.message, pageNo, upserted }, { status: 500 });
      upserted += rows.length;
    }

    pages++;
    if (pageNo * PAGE >= total || pages > 200) break; // 안전 상한
    pageNo++;
  }

  return NextResponse.json({ ok: true, total, pages, upserted });
}
