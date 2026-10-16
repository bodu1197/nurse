import "server-only";

const ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";
const KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

export type Coords = { lat: number; lng: number };

// null = 카카오가 정상 응답했는데 **결과가 없다**(주소를 못 찾음) · undefined = **일시 장애**(키 없음·401/429·타임아웃).
// 둘을 가르는 이유: 장애를 "주소 없음"으로 기록하면 그 공고는 영영 좌표 없이 굳는다(sync-care 의 geocoded_at 계약).
async function search(url: string, query: string): Promise<Coords | null | undefined> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return undefined;
  const qs = new URLSearchParams({ query, size: "1" });
  try {
    const res = await fetch(`${url}?${qs}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    // 401/403(키 문제)·429(한도)·5xx 는 일시 장애 → undefined. 그 밖의 4xx(400 잘못된 질의 등)는 이 주소로는 영영
    // 안 되는 것이라 "결과 없음"(null) — undefined 로 두면 같은 주소에서 매 실행 멈춘다(sync-care 의 묶음 중단 규칙).
    if (!res.ok) return res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500 ? undefined : null;
    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) return null;
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return undefined; // 지오코딩 실패는 저장을 막지 않는다 — 부르는 쪽이 lat/lng 를 null 로 두거나 다음에 다시 한다.
  }
}

/**
 * 주소 → 좌표, 장애를 구분해서. undefined 면 "이번엔 못 해 봤다"이니 시도한 것으로 기록하지 말 것(sync-care).
 * 지번/도로명 정확 매칭을 먼저, 안 되면 키워드(장소) 검색으로 한 번 더 — 둘 중 하나라도 장애였고 결과가 없으면 undefined.
 */
export async function geocodeAddressStrict(address: string): Promise<Coords | null | undefined> {
  const q = address.trim();
  if (!q) return null;
  const byAddress = await search(ADDRESS_URL, q);
  if (byAddress) return byAddress;
  const byKeyword = await search(KEYWORD_URL, q);
  if (byKeyword) return byKeyword;
  return byAddress === undefined || byKeyword === undefined ? undefined : null;
}

export type Place = { name: string; address: string; lat: number; lng: number };

/** 장소 이름 검색 결과(최대 15곳) — 이름·주소(도로명 우선)·좌표. 장애면 undefined, 결과 없음은 빈 배열. */
export async function searchPlaces(query: string): Promise<Place[] | undefined> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch(`${KEYWORD_URL}?${new URLSearchParams({ query })}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const docs: { place_name: string; road_address_name: string; address_name: string; x: string; y: string }[] = (await res.json()).documents ?? [];
    return docs
      .map((d) => ({ name: d.place_name, address: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x) }))
      .filter((p) => p.address && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return undefined;
  }
}

// 주소 → 좌표. 지번/도로명 정확 매칭을 먼저 시도하고, 안 되면(건물명·약칭 등 워크넷 주소 quirk)
// 키워드(장소) 검색으로 한 번 더 시도한다.
export async function geocodeAddress(address: string): Promise<Coords | null> {
  // 종전 호출처(간호 크론·공고 등록)는 장애와 결과 없음을 구분하지 않는다 — 그대로 null 하나로 받는다.
  return (await geocodeAddressStrict(address)) ?? null;
}
