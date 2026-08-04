/**
 * 사람·기관 이름 규칙 — DB CHECK(profiles_display_name_shape · resumes_name_shape)와 **같은 규칙**이다.
 *
 * 여기서 한 번 더 검사하는 이유는 방어가 아니라 **안내** 다. 앱이 안 막으면 DB 가 막는데,
 * 그때 사용자에게 보이는 것은 "new row violates check constraint" 라는 영어 오류뿐이다.
 *
 * 🔴 규칙을 고치면 DB CHECK 도 같이 고쳐야 한다(마이그레이션 20260804210000).
 *    한쪽만 바꾸면 화면은 통과시키고 저장에서 죽는다.
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
