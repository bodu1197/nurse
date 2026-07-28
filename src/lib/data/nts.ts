import "server-only";

// 국세청 사업자등록 진위확인 (data.go.kr 15081808, odcloud) — 서버 전용. talent src/lib/nts.ts 와 같은 구조.
export type VerifyResult = { ok: boolean; reason?: string; status?: string };

// 이번 시도로는 판정을 못 냈다(일시 장애) → 다시 시도하라는 신호.
const RETRY = "retry" as const;
type Attempt = VerifyResult | typeof RETRY;

/** 국세청 응답 중 우리가 실제로 읽는 필드만. any 로 두면 필드명이 바뀌어도 컴파일러가 못 잡는다. */
type NtsResponse = { data?: { valid?: string; status?: { b_stt?: string } }[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ENDPOINT = "https://api.odcloud.kr/api/nts-businessman/v1/validate";

// 재시도 예산은 **서버리스 함수 실행시간 안에** 들어와야 한다. 넘기면 안내 문구 대신 504가 뜬다.
// 6초 × 2회 + 백오프 0.4초 = 최악 12.4초 (verify 페이지의 maxDuration=30 안에 여유 있게 들어간다).
// 실측상 장애는 400~550ms 만에 503으로 즉시 돌아오므로 2회로도 대부분 뚫린다 — 더 끈질긴 재시도가
// 필요한 배치 이관은 사람이 안 기다리므로 scripts/import-legacy-hospital-biz.ts 에서 12회까지 돈다.
const ATTEMPTS = 2;
const PER_ATTEMPT_MS = 6000;
const BACKOFF_MS = 400;

/**
 * 한 번 호출해 판정한다. 5xx·타임아웃은 상류(국세청) 일시 장애라 RETRY,
 * 그 외(401 키 오류·불일치·폐업)는 다시 물어도 답이 같으므로 확정 결과를 낸다.
 */
async function attemptVerify(key: string, body: string): Promise<Attempt> {
  try {
    const r = await fetch(`${ENDPOINT}?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(PER_ATTEMPT_MS), // 상류 지연 상한 — 요청이 무한정 매달리지 않게
    });
    if (!r.ok) return r.status >= 500 ? RETRY : { ok: false, reason: "api" };

    const d = ((await r.json()) as NtsResponse).data?.[0];
    if (!d) return { ok: false, reason: "api" };
    if (d.valid !== "01") return { ok: false, reason: "mismatch" };

    const stt: string = d.status?.b_stt ?? "";
    if (stt && stt !== "계속사업자") return { ok: false, reason: "inactive", status: stt };
    return { ok: true, status: stt };
  } catch {
    return RETRY; // 타임아웃도 상류 지연이라 재시도 대상
  }
}

/**
 * 국세청↔공공데이터포털 연계 구간이 불안정해 같은 요청이 503(code -5)과 200을 왕복한다(2026-07-28 실측).
 * 한 번 실패했다고 병원에게 "인증 서버 오류"를 띄우면 멀쩡한 사업자가 튕기므로 조용히 한 번 더 시도한다.
 */
export async function verifyBusiness(b_no: string, start_dt: string, p_nm: string): Promise<VerifyResult> {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return { ok: false, reason: "config" };

  const bno = b_no.replace(/\D/g, "");
  const sdt = start_dt.replace(/\D/g, "");
  const nm = p_nm.trim();
  if (bno.length !== 10 || sdt.length !== 8 || !nm) return { ok: false, reason: "input" };

  const body = JSON.stringify({ businesses: [{ b_no: bno, start_dt: sdt, p_nm: nm }] });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const res = await attemptVerify(key, body);
    if (res !== RETRY) return res;
    if (attempt < ATTEMPTS) await sleep(BACKOFF_MS);
  }
  return { ok: false, reason: "api" };
}
