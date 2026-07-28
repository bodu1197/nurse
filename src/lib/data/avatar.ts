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
 * 저장된 avatar_url 하나를 화면에 쓸 수 있는 URL 로 바꾼다.
 *
 * 값이 `http…` 면 우리 버킷이 아니다(네이버 가입 때 들어온 외부 프로필) → 그대로 쓴다.
 * 그 밖에는 오브젝트 경로라 서명이 필요하다. 없거나 서명 실패면 null(사진 자리를 비운다).
 */
export async function signAvatar(avatarUrl: string | null | undefined): Promise<string | null> {
  const v = (avatarUrl ?? "").trim();
  if (!v) return null;
  if (v.startsWith("http")) return v;
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

/** 내 사진(있으면) — 본인은 언제나 자기 사진을 본다. 게이트는 '남의 사진'에만 건다. */
export async function getMyAvatarUrl(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  return signAvatar(data?.avatar_url);
}
