import "server-only";

// 포트원(구 아임포트) V1 REST — 서버 결제 검증. 키는 env(IAMPORT_API_KEY/SECRET).
const BASE = "https://api.iamport.kr";

// 키가 모두 설정돼야 결제 활성. 미설정 시 UI는 "준비 중"으로 막힘(실수결제 방지).
export function iamportReady(): boolean {
  return !!(process.env.IAMPORT_API_KEY && process.env.IAMPORT_API_SECRET && process.env.NEXT_PUBLIC_IAMPORT_CODE);
}

async function getToken(): Promise<string | null> {
  const res = await fetch(`${BASE}/users/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imp_key: process.env.IAMPORT_API_KEY, imp_secret: process.env.IAMPORT_API_SECRET }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => null);
  return j?.response?.access_token ?? null;
}

export type IamportPayment = { imp_uid: string; merchant_uid: string; amount: number; status: string };

// imp_uid로 결제 단건 조회(서버-투-서버) — 금액/상태 위변조 검증용.
// 반환값 3종: 결제정보 | "notfound"(그런 거래 없음=다시 물어봐도 같음) | null(토큰·네트워크 등 일시 실패).
// 웹훅이 이 둘을 구분해야 위조 웹훅에 5xx로 응답해 재시도를 자초하지 않는다.
export async function getPayment(impUid: string): Promise<IamportPayment | "notfound" | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/payments/${encodeURIComponent(impUid)}`, {
    headers: { Authorization: token },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res) return null;                                                    // 네트워크/타임아웃
  if (!res.ok) return res.status >= 500 || res.status === 429 ? null : "notfound"; // 4xx = 없는 거래
  const r = (await res.json().catch(() => null))?.response;
  if (!r) return "notfound";
  return { imp_uid: r.imp_uid, merchant_uid: r.merchant_uid, amount: r.amount, status: r.status };
}
