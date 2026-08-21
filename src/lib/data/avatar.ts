import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/data/user";

/**
 * 🗂 인재 사진 — 보관·서명 URL 발급을 여기 한 곳에서 한다.
 *
 * 버킷은 **비공개**다(20260728120000_avatars_bucket_private.sql). 처음에 공개 버킷 + `{profile_id}.jpg`
 * 로 만들었다가, 목록 HTML 에 실리는 profile_id 로 경로를 조합해 얼굴 사진 전량을 긁어갈 수 있는
 * 구멍이 났다. 지금은 (1) 키가 난수 (2) 버킷 비공개 (3) 열람 자격을 통과한 지점에서만 단기 서명.
 *
 * 스토리지에는 RLS 정책을 두지 않았다 — 이 버킷은 **서버(service_role)만** 읽고 쓴다.
 * 그래서 업로드도 사용자 클라이언트가 아니라 서버 액션에서 admin 으로 한다.
 */
export const AVATAR_BUCKET = "avatars";

/** 서명 URL 수명(초). 한 화면을 보는 동안만 유효하면 충분하고, 새어나가도 곧 죽는다. */
export const AVATAR_URL_TTL = 60 * 10;

// 크기·형식 제약은 클라이언트(PhotoPicker)도 읽어야 해서 server-only 가 아닌 곳에 둔다.
export { AVATAR_MAX_BYTES, AVATAR_MIME, AVATAR_ACCEPT, AVATAR_MAX_EDGE } from "@/lib/avatarLimits";

/**
 * 외부 프로필 주소를 https 로 올린다.
 *
 * 카카오·네이버가 기본 프로필 사진을 `http://img1.kakaocdn.net/…` 처럼 http 로 주고, 그게 그대로
 * 저장돼 있다. https 페이지가 http 이미지를 부르면 Mixed Content — 지금은 크롬이 자동으로
 * https 로 올려주지만 콘솔에 경고가 쌓이고, 그 자동 업그레이드가 사라지면 사진이 안 뜬다.
 * 두 CDN 모두 https 를 지원하므로 내보내는 지점에서 올려버린다(이미 저장된 행까지 같이 해결된다).
 */
const toHttps = (u: string): string => (u.startsWith("http://") ? "https://" + u.slice(7) : u);

/**
 * 저장된 avatar_url 하나를 화면에 쓸 수 있는 URL 로 바꾼다.
 *
 * 값이 `http…` 면 우리 버킷이 아니다(네이버 가입 때 들어온 외부 프로필) → 그대로 쓴다.
 * 그 밖에는 오브젝트 경로라 서명이 필요하다. 없거나 서명 실패면 null(사진 자리를 비운다).
 */
export async function signAvatar(avatarUrl: string | null | undefined): Promise<string | null> {
  const v = (avatarUrl ?? "").trim();
  if (!v) return null;
  if (v.startsWith("http")) return toHttps(v);
  const { data, error } = await createAdminClient()
    .storage.from(AVATAR_BUCKET).createSignedUrl(v, AVATAR_URL_TTL);
  if (error) {
    console.error("signAvatar failed:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * 특정 회원의 사진 서명 URL.
 *
 * 🔴 자격 검사를 하지 않는다 — **호출부가 이미 통과시킨 뒤에만** 부를 것.
 *    지금 쓰는 곳은 지원자 이력서 화면 하나뿐이다. 거기서는 RLS(resumes_select_for_hospital)가
 *    "내 공고에 지원한 사람"으로 이미 좁혔고, 같은 화면이 이름·연락처를 이미 보여준다 —
 *    스스로 지원한 사람이라 사진만 더 가릴 이유가 없다.
 *    (모르는 사람을 훑는 인재 검색은 다르다. 거기는 광고 중인 병원만 revealContacts 로 받는다.)
 */
export async function signAvatarOf(profileId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("profiles").select("avatar_url").eq("id", profileId).maybeSingle();
  return signAvatar(data?.avatar_url);
}

/**
 * 저장된 avatar_url 여러 개를 **한 번에** 화면용 URL 로 바꾼다.
 * 한 장씩 signAvatar 를 돌리면 왕복이 행 수만큼 늘어난다(25행 = 25회).
 *
 * 반환 Map 의 키는 **넘긴 값 그대로**(오브젝트 경로 또는 http URL)다.
 * 목록 화면(revealContacts·signAvatarsOf)이 전부 이걸 쓴다 — 전에는 같은 루프가 두 벌이라
 * 수명(AVATAR_URL_TTL)을 한쪽만 고치면 조용히 어긋났다.
 */
export async function signAvatarPaths(
  raws: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths = new Set<string>();
  for (const r of raws) {
    const v = (r ?? "").trim();
    if (!v) continue;
    // `http…` 는 우리 버킷이 아니다(네이버 가입 때 들어온 외부 프로필) → 서명 없이 그대로 쓴다.
    if (v.startsWith("http")) out.set(v, toHttps(v));
    else paths.add(v);
  }
  if (paths.size === 0) return out;
  const { data, error } = await createAdminClient()
    .storage.from(AVATAR_BUCKET).createSignedUrls([...paths], AVATAR_URL_TTL);
  if (error) console.error("createSignedUrls failed:", error.message);
  for (const u of data ?? []) if (u.path && u.signedUrl) out.set(u.path, u.signedUrl);
  return out;
}

/**
 * 회원 여럿의 사진을 **한 번에**. 목록 화면(받은 지원자·인재 검색)용.
 *
 * 🔴 signAvatarOf 와 같은 계약: **자격 검사를 하지 않는다** — 호출부가 이미 통과시킨 뒤에만 부를 것.
 *    지금 부르는 곳은 둘 다 게이트 뒤다: 받은 지원자(내 공고에 지원한 사람), 인재 검색(광고 병원).
 *
 * 사진이 없는 회원은 Map 에 아예 넣지 않는다 — 호출부가 `?? null` 로 받아 자리를 비우면 된다.
 */
export async function signAvatarsOf(profileIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(profileIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const { data, error } = await createAdminClient()
    .from("profiles").select("id,avatar_url").in("id", ids);
  if (error) {
    console.error("signAvatarsOf failed:", error.message);
    return out;
  }
  const rows = data ?? [];
  const signed = await signAvatarPaths(rows.map((r) => r.avatar_url));
  for (const r of rows) {
    const url = signed.get((r.avatar_url ?? "").trim());
    if (url) out.set(r.id, url);
  }
  return out;
}

/** 내 사진(있으면) — 본인은 언제나 자기 사진을 본다. 게이트는 '남의 사진'에만 건다. */
export async function getMyAvatarUrl(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  return signAvatar(data?.avatar_url);
}
