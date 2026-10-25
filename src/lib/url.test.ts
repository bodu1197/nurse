// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedDetailPath, cachedDetailTarget, canonicalPath, firstParam, isCachedRoute, pageParam, PAGE_MAX, safeNext, vercelSafeUrl } from "./url.ts";
import { isBotRequest } from "./track.ts";

test("같은 키가 배열로 와도 첫 값만 — .trim() 에서 500 이 나지 않게", () => {
  assert.equal(firstParam(["서울특별시", "x"]), "서울특별시");
  assert.equal(firstParam("부산광역시"), "부산광역시");
  assert.equal(firstParam(undefined), "");
  assert.equal(firstParam([]), "");
});

test("쪽수는 1 이상의 안전한 정수만 — 소수·무한·음수·배열은 1쪽 또는 상한", () => {
  assert.equal(pageParam("3"), 3);
  assert.equal(pageParam("1.01"), 1, "소수 쪽은 offset 을 깨뜨린다");
  assert.equal(pageParam("Infinity"), 1);
  assert.equal(pageParam("1e300"), 1);
  assert.equal(pageParam("-2"), 1);
  assert.equal(pageParam("abc"), 1);
  assert.equal(pageParam(undefined), 1);
  assert.equal(pageParam(["4", "9"]), 4);
  assert.equal(pageParam(String(PAGE_MAX * 10)), PAGE_MAX);
});

test("내부 경로는 그대로 통과한다", () => {
  assert.equal(safeNext("/jobs"), "/jobs");
  assert.equal(safeNext("/jobs/abc?apply=dup"), "/jobs/abc?apply=dup");
  assert.equal(safeNext("/"), "/");
});

test("외부로 나가는 경로는 전부 막는다", () => {
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("javascript:alert(1)"), "/");
  // 백슬래시: 브라우저 URL 파서가 "/"로 바꿔 읽어 //evil.com이 된다
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext("\\\\evil.com"), "/");
  // 탭·개행: 브라우저가 지운 뒤 해석해 역시 //evil.com이 된다
  assert.equal(safeNext("/\t/evil.com"), "/");
  assert.equal(safeNext("/\n\\evil.com"), "/");
});

test("빈 값이면 대체 경로를 준다", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined, "/jobs"), "/jobs");
  assert.equal(safeNext("", "/mypage/resume?ok=1"), "/mypage/resume?ok=1");
});

test("Vercel 분석으로 나가는 주소 — 관리자·마이페이지는 안 보내고, 쿼리는 utm·ref 만, # 뒤는 지운다", () => {
  const S = "https://nursenet.co.kr";
  assert.equal(vercelSafeUrl(`${S}/admin/users?q=홍길동`), null);
  assert.equal(vercelSafeUrl(`${S}/mypage`), null);
  assert.equal(vercelSafeUrl(`${S}/mypage/jobs/ad/return?imp_uid=imp_1&merchant_uid=m_1`), null);
  assert.equal(vercelSafeUrl(`${S}/mypageX`), `${S}/mypageX`, "접두어만 같은 경로는 막지 않는다");
  assert.equal(vercelSafeUrl(`${S}/jobs?q=간호&lat=37.5&lng=127&utm_source=naver&ref=kakao`), `${S}/jobs?utm_source=naver&ref=kakao`);
  assert.equal(vercelSafeUrl(`${S}/reset-password/new#access_token=abc`), `${S}/reset-password/new`);
  assert.equal(vercelSafeUrl(`${S}/login?code=xyz`), `${S}/login`);
  assert.equal(vercelSafeUrl("/상대주소"), null, "절대 주소가 아니면 버린다");
});

test("영문·숫자를 %XX 로 쓴 경로는 풀어 쓴다 — 한글·슬래시 같은 진짜 인코딩은 그대로", () => {
  assert.equal(canonicalPath("/%6Aobs"), "/jobs", "500 이 나던 주소");
  assert.equal(canonicalPath("/%61dmin/%75sers"), "/admin/users");
  assert.equal(canonicalPath("/%74alent-cached/x"), "/talent-cached/x", "내부 전용 주소 차단을 비껴가지 못하게");
  assert.equal(canonicalPath("/%6Aobs-cached/x"), "/jobs-cached/x");
  assert.equal(canonicalPath("/jobs/%ED%95%9C"), "/jobs/%ED%95%9C", "한글은 그대로");
  assert.equal(canonicalPath("/a%2Fb%25%20c"), "/a%2Fb%25%20c", "/ % 공백은 그대로");
  assert.equal(canonicalPath("/%2d%2E%5f%7E"), "/-._~", "소문자 16진수도");
  assert.equal(canonicalPath("/jobs"), "/jobs");
});

test("풀어 쓴 결과가 외부 주소 모양(// 또는 /\\)이면 홈으로 — 오픈 리다이렉트 방지", () => {
  assert.equal(canonicalPath("//%65vil.com"), "/", "Location: //evil.com 은 브라우저가 외부 사이트로 읽는다");
  assert.equal(canonicalPath("/\\%65vil.com"), "/");
  assert.equal(canonicalPath("//%65vil.com/%6Aobs"), "/");
  assert.equal(canonicalPath("//admin"), "//admin", "풀 것이 없으면 손대지 않는다(이동 자체가 없다)");
});

test("비로그인 상세는 캐시본 주소로 — 소문자 UUID 상세만, 목록·하위 경로·다른 메뉴는 그대로", () => {
  const id = "0f8c2b6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
  assert.equal(cachedDetailPath(`/jobs/${id}`), `/jobs-cached/${id}`);
  assert.equal(cachedDetailPath(`/talent/${id}`), `/talent-cached/${id}`);
  assert.equal(cachedDetailPath(`/jobs/${id.toUpperCase()}`), null, "대문자 조합마다 캐시 키가 따로 생기지 않게");
  const notHex = `g${id.slice(1)}`, longTail = `${id}0`;
  for (const p of ["/jobs", "/jobs/", `/jobs/${id}/`, `/jobs/${id}/x`, "/jobs/not-a-uuid", `/jobs/${notHex}`, `/jobs/${longTail}`, `/care-jobs/${id}`, `/mypage/jobs/${id}`, `/jobs-cached/${id}`]) {
    assert.equal(cachedDetailPath(p), null, p);
  }
  assert.equal(isCachedRoute(`/jobs-cached/${id}`), true);
  assert.equal(isCachedRoute("/talent-cached"), true);
  assert.equal(isCachedRoute("/jobs-cachedX"), true, "접두로 막는다 — 그런 페이지는 없어 404 일 뿐이다");
  assert.equal(isCachedRoute(`/jobs/${id}`), false);
  assert.equal(isCachedRoute("/mypage/jobs-cached"), false, "맨 앞만 본다");
});

test("캐시본으로 보내는 조건 — GET·HEAD, 로그인 쿠키 없음, 쿼리 없음(봇은 쿼리 무시)", () => {
  const id = "0f8c2b6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
  const base = { method: "GET", pathname: `/jobs/${id}`, search: "", cookieNames: ["_ga"], bot: false };
  const to = `/jobs-cached/${id}`;
  assert.equal(cachedDetailTarget(base), to);
  assert.equal(cachedDetailTarget({ ...base, method: "HEAD" }), to);
  assert.equal(cachedDetailTarget({ ...base, method: "POST" }), null, "서버 액션(POST)은 동적 라우트로");
  assert.equal(cachedDetailTarget({ ...base, cookieNames: ["_ga", "sb-abcdefghijklmnop-auth-token.0"] }), null, "로그인했으면 기존 화면");
  assert.equal(cachedDetailTarget({ ...base, search: "?page=3" }), null, "사람은 보던 쪽으로 돌아가는 링크가 필요하다");
  assert.equal(cachedDetailTarget({ ...base, search: "?apply=dup" }), null, "지원 결과 안내가 캐시에 굳지 않게");
  assert.equal(cachedDetailTarget({ ...base, search: "?page=3", bot: true }), to, "봇은 쿼리를 버리고 정본 화면");
  assert.equal(cachedDetailTarget({ ...base, search: "?page=3", bot: true, cookieNames: ["sb-x-auth-token"] }), null);
  assert.equal(cachedDetailTarget({ ...base, pathname: "/jobs", bot: true }), null, "목록은 아니다");
  assert.equal(cachedDetailTarget({ ...base, method: "POST", bot: true }), null, "봇이라도 POST 는 동적 라우트로");
});

test("캐시본 판정의 봇 — 크롤러·스크립트는 봇, 브라우저가 페이지를 열면(Sec-Fetch-Dest: document) 사람", () => {
  const cubot = "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  assert.equal(isBotRequest("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", null), true);
  assert.equal(isBotRequest("Mozilla/5.0 (compatible; Daum/4.1; +https://cs.daum.net/faq/15/4118.html?faqId=28966)", null), true, "통계 기준이 놓치는 다음");
  assert.equal(isBotRequest("kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984", null), true, "통계 기준이 놓치는 카카오 미리보기");
  assert.equal(isBotRequest("python-requests/2.32.3", null), true);
  assert.equal(isBotRequest("", null), true, "UA 가 없으면 사람이 아니다");
  assert.equal(isBotRequest(cubot, "document"), false, "기종 이름에 bot 이 든 사람 — 보던 쪽을 잃지 않게");
  assert.equal(isBotRequest(cubot, null), true, "문서 요청 표시가 없으면 UA 로만 본다");
  assert.equal(isBotRequest("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "document"), false, "문서 요청 표시가 있으면 사람 쪽(동적)으로 — 손해는 비용뿐");
  assert.equal(isBotRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "document"), false);
  assert.equal(isBotRequest("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", null), false);
});
