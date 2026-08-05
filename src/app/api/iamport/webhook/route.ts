import { NextResponse } from "next/server";
import { iamportWebhook } from "@/app/mypage/actions";

// 포트원 웹훅 — 클라 콜백 실패 대비 서버-투-서버 활성화. imp_uid로 재검증하므로 위조 무해.
export const dynamic = "force-dynamic";
// 포트원 재조회 + DB 쓰기가 붙는다. 모바일에서 복귀 화면을 놓친 손님에게는 이 웹훅이
// 광고를 켜는 유일한 경로라, 기본 함수 타임아웃에 걸려 5xx 로 죽으면 안 된다(재시도는 유한하다).
export const maxDuration = 30;

export async function POST(request: Request) {
  // 외부에서 오는 JSON — 타입을 믿지 않고 필요한 두 필드만 문자열로 꺼낸다.
  const body: { imp_uid?: unknown; merchant_uid?: unknown } | null = await request.json().catch(() => null);
  const impUid = body?.imp_uid;
  const merchantUid = body?.merchant_uid;
  if (!impUid || !merchantUid) return NextResponse.json({ ok: false }, { status: 400 });
  const result = await iamportWebhook(String(impUid), String(merchantUid));
  // 포트원은 상태코드로 재시도를 판단한다. 일시 실패만 5xx로 돌려 재시도를 유도하고,
  // 다시 보내도 결과가 같은 건("ignored")은 200으로 받아 무한 재시도를 막는다.
  return NextResponse.json({ ok: result !== "retry" }, { status: result === "retry" ? 500 : 200 });
}
