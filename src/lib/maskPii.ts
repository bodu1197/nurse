/**
 * 🚪 자유서술에서 **실명·휴대폰·이메일**을 가린다 — 인재정보가 화면·검색엔진으로 나가기 전 관문.
 *
 * 🔴 왜 별도 파일인가: 이름·연락처는 **광고비를 낸 병원에만** 보이게 막아뒀는데(revealContacts),
 *    정작 본인이 자기소개나 담당업무에 "안녕하세요 김민수입니다 010-…" 이라고 적어두면 그 게이트가
 *    통째로 무의미해진다. 2026-08-08 부터 인재정보가 구글에 색인되므로, 여기서 새면 **검색 캐시에
 *    영구히 남는다**(되돌릴 수 없다). 이 사이트에서 가장 되돌리기 어려운 실수가 여기서 난다.
 *
 *    lib/data/talent.ts 는 `server-only` 라 테스트에서 못 불러온다. 이 관문만은 검사가 있어야 해서
 *    순수 함수로 떼어냈다 — maskPii.test.ts 가 지킨다.
 *
 * ⚠️ 규칙으로 못 잡는 것은 남는다(생년월일·집주소·국적 등 서술형). 그건 작성자에게 알리고 고치게
 *    하는 쪽이 맞다 — 여기서 잡는 것은 **패턴이 확실한** 실명·휴대폰·이메일뿐이다.
 */

/**
 * 자유서술 안의 **본인 실명**을 가린다. "김민수" → "김○○".
 * 성(첫 글자)만 남기는 것은 구 널스넷 카드 표기와 같은 방식이다.
 * 2글자 미만 이름은 건드리지 않는다 — 한 글자를 치환하면 엉뚱한 단어까지 깨진다.
 */
export function maskName(text: string | null, name: string | null): string | null {
  const n = (name ?? "").trim();
  if (!text || n.length < 2) return text;
  const hidden = n[0] + "○".repeat(n.length - 1);
  // 🔴 글자 사이에 공백을 끼워 쓰는 사람이 있다("김 민수"). 완전일치(split/join)만 하면 그건 안 걸린다.
  //    이름 글자 사이에 공백을 허용하는 정규식으로 찾는다. 정규식 특수문자는 반드시 이스케이프한다 —
  //    이름에 `.` 나 `(` 가 들어오면(외국인 등록명·별명) 정규식이 깨지거나 엉뚱한 곳을 지운다.
  const loose = new RegExp([...n].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g");
  return text.replace(loose, hidden);
}

// 🔴 g 플래그를 붙인 정규식은 lastIndex 상태를 들고 다닌다. String.replace 는 매번 0으로 되돌리므로
//    여기서는 안전하지만, 이 상수를 test()/exec() 로 재사용하면 호출마다 결과가 달라진다 — 하지 말 것.
//
// 휴대폰: 국가번호(+82)와 괄호·연속 구분자까지 받는다. 실제로 새던 표기 — `+82-10-1234-5678`,
// `010)1234-5678`, `010--1234--5678`. 앞뒤 숫자 경계((?<!\d)/(?!\d))를 둬서 긴 숫자열 한가운데를
// 전화번호로 오인하지 않게 한다(면허번호·사업자번호가 그렇게 잘린 적이 있다).
const PHONE_RE = /(?<!\d)(?:\+?82[-. ]?)?0?1[016-9][-.\s)]{0,2}\d{3,4}[-.\s)]{0,2}\d{4}(?!\d)/g;
// 이메일: 한글 도메인(hong@한국.kr)도 잡도록 유니코드 글자 클래스를 쓴다.
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;

/** 자유서술 안의 **휴대폰·이메일**을 가린다. */
export function maskContacts(text: string | null): string | null {
  if (!text) return text;
  return text.replace(PHONE_RE, "010-****-****").replace(EMAIL_RE, "***@***");
}

/**
 * 사람이 자유롭게 타이핑하는 값이 화면으로 나가는 **유일한 관문**.
 *
 * 🔴 새 자유서술 컬럼을 공개 목록·상세에 추가한다면 반드시 여기에도 태울 것.
 *    한 필드만 빠져도 게이트 전체가 뚫린다 — 실제로 담당업무(duties)·학교전공·희망급여·자격증이
 *    이 관문을 안 거치고 상세에 그대로 찍히고 있었다(2026-08-08 발견·수정).
 */
export function maskFree(text: string | null, name: string | null): string | null {
  return maskContacts(maskName(text, name));
}

/**
 * 문자열이든 문자열 배열이든 **값의 모양을 그대로 두고** 안쪽 문자열만 가린다.
 *
 * 🔴 왜 필드를 하나씩 적지 않는가: 하나씩 적으면 **컬럼이 늘어난 날 빠진다.** 실제로 그렇게 새고 있었다
 *    (담당업무·학교전공·희망급여·자격증이 마스킹 밖에 있었다 — 2026-08-08 발견).
 *    "고를 것을 고른다" 가 아니라 "다 통과시킨다" 로 뒤집으면, 새 컬럼이 저절로 덮인다.
 *
 * 🔴 구조화된 값(지역·부서·근무형태)까지 통과시켜도 안전하다 — maskContacts 는 휴대폰·이메일 **패턴**만
 *    바꾸고, maskName 은 본인 이름만 바꾼다. "서울 종로구", "중환자실" 같은 값은 어디에도 안 걸린다.
 *    반대로 이 칸들도 사람이 타이핑하는 곳이라, 저장 단계에 허용목록이 없는 칸에 "연락 010-…" 을
 *    밀어 넣으면 색인 대상 화면에 그대로 박힌다. 그 길을 여기서 함께 막는다.
 */
export function maskDeep<T>(value: T, name: string | null): T {
  if (typeof value === "string") return (maskFree(value, name) ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, name)) as T;
  // 평범한 객체(DB 행)면 값만 바꿔 같은 모양으로 되돌린다. 숫자·불리언·null 은 그대로 지나간다.
  // Date 같은 특수 객체는 건드리지 않는다 — 프로토타입이 Object 인 것만 편다.
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v, name)]),
    ) as T;
  }
  return value;
}
