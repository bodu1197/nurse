import "server-only";

const ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";
const KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

export type Coords = { lat: number; lng: number };

async function search(url: string, query: string): Promise<Coords | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ query, size: "1" });
  try {
    const res = await fetch(`${url}?${qs}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) return null;
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null; // 지오코딩 실패는 저장을 막지 않는다 — lat/lng만 null로 남는다(내 주변 정렬 제외).
  }
}

// 주소 → 좌표. 지번/도로명 정확 매칭을 먼저 시도하고, 안 되면(건물명·약칭 등 워크넷 주소 quirk)
// 키워드(장소) 검색으로 한 번 더 시도한다.
export async function geocodeAddress(address: string): Promise<Coords | null> {
  const q = address.trim();
  if (!q) return null;
  return (await search(ADDRESS_URL, q)) ?? (await search(KEYWORD_URL, q));
}
