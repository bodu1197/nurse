import "server-only";

// 국세청 사업자등록 진위확인 (data.go.kr 15081808, odcloud) — 서버 전용.
export type VerifyResult = { ok: boolean; reason?: string; status?: string };

export async function verifyBusiness(b_no: string, start_dt: string, p_nm: string): Promise<VerifyResult> {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) return { ok: false, reason: "config" };

  const bno = b_no.replace(/\D/g, "");
  const sdt = start_dt.replace(/\D/g, "");
  const nm = p_nm.trim();
  if (bno.length !== 10 || sdt.length !== 8 || !nm) return { ok: false, reason: "input" };

  try {
    const r = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businesses: [{ b_no: bno, start_dt: sdt, p_nm: nm }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, reason: "api" };
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return { ok: false, reason: "api" };
    if (d.valid !== "01") return { ok: false, reason: "mismatch" };
    const stt: string = d.status?.b_stt ?? "";
    if (stt && stt !== "계속사업자") return { ok: false, reason: "inactive", status: stt };
    return { ok: true, status: stt };
  } catch {
    return { ok: false, reason: "api" };
  }
}
