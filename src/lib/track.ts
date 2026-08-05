import type { NextRequest } from "next/server";

/**
 * 접속 기록 — (날짜, 경로) 조회수 한 칸 + (날짜, 방문자지문) 한 행.
 *
 * 🔴 왜 미들웨어인가: 서버 컴포넌트에 넣으면 페이지마다 코드를 심어야 하고 하나 빠뜨리면
 *    그 페이지만 통계에서 사라진다. 미들웨어는 이미 모든 문서 요청을 지난다.
 *
 * 🔴 쿠키는 심지 않는다. 방문자를 구분하되 개인은 특정할 수 없게, **IP + 브라우저정보 +
 *    서버만 아는 비밀값**을 SHA-256 으로 섞은 16자 지문(vid)만 만들어 보낸다.
 *    - 원본 IP 는 여기서 지문으로 바뀐 뒤 버려진다 — DB 로 넘어가지도 저장되지도 않는다.
 *    - 지문은 되돌릴 수 없고, 비밀값을 바꾸면 전부 리셋된다.
 *    - ⚠️ 병원·회사처럼 공용 인터넷을 쓰면 여러 명이 한 명으로 뭉친다(오차 5~10%).
 *      정확한 1:1 을 원하면 쿠키를 심어야 하는데 그건 처리방침이 따라오므로 안 한다.
 *
 * 🔴 쿼리스트링을 버린다(DB 함수에서도 한 번 더 자른다). 검색어·토큰이 통계 표에 쌓이면
 *    그 표가 개인정보 저장소가 된다. 동적 구간(/jobs/<uuid>)은 DB 함수가 `/jobs/:id` 로 묶는다.
 *
 * 🔴 유입 경로는 **도메인만** 남긴다(google.com). 경로·쿼리를 남기면 남의 사이트에서 온
 *    검색어까지 우리 표에 쌓인다.
 */
const SKIP = [/^\/admin(\/|$)/, /^\/auth(\/|$)/, /^\/api(\/|$)/, /^\/_next(\/|$)/];

/**
 * 사람이 아닌 것. 검색엔진·SNS 미리보기·모니터링·스크립트.
 * 🔴 버리지 않고 봇 칸에 따로 센다 — "구글봇이 우리 사이트를 도는가" 가 SEO 게이지다.
 *    (yeti=네이버, daumoa=다음)
 */
const BOT =
  /bot|crawl|spider|slurp|yeti|daumoa|facebookexternalhit|embedly|preview|curl|wget|python-requests|okhttp|go-http-client|java\/|headless|lighthouse|monitor|uptime|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|scrapy|phantomjs|node-fetch|axios/i;

export function trackPageView(request: NextRequest): Promise<unknown> | undefined {
  if (request.method !== "GET") return undefined;
  if (request.headers.get("next-router-prefetch")) return undefined;

  const ua = request.headers.get("user-agent") ?? "";
  // UA 가 아예 없는 요청은 사람이 아니다(브라우저는 항상 보낸다).
  const bot = ua === "" || BOT.test(ua);

  // 🔴 사람은 **문서 요청만** 센다. prefetch·데이터 요청까지 세면 사람이 안 본 페이지가 조회수가 된다.
  // 🔴 봇에는 이 조건을 걸지 않는다. Sec-Fetch-* 는 브라우저 기능이라 크롤러 대부분
  //    (ahrefs·semrush·python-requests 류)은 아예 안 보낸다 — 봇에도 걸면 세기도 전에 걸러져
  //    "봇 조회" 가 영원히 0 인 죽은 숫자가 되고, 검색엔진이 우리 사이트를 도는지 못 본다.
  //    사람 조회수(views)에는 봇이 안 들어가므로 이 완화가 사람 숫자를 오염시키지 않는다.
  if (!bot && request.headers.get("sec-fetch-dest") !== "document") return undefined;

  const path = request.nextUrl.pathname;
  if (SKIP.some((re) => re.test(path))) return undefined; // 관리자·인증 콜백은 통계에 넣지 않는다

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return undefined;

  // 🔴 Promise 를 돌려준다 — 호출부(proxy)가 waitUntil 로 붙잡아야 한다.
  //    응답을 반환하는 순간 엣지 인스턴스가 얼어붙어, 매달아 두기만 하면 기록이 유실된다.
  // 🔴 catch 를 여기서 한 번 더 건다. 해시 계산(crypto.subtle)이 던지면 그 rejection 이
  //    waitUntil 로 그대로 넘어가 요청 자체를 실패로 만든다 — 통계 때문에 페이지가 죽으면 안 된다.
  return send(request, path, url, anon, ua, bot).catch((e) => console.error("trackPageView:", e?.message ?? e));
}

async function send(request: NextRequest, path: string, url: string, anon: string, ua: string, bot: boolean) {
  const body: Record<string, unknown> = { p_path: path, p_bot: bot };

  if (!bot) {
    const vid = await fingerprint(request, ua);
    if (vid) {
      body.p_vid = vid;
      // 🔴 'mobile'/'desktop'/'direct' 는 세 곳이 짝이다 — 여기, DB 함수 track_page_view 의
      //    화이트리스트, 그리고 화면의 DEVICE_LABEL/REF_LABEL(app/admin/stats/page.tsx).
      //    한 곳만 바꾸면 나머지가 말없이 desktop·direct 로 떨어진다.
      body.p_device = isMobile(request, ua) ? "mobile" : "desktop";
      body.p_ref = refHost(request);
    }
  }

  // 🔴 anon 키로 부른다(service_role 은 미들웨어에 두지 않는다 — 엣지 번들에 실릴 수 있다).
  //    함수 자체가 security definer 라 익명도 조회수만 올릴 수 있고 표를 읽지는 못한다.
  const res = await fetch(`${url}/rest/v1/rpc/track_page_view`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });

  // 🔴 fetch 는 404·400 에도 정상 반환한다. 그냥 두면 **함수 시그니처가 안 맞아 기록이 통째로
  //    멈춰도 로그에 아무것도 안 남는다**(PGRST202). 통계가 0인 게 진짜 0인지 고장인지
  //    구분되지 않는 상태 — 이 저장소가 이미 "0건" 으로 한 번 당한 함정이다.
  if (!res.ok) console.error(`trackPageView: ${res.status} ${await res.text().catch(() => "")}`);
}

/**
 * 되돌릴 수 없는 16자 방문자 지문. 비밀값이 없으면 만들지 않는다(조회수만 쌓인다).
 *
 * 🔴 비밀값이 있어야 하는 이유: 소금 없이 IP 를 해시하면 IPv4 43억 개를 전부 돌려
 *    맞춰볼 수 있다. 비밀값을 모르면 못 맞춘다.
 * 🔴 VISITOR_SALT 를 따로 두는 게 정석이지만, 없으면 이미 서버에만 있는 CRON_SECRET 을 쓴다 —
 *    환경변수를 하나 더 넣기 전에도 집계가 돌게 하려는 것이다. CRON_SECRET 을 바꾸면
 *    지문이 리셋되어 그날 하루 순 방문자가 실제보다 크게 잡힌다(그때 VISITOR_SALT 를 넣으면 된다).
 */
async function fingerprint(request: NextRequest, ua: string): Promise<string | null> {
  const salt = process.env.VISITOR_SALT || process.env.CRON_SECRET;
  if (!salt) return null;

  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";
  if (!ip) return null; // IP 를 모르면 누구인지 구분할 수 없다 — 조회수만 센다

  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  // 8바이트(64비트)면 하루 수만 명까지 겹칠 걱정이 없다. 짧게 잘라 표를 가볍게 둔다.
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isMobile(request: NextRequest, ua: string): boolean {
  // 크롬 계열은 헤더로 정확히 알려준다. 사파리 등은 UA 로 본다.
  if (request.headers.get("sec-ch-ua-mobile") === "?1") return true;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
}

/** 유입 도메인. 없으면 'direct'(주소 직접 입력·북마크·앱). 우리 사이트 안에서 온 것도 유입이 아니다. */
function refHost(request: NextRequest): string {
  const referer = request.headers.get("referer");
  if (!referer) return "direct";
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === request.nextUrl.hostname.toLowerCase().replace(/^www\./, "")) return "direct";
    // DB 쪽 검사와 같은 형식. 안 맞으면 버린다(넣어봐야 direct 로 되돌아온다).
    return /^[a-z0-9][a-z0-9.-]{0,39}$/.test(host) ? host : "direct";
  } catch {
    return "direct";
  }
}
