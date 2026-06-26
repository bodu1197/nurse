import { NextResponse } from "next/server";
import { iamportWebhook } from "@/app/mypage/actions";

// 포트원 웹훅 — 클라 콜백 실패 대비 서버-투-서버 활성화. imp_uid로 재검증하므로 위조 무해.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const impUid = body?.imp_uid;
  const merchantUid = body?.merchant_uid;
  if (!impUid || !merchantUid) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await iamportWebhook(String(impUid), String(merchantUid));
  return NextResponse.json({ ok });
}
