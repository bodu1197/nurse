// 🔴 `server-only` 를 안 붙인다 — 판정 로직(decideMatch)이 이 파일의 핵심이고 Node 시험에서
//    돌아야 한다(붙이면 ERR_MODULE_NOT_FOUND). 이 파일에는 비밀이 없고, import 하는 곳은
//    크론 Route Handler 두 곳과 자체 시험뿐이라 클라이언트 번들에 들어가지 않는다(alio.ts 와 같은 이유).
import type { SupabaseClient } from "@supabase/supabase-js";
import { facilityFromClCd } from "./jobTaxonomy.ts";

/**
 * 🏥 공고의 회사명으로 **심사평가원 병원 명부**를 찾아 기관 종별·지역을 얻는다.
 *
 * 왜 필요한가: 공고에는 기관 등급이 안 적혀 있다. 워크넷은 산업분류(KSIC)만 주는데 거기엔
 * '상급종합' 이라는 개념이 없고, 잡알리오는 산업분류조차 없다. 명부(79,795건)에는 복지부가 정한
 * 종별이 들어 있으므로, **이름이 같으면** 그 값을 그대로 쓰는 것이 추정보다 정확하다.
 *
 * 🔴 이름은 유일하지 않다. 실측(2026-08-11): "우리한의원" 62곳, "연세의원" 47곳처럼 동명이 흔하다
 *    (전체 81,431건 중 서로 다른 이름은 57,020개). 판정 규칙은 decideMatch 한 곳에 있다.
 *
 * 🔴 이 파일은 **틀린 값을 붙이지 않는 것**이 전부다. 종별이 틀리면 간호사가 요양원을 상급종합으로
 *    보고 지원한다. 애매하면 비운다 — 빈 값은 칩에서 빠질 뿐이지만 틀린 값은 거짓말이다.
 */
export type RegistryMatch = {
  /** FACILITY_TYPES 값. 동명 기관의 종별이 갈리거나 하나라도 모르면 null. */
  facilityType: string | null;
  /** 명부의 "시도 시군구" (예: "경기 수원팔달구"). 동명이 여럿이면 null. */
  region: string | null;
  /** 명부 주소. 동명이 여럿이면 null. */
  address: string | null;
};

export type RegistryRow = {
  name: string;
  cl_cd_nm: string | null;
  region: string | null;
  address: string | null;
};

/**
 * 같은 이름의 명부 행들 → 판정.
 *
 * 🔴 종별: **한 행이라도 종별을 모르면(null) 비운다.** 아는 것끼리만 비교하면
 *    "전부 같을 때만" 이 아니라 "아는 것끼리 같을 때" 가 되어 버린다 — 동명 2곳 중 1곳만
 *    값이 있는 상태(명부 동기화가 중간까지 반영된 구간에서 실제로 생긴다)에서 그 1곳 값이
 *    확정돼 나머지 한 곳을 잘못 분류한다.
 * 🔴 지역·주소: **정확히 한 곳일 때만.** 동명이 여럿이면 지역은 서로 다르다 —
 *    아무거나 고르면 간호사에게 "서울 강남" 이라고 거짓말하게 된다.
 */
export function decideMatch(rows: readonly RegistryRow[]): RegistryMatch {
  const only = rows.length === 1 ? rows[0] : null;
  // 종별은 **한 번만** 계산해서 두 판정(같은가 / 다 아는가)이 같은 값을 보게 한다.
  const graded = rows.map((r) => facilityFromClCd(r.cl_cd_nm));
  const grades = new Set(graded);
  const allKnown = graded.length > 0 && graded.every((g) => g !== null);
  const [first] = [...grades];
  return {
    facilityType: allKnown && grades.size === 1 ? first : null,
    region: only?.region ?? null,
    address: only?.address ?? null,
  };
}

// 🔴 `.in()` 은 **URL 쿼리스트링**으로 나간다. 병원 이름은 한글이라 한 글자가 퍼센트 인코딩으로
//    9자가 된다 — 8글자 이름 하나가 ~76자다. 300개를 한 번에 보내면 URL 이 2만 자를 넘어
//    요청이 그냥 실패한다(실측 2026-08-11: `hospitals lookup: TypeError: fetch failed`).
//    50개면 ~4KB 로 어떤 서버에서도 안전하다.
//    (이름에 쉼표가 든 기관이 32건 있는데 PostgREST 가 따옴표로 감싸 정확히 처리한다 — 실측 확인.)
const CHUNK = 50;
// 🔴 PostgREST 는 상한(기본 1,000행)에서 응답을 **조용히 자른다.** 잘리면 동명 62곳짜리 그룹이
//    1행만 남아 `rows.length === 1` 로 "유일" 오판 → 남의 지역·주소가 그대로 들어간다.
//    그래서 상한을 명시하고, 그 수만큼 왔으면 잘렸다고 보고 **실패시킨다**(부르는 쪽이 보강을 포기한다).
// 🔴 요청은 `ROW_LIMIT + 1` 로 하고 `> ROW_LIMIT` 로 판정한다 — 딱 ROW_LIMIT 행이 **실제 전부**인
//    경우까지 "잘렸다"고 오판하지 않으려면 한 칸 더 요청해 봐야 한다.
const ROW_LIMIT = 2000;

/**
 * 이름들로 명부를 조회해 이름 → 판정 결과 맵을 만든다.
 * 명부에 없는 이름은 맵에 들어가지 않는다(부르는 쪽이 기존 값을 지킨다).
 * 🔴 조회가 실패하면 throw 한다. **부르는 쪽은 이걸 잡아서 수집 자체를 죽이지 말 것** —
 *    종별은 보강값이고, 이것 때문에 공고 동기화 전체가 죽으면 대가가 맞지 않는다.
 */
async function lookupHospitals(
  admin: SupabaseClient,
  names: readonly string[],
): Promise<Map<string, RegistryMatch>> {
  const uniq = [...new Set(names.filter((n) => n && n.trim()))];
  const rows: RegistryRow[] = [];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const { data, error } = await admin
      .from("hospitals")
      .select("name,cl_cd_nm,region,address")
      .in("name", uniq.slice(i, i + CHUNK))
      .limit(ROW_LIMIT + 1);
    if (error) throw new Error(`hospitals lookup: ${error.message}`);
    if ((data?.length ?? 0) > ROW_LIMIT) {
      throw new Error(`hospitals lookup: 응답이 상한(${ROW_LIMIT})에 걸려 잘렸다 — 동명 판정을 믿을 수 없다`);
    }
    rows.push(...((data ?? []) as RegistryRow[]));
  }

  const byName = new Map<string, RegistryRow[]>();
  for (const r of rows) {
    const list = byName.get(r.name);
    if (list) list.push(r);
    else byName.set(r.name, [r]);
  }

  const out = new Map<string, RegistryMatch>();
  for (const [name, list] of byName) out.set(name, decideMatch(list));
  return out;
}

/**
 * 실패해도 수집은 계속한다 — 종별·지역은 **보강값**이다.
 * 🔴 종전에는 이 조회 한 번이 실패하면 워크넷 공고 동기화(upsert·마감 처리)가 통째로 502 였다.
 *    실제로 겪은 실패다(URL 길이 초과). 보강값 때문에 본체를 죽이지 않는다.
 */
export async function lookupHospitalsBestEffort(
  admin: SupabaseClient,
  names: readonly string[],
): Promise<Map<string, RegistryMatch>> {
  try {
    return await lookupHospitals(admin, names);
  } catch (e) {
    console.error("[registry] 병원 명부 조회 실패 — 기관 종별 보강 없이 진행:", e instanceof Error ? e.message : e);
    return new Map();
  }
}
