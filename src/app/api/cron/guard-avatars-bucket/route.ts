import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET } from "@/lib/data/avatar";
import { AVATAR_MAX_BYTES, AVATAR_MIME, avatarBucketDrift } from "@/lib/avatarLimits";

/**
 * 🔒 avatars 버킷이 비공개로 남아 있는지 확인하고, 아니면 **스스로 되돌린다.**
 *
 * 왜 이게 크론이어야 하는가:
 *   · 마이그레이션(20260728120000)은 한 번 적용되면 다시 돌지 않는다 — "돌릴 때마다 강제"가 안 된다.
 *   · DB 트리거로 못 박으려 했으나 storage.buckets 의 소유자가 supabase_storage_admin 이라
 *     우리 postgres 롤에는 트리거 생성 권한이 없다(실측 2026-07-30: can_create_trigger=false).
 *   → 남은 수단은 주기적 확인 + 자동 복구뿐이고, **지금 이 라우트가 유일한 강제 장치다.**
 *
 * 알림만 보내지 않고 **고치는** 이유: 공개로 뒤집힌 순간 간호사 얼굴 사진 1,487장이 서명 없이 열린다.
 * 사람이 알림을 볼 때까지 기다릴 성질의 사고가 아니다.
 *
 * 🔴 되돌림은 '복구'가 아니라 '사고 기록'이다. 공개였던 동안 이미 받아간 사진과 CDN 에 남은 사본은
 *    되돌려도 사라지지 않는다. repaired:true 가 한 번이라도 나오면 언제·누가 바꿨는지 쫓아야 한다.
 *
 * 주기는 10분(vercel.json). Hobby 였다면 크론 2개 제한 + 하루 1회 강등이라 이 보장이 깨지는데,
 * 이 프로젝트는 **Vercel Pro 확인됨**(오너 확인 2026-07-30)이라 10분 간격이 실제로 돈다.
 *
 * 잠시 일부러 공개해야 한다면(break-glass): vercel.json 의 이 크론 항목을 지우고 배포한 뒤 작업하고,
 * 끝나면 되돌린다. 크론을 켠 채로 대시보드에서 공개하면 10분 안에 다시 닫힌다.
 *
 * ponytail: 실패 신호가 console.error 하나뿐이다 — 이 라우트가 계속 실패해도 조용하다.
 *   지금은 같은 admin 클라이언트를 앱 전체가 쓰므로 키·버킷 사고는 다른 화면에서 먼저 터진다는 데 기댄다.
 *   이걸로 부족하면(예: getBucket 만 조용히 실패) drift 이력을 테이블에 남기고 알림을 붙인다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel Cron 전용 — 다른 크론과 같은 방식으로 외부 트리거를 막는다.
  // secret 이 없으면 열리는 게 아니라 잠긴다(fail-closed).
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 기존 크론(sync-worknet)과 같이 전체를 감싼다 — 네트워크 예외가 throw 되면
  // 구조화된 응답 대신 Next 기본 500 이 나가고 로그에 맥락이 남지 않는다.
  try {
    const admin = createAdminClient();
    const { data: bucket, error } = await admin.storage.getBucket(AVATAR_BUCKET);
    if (error || !bucket) {
      // 버킷을 못 읽는 것 자체가 사고다(이름이 바뀌었거나 지워졌다) — 조용히 ok 를 돌려주지 않는다.
      console.error("guard-avatars-bucket: getBucket 실패:", error?.message);
      return NextResponse.json({ error: error?.message ?? "bucket not found" }, { status: 502 });
    }

    const drift = avatarBucketDrift(bucket);
    if (drift.length === 0) return NextResponse.json({ ok: true, drift: [] });

    console.error(
      `🚨 avatars 버킷이 어긋나 되돌린다 — 항목=[${drift.join(", ")}] public=${bucket.public} ` +
      `마지막변경=${bucket.updated_at ?? "?"}. 공개였던 동안 받아간 사진은 되돌릴 수 없다 — 원인을 추적할 것.`,
    );
    const { error: fixErr } = await admin.storage.updateBucket(AVATAR_BUCKET, {
      public: false,
      fileSizeLimit: AVATAR_MAX_BYTES,
      allowedMimeTypes: [...AVATAR_MIME],
    });
    if (fixErr) {
      console.error("guard-avatars-bucket: 복구 실패:", fixErr.message);
      return NextResponse.json({ error: fixErr.message, drift }, { status: 500 });
    }
    return NextResponse.json({ ok: true, drift, repaired: true, changedAt: bucket.updated_at ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "guard failed";
    console.error("guard-avatars-bucket: 예외:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
