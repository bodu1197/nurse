/**
 * 구 널스넷 기업회원(병원)의 사업자 정보 → profiles 이관. 1회성 스크립트.
 *
 *  1) business_no 프리필 (2,585곳)
 *     — business_no 자체는 아무 권한도 주지 않는다. 공고 등록 게이트는 business_verified 뿐이다
 *       (src/app/mypage/actions.ts:105). 병원이 /mypage/verify 에 가면 번호가 이미 채워져 있게 하는 것.
 *
 *  2) 국세청 진위확인 자동 통과 (228곳 시도)
 *     — 옛 사이트는 사업자번호를 자진신고로만 받았고(인증서류 제출은 193곳뿐), 개업일자는 231곳만 있다.
 *       진위확인에는 번호+개업일자+대표자명 3개가 다 필요하므로 나머지는 병원이 직접 인증해야 한다.
 *     — 통과한 건만 business_verified=true. 실패·미확인은 건드리지 않는다.
 *
 * 실행:  node scripts/import-legacy-hospital-biz.ts          (미리보기)
 *        node scripts/import-legacy-hospital-biz.ts --apply  (실제 적용)
 */
import { readFileSync } from "node:fs";
import { chunk, IN_BATCH, restHeaders, loadLegacyProfileMap } from "./_legacy-util.ts";

const APPLY = process.argv.includes("--apply");
const SRC = "scripts/legacy-data/hosp_bizno.json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ntsKey = process.env.DATA_GO_KR_API_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");

const H = restHeaders(key);
const digits = (v: string) => v.replace(/\D/g, "");

// [member_srl, bizno, regdate, ceo, company_name]
type Legacy = [string, string, string, string, string];
const src = JSON.parse(readFileSync(SRC, "utf8")) as { bizno: Legacy[]; verifiable: Legacy[] };

// ── 1. legacy_member_srl → profile id ────────────────────
// role=hospital 만. 이미 인증을 마친 병원은 자진신고 번호로 덮지 않는다(인증됨+미검증번호 불일치 방지).
const byLegacy = await loadLegacyProfileMap(url, H, "&role=eq.hospital&business_verified=is.false");
console.log(`병원 회원(미인증, legacy 보유): ${byLegacy.size}명`);

// ── 2. business_no 프리필 대상 ───────────────────────────
const fills = src.bizno
  .map(([srl, bizno]) => ({ id: byLegacy.get(srl.trim()), business_no: digits(bizno) }))
  .filter((x): x is { id: string; business_no: string } => !!x.id && x.business_no.length === 10);
console.log(`사업자번호 프리필 대상: ${fills.length}건 (원천 ${src.bizno.length}건 중 profiles 매칭분)`);

// ── 3. 진위확인 대상 ─────────────────────────────────────
type Target = { id: string; b_no: string; start_dt: string; p_nm: string; cname: string };
const targets = src.verifiable
  .map(([srl, bizno, regdt, ceo, cname]) => ({
    id: byLegacy.get(srl.trim()),
    b_no: digits(bizno),
    start_dt: digits(regdt),
    p_nm: ceo.trim(),
    cname,
  }))
  // 타입가드로 좁혀 둔다 — 아래에서 t.id 를 non-null 단언 없이 쓰기 위해.
  .filter((x): x is Target => !!x.id && x.b_no.length === 10 && x.start_dt.length === 8 && !!x.p_nm);
console.log(`국세청 진위확인 시도 대상: ${targets.length}건`);

if (!APPLY) {
  console.log("\n── 프리필 샘플 3 ──");
  console.log(fills.slice(0, 3));
  console.log("\n── 진위확인 샘플 3 ──");
  console.log(targets.slice(0, 3).map((t) => ({ ...t, id: t.id.slice(0, 8) + "…" })));
  console.log("\n미리보기만 했습니다. 적용하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// ── 4. business_no 프리필 ────────────────────────────────
let filled = 0;
for (const part of chunk(fills, 500)) {
  const r = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(part),
  });
  if (!r.ok) {
    console.error("프리필 실패", r.status, (await r.text()).slice(0, 300));
    process.exit(1);
  }
  filled += part.length;
  process.stdout.write(`\r  business_no 적용 ${filled}/${fills.length}`);
}
console.log(`\n✅ 사업자번호 프리필: ${filled}건`);

// ── 5. 국세청 진위확인 (배치 100건/요청) ─────────────────
if (!ntsKey) {
  console.log("⚠ DATA_GO_KR_API_KEY 없음 — 진위확인은 건너뜁니다.");
  process.exit(0);
}
// 위 가드로 존재가 확정됐지만 클로저 안에서는 좁혀진 타입이 유지되지 않는다 → 여기서 붙잡는다.
const NTS_KEY = ntsKey;
const passed: string[] = [];
const failReason = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 국세청 API 는 간헐적으로 503(-5, 상위서버 오류)을 뱉는다 — 우리 키·요청 문제가 아니라 국세청↔포털
 * 연계 구간이 불안정한 것이라 재시도하면 통과한다. 실측: 같은 요청이 503 → 200 → 503 으로 왕복.
 */
async function validateWithRetry(businesses: { b_no: string; start_dt: string; p_nm: string }[], tries = 12) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${encodeURIComponent(NTS_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businesses }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) return (await r.json()) as { data?: { valid?: string; status?: { b_stt?: string } }[] };
      if (i === tries) console.error(`  국세청 API 실패(${tries}회 재시도)`, r.status, (await r.text()).slice(0, 160));
    } catch {
      /* 타임아웃도 같은 원인 — 재시도 */
    }
    await sleep(Math.min(1000 * i, 5000));
  }
  return null;
}

for (const part of chunk(targets, 100)) {
  const j = await validateWithRetry(part.map(({ b_no, start_dt, p_nm }) => ({ b_no, start_dt, p_nm })));
  if (!j) {
    console.error("\n국세청 API 가 계속 실패해 남은 배치를 중단합니다. 나중에 재실행하세요(스크립트는 멱등).");
    process.exit(1);
  }
  (j.data ?? []).forEach((d, i) => {
    const t = part[i];
    const stt = d.status?.b_stt ?? "";
    if (d.valid === "01" && (!stt || stt === "계속사업자")) passed.push(t.id);
    else {
      const why = d.valid !== "01" ? "불일치" : stt || "상태미상";
      failReason.set(why, (failReason.get(why) ?? 0) + 1);
    }
  });
  process.stdout.write(`\r  진위확인 ${passed.length}건 통과 / ${targets.length}건 조회`);
}
console.log();

// 통과분만 인증 처리. 실패·미확인은 손대지 않는다(병원이 직접 인증).
if (passed.length) {
  const now = new Date().toISOString();
  for (const part of chunk(passed, IN_BATCH)) {
    const r = await fetch(`${url}/rest/v1/profiles?id=in.(${part.join(",")})`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ business_verified: true, business_verified_at: now }),
    });
    if (!r.ok) {
      console.error("인증 반영 실패", r.status, (await r.text()).slice(0, 300));
      process.exit(1);
    }
  }
}
console.log(`✅ 국세청 진위확인 통과: ${passed.length}건 → business_verified 처리`);
console.log("   실패 사유:", Object.fromEntries(failReason));
