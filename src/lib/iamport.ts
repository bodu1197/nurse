import "server-only";

// 포트원(구 아임포트) V1 REST — 서버 결제 검증. 키는 env(IAMPORT_API_KEY/SECRET).
const BASE = "https://api.iamport.kr";

// 키가 모두 설정돼야 결제 활성. 미설정 시 UI는 "준비 중"으로 막힘(실수결제 방지).
export function iamportReady(): boolean {
  return !!(process.env.IAMPORT_API_KEY && process.env.IAMPORT_API_SECRET && process.env.NEXT_PUBLIC_IAMPORT_CODE);
}

// 🔴 토큰을 캐시한다. 포트원 V1 토큰은 30분 유효한데 매번 새로 받으면 조회 1건이 항상
//    순차 HTTPS 2회가 된다 — 결제창을 닫을 때·결제 준비마다 조회가 붙는 지금은 그 왕복이
//    그대로 손님 대기 시간이다.
// 🔴 값이 아니라 **프라미스**를 캐시한다. 값만 담으면 resolve 되기 전에는 계속 캐시 미스라,
//    회수기가 Promise.all 로 여러 건을 동시에 물을 때 전부 각자 토큰을 받는다 —
//    캐시가 가장 필요한 병렬 경로에서 정확히 안 듣는다.
let tokenCache: { p: Promise<string | null>; exp: number } | null = null;

function getToken(): Promise<string | null> {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.p;
  // 만료 시각은 응답을 보고 정한다. 그 전까지는 짧게 잡아 두어, 실패한 프라미스가 오래 남지 않게 한다.
  const entry = { p: Promise.resolve<string | null>(null), exp: Date.now() + 30_000 };
  entry.p = (async () => {
    const res = await fetch(`${BASE}/users/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imp_key: process.env.IAMPORT_API_KEY, imp_secret: process.env.IAMPORT_API_SECRET }),
      cache: "no-store",
      // 토큰은 캐시되므로 재시도가 싸다 — 짧게 잡아야 조회 타임아웃과 합쳐도 손님이 오래 안 기다린다.
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);
    if (!res || !res.ok) { if (tokenCache === entry) tokenCache = null; return null; }
    const j = await res.json().catch(() => null);
    // 🔴 토큰도 형태를 검사한다. 이 파일은 결제 응답의 amount·status 에는 런타임 검사를 거는데
    //    정작 Authorization 헤더에 실리는 값만 any 로 통과시키고 있었다 — 그 비대칭이 다음 사고다.
    const raw = j?.response?.access_token;
    const token = typeof raw === "string" && raw ? raw : null;
    if (!token) { if (tokenCache === entry) tokenCache = null; return null; }
    // 만료 1분 전까지만 쓴다. expired_at(초)이 없으면 보수적으로 5분만 재사용한다.
    // 🔴 하한을 둔다 — 포트원이 expired_at 을 절대 시각이 아니라 잔여 초(예: 1800)로 주면
    //    exp 가 1970년이 되어 캐시가 **영원히 미스**가 되고, 아무도 그 사실을 모른다.
    const expSec = Number(j?.response?.expired_at ?? 0);
    entry.exp = Math.max(Date.now() + 60_000, expSec > 0 ? expSec * 1000 - 60_000 : Date.now() + 5 * 60_000);
    return token;
  })();
  tokenCache = entry;
  return entry.p;
}

// 🔴 cancel_amount 를 같이 받는다. **부분취소는 status 가 'paid' 그대로**라서
//    status 만 보면 환불이 일어난 것을 영영 알 수 없다(전액취소만 'cancelled' 이 된다).
export type IamportPayment = { imp_uid: string; merchant_uid: string; amount: number; status: string; cancel_amount: number };

// 반환값 3종: 결제정보 | "notfound"(그런 거래 없음=다시 물어봐도 같음) | null(토큰·네트워크 등 일시 실패).
// 웹훅이 이 둘을 구분해야 위조 웹훅에 5xx로 응답해 재시도를 자초하지 않는다.
// 🔴 재시도 예산을 **전체 한 벌**로 묶는다(deadline). 예산 없이 재시도를 겹치면
//    토큰 4초 + 재시도 4초 + 조회 10초 + 401 재귀 10초 = 최악 28초가 되는데, 그 시간을
//    방금 결제한 모바일 손님이 빈 화면으로 본다. 여기서 한 번 정한 마감을 모두가 나눠 쓴다.
async function read(path: string, timeoutMs = 10000, retry = true, deadline = Date.now() + timeoutMs): Promise<IamportPayment | "notfound" | null> {
  const left = () => deadline - Date.now();
  if (left() <= 0) return null;
  // 🔴 토큰을 못 받으면 **한 번 더** 받아 본다. 타임아웃을 4초로 줄인 뒤로는 포트원이 잠깐만
  //    느려도 여기서 null 이 나오는데, 웹훅과 달리 verifyAdPayment 에는 "다음 호출" 이 없어
  //    카드가 실제로 긁힌 손님이 곧장 "검증 실패" 화면을 본다.
  let token = await getToken();
  // 여기서 tokenCache 를 비우지 않는다 — getToken 이 실패한 항목만 스스로 지우므로,
  // 그사이 다른 동시 요청이 받아 둔 **정상 토큰**을 날려 불필요한 재발급을 만든다.
  if (!token && retry && left() > 0) token = await getToken();
  if (!token || left() <= 0) return null;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token },
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(1, left())),
  }).catch(() => null);
  if (!res) return null;                                                    // 네트워크/타임아웃
  // 🔴 인증 실패면 캐시한 토큰이 죽은 것이다. 비우고 **그 자리에서 한 번 다시** 시도한다.
  //    "다음 호출이 받겠지" 로 두면 안 된다 — 웹훅은 재시도가 오지만 verifyAdPayment(결제 직후
  //    검증)에는 다음 호출이 없어서, 카드가 실제로 긁힌 손님이 "검증 실패" 화면을 본다.
  if ((res.status === 401 || res.status === 403) && retry && left() > 0) {
    tokenCache = null;
    return read(path, timeoutMs, false, deadline);
  }
  // 🔴 "404 = 결제 없음" 이 이 파일의 핵심 가정이고, 그 위에서 손님 캐시를 돌려준다.
  //    포트원이 다른 코드로 답하는 순간 조용히 어긋나므로, 2xx 가 아닌 응답은 전부 로그에 남긴다
  //    (운영 로그 한 줄로 가정을 검증할 수 있어야 한다).
  if (!res.ok) console.info("[iamport]", path, res.status);
  // 🔴 **404 만** "없는 거래" 다. 이 한 줄 위에 결제 로직 전체가 서 있다 —
  //    "notfound = 돈이 안 나갔다" 를 근거로 광고 캐시를 돌려주고 주문을 EXPIRED 로 못 박기 때문이다.
  //    전에는 4xx 를 통째로 notfound 로 읽었다. 토큰을 캐시하는 지금은 그 오해가 수십 분 이어져
  //    **승인된 결제**의 캐시를 돌려주고 주문을 되살릴 수 없게 만든다(= 돈은 받고 광고는 없음).
  if (!res.ok) return res.status === 404 ? "notfound" : null;
  const r = (await res.json().catch(() => null))?.response;
  // 🔴 200 인데 본문을 못 읽는 것은 "거래 없음" 이 아니라 **일시 실패**다(프록시·CDN 이 끼어든 경우).
  //    여기서 notfound 를 돌려주면 위 원칙을 스스로 어기고 결제된 주문의 캐시를 돌려주게 된다.
  if (!r) return null;
  // 🔴 amount 는 **금액 대조의 근거**다. 문자열로 오면 `pay.amount !== orderAmount` 가 항상 참이 되어
  //    정상 결제가 금액 불일치(FAILED)로 기록되고 손님은 "금액이 맞지 않습니다" 를 본다 — 숫자로 강제한다.
  //    숫자가 아니면 단정하지 않고 일시 실패로 돌린다.
  const amount = Number(r.amount);
  if (!Number.isFinite(amount)) return null;
  // cancel_amount 는 취소 이력이 없으면 0 이거나 아예 안 올 수 있다 — 없으면 0 으로 읽는다.
  return {
    imp_uid: String(r.imp_uid ?? ""), merchant_uid: String(r.merchant_uid ?? ""),
    amount, status: String(r.status ?? ""),
    cancel_amount: Number(r.cancel_amount ?? 0) || 0,
  };
}

// 포트원 식별자 형식. imp_uid 는 모바일 복귀 쿼리스트링에서 그대로 들어오는 **외부 문자열**이라
// URL 경로에 끼우기 전에 거른다(encodeURIComponent 는 "." 을 인코딩하지 않아 ".." 이 경로를 바꾼다).
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// imp_uid로 결제 단건 조회(서버-투-서버) — 금액/상태 위변조 검증용.
export const getPayment = (impUid: string): Promise<IamportPayment | "notfound" | null> =>
  UID_RE.test(impUid) ? read(`/payments/${encodeURIComponent(impUid)}`) : Promise.resolve("notfound");

/**
 * 우리 주문번호로 **승인된(paid) 결제가 있는지**를 묻는다.
 *
 * 🔴 상태를 `/paid` 로 못 박는 이유: 한 주문번호에 거절 뒤 재승인이 일어나면 그 번호에 실패·승인
 *    두 건이 남는데, 상태를 안 적은 `/payments/find/{uid}` 가 **어느 건을 돌려주는지 보장이 없다.**
 *    실패 건이 돌아오면 "돈이 안 나갔다" 로 읽고 승인된 결제의 캐시를 돌려준 뒤 주문을 EXPIRED 로
 *    못 박는다(되살릴 수 없다 = 돈은 받고 광고는 없음). 물을 것은 하나다 — "받은 돈이 있는가".
 *
 * 반환: 결제정보(=돈이 있다) | "notfound"(=승인된 결제가 없다) | null(=조회 실패, 단정 금지).
 * 🔒 주문번호가 우리 형식이 아니면 "없다" 고 단정하지 않는다 — 그 단정이 곧 캐시 반환 근거다.
 */
// ⏱ 타임아웃을 5초로 짧게 준다. 이 조회는 손님이 「결제하기」를 누른 뒤 도는 회수 경로에 붙어
//    그대로 대기 시간이 되는데, 못 물어봐도 2시간 안전판이 받아 준다 — 오래 기다릴 이유가 없다.
export const findPaidPayment = (merchantUid: string): Promise<IamportPayment | "notfound" | null> =>
  UID_RE.test(merchantUid)
    ? read(`/payments/find/${encodeURIComponent(merchantUid)}/paid`, 5000)
    : Promise.resolve(null);
