/**
 * 사람·기관 이름을 저장 가능한 모양으로 다듬는 규칙.
 *
 * 🔴 이 규칙은 **거절이 아니라 정리** 다. 처음에는 DB CHECK 로 거절했는데,
 *    카카오 닉네임이 "선민❤️" 인 사람이 **가입조차 못 하는** 사고가 났다
 *    (handle_new_user 트리거가 profiles INSERT 에서 죽으면 auth.users 까지 롤백된다).
 *    실측: CHECK 를 건 날 이력서 작성이 1건으로 멈췄다.
 *    지금은 DB 트리거(20260804280000)가 저장 직전에 조용히 다듬는다 — "선민❤️" → "선민".
 *    다듬어도 글자가 안 남으면 원본을 그대로 둔다. 거절하느니 지저분한 게 낫다.
 *
 * 앱에서는 이관 스크립트가 이 함수를 쓴다(대량 적재 전에 미리 맞춰 넣기 위해).
 *    규칙을 고치면 DB 쪽 clean_person_name / valid_person_name 도 같이 고칠 것.
 */

// 한글·영문·숫자가 최소 하나 · 시작은 한글·영문·숫자 또는 여는괄호 · 30자 이내.
// 허용 문자: 한글 영문 숫자 공백 ( ) . , ' & · / -
const NAME_RE = /^(?=.*[가-힣a-zA-Z0-9])[가-힣a-zA-Z0-9(][가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ().,'&·/-]{0,29}$/;

export const NAME_HELP =
  "이름에는 한글·영문·숫자만 쓸 수 있습니다. 하트(♡)·별(☆)·이모지·특수기호는 넣을 수 없습니다.";

export const isValidPersonName = (v: string): boolean => NAME_RE.test(v);

/** 못 쓰는 문자를 덜어낸 값. 규칙을 못 맞추면 null — 부를 쪽이 대체값을 정한다. */
export function cleanPersonName(v: string): string | null {
  const stripped = v
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ().,'&·/-]/g, "")
    .replace(/^[^가-힣a-zA-Z0-9(]+/, "")
    .trim()
    .slice(0, 30);
  return isValidPersonName(stripped) ? stripped : null;
}
