---
description: 커밋 전 의무 검증 — 8인 전문 검증가 병렬 다각도 검사 (보안·SEO·성능·UX·유지보수·품질·아키텍처·타입)
allowed-tools: Bash, Read, Grep, Glob, Agent
---

# /review8 — 8인 병렬 다각도 코드 검증 (널스넷)

**목적**: 커밋 전 의무 검증. 8개 분야가 서로 독립적으로 병렬 검증.
**스택**: Next.js 16 App Router · React 19 · Supabase(@supabase/ssr, RLS) · Tailwind v4 · TypeScript strict · 한국어 전용 UI.
**게이트**: PASS 후 `.claude/.review8-hash` 에 현재 상태 해시를 기록해야 `git commit` 허용됨(`review8-gate.mjs`).

---

## Step 1. 변경 사항 스캔

```bash
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "git 저장소 아님"; exit 1; }
git diff HEAD --stat 2>&1
echo "---"
git status --porcelain 2>&1
echo "---"
git diff HEAD 2>&1 | head -2000
```

변경 사항이 없으면 "검증 대상 없음 — /review8 종료" 출력 후 중단.

---

## Step 2. 8인 병렬 Agent 검증

**반드시 한 메시지에서 Agent 도구를 8회 병렬 호출.** 각 검증가는 독립적으로 `git diff HEAD` 를 읽고 본인 전문 영역만 검증. `subagent_type: Explore`(읽기 전용), 각 프롬프트는 아래와 동일하게 전달.

### 검증가 1 — 보안 엔지니어 (Security)

> 당신은 시니어 보안 엔지니어입니다. `git diff HEAD` 를 읽고 **보안 관점에서만** 검증.
>
> - OWASP (SQL/XSS/CSRF/SSRF, broken auth, 민감정보 노출)
> - 인증/권한 누락 (Route Handler, Server Action, Supabase RLS)
> - `SUPABASE_SERVICE_ROLE_KEY`/`createAdminClient` 사용 정당성 — 서버 전용(`import "server-only"`)인지, RLS 우회가 정당한 곳(웹훅·OAuth 콜백·크론)에서만인지, IDOR
> - OAuth/세션: 네이버 커스텀 플로우의 `state` 검증, 토큰 교환 서버 전용, 콜백 위변조
> - 시크릿/키 하드코딩, 클라이언트 번들 노출(`NEXT_PUBLIC_*` 만 노출 허용)
> - 사용자 입력 검증·정제 누락 (UUID, email, 검색 파라미터)
>
> 각 문제 `file:line` + 한 줄 수정. 문제 없으면 첫 줄에 `CLEAN`. 200단어 이내.

### 검증가 2 — SEO 전문가 (SEO)

> 당신은 기술 SEO 전문가입니다. `git diff HEAD` 를 SEO 관점에서만 검증.
>
> - metadata 누락 (title, description, canonical, OG, robots)
> - 동적 라우트 `generateMetadata()` 누락
> - sitemap/robots 등록 누락
> - 마이페이지/관리자/지원내역 등 비공개 페이지의 `robots: noindex` 누락 (PII)
> - JSON-LD 구조화 데이터 (JobPosting, Organization 등) 누락
> - 이미지 alt 누락(LCP 우선), `next/image` 미사용
> - i18n 잔재 (한국어 전용)
>
> 각 문제 `file:line` + 수정. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 3 — 웹 성능 전문가 (Performance)

> 당신은 웹 성능 전문가(Core Web Vitals, Next.js)입니다. `git diff HEAD` 를 성능 관점에서만 검증.
>
> - N+1 쿼리 (Supabase `.from()` 루프), 과다 select(`select('*')`)
> - 캐싱 전략 (`revalidate`, `revalidateTag`, React `cache()`) 누락
> - keyset/cursor 대신 offset 페이지네이션
> - `next/image` width/height/priority 누락, LCP/CLS 영향
> - 클라이언트 번들에 큰 데이터/무거운 라이브러리, `dynamic()` 미사용
> - React 재렌더(key 누락, 불필요한 객체 재생성), DB 인덱스 누락
>
> 각 문제 `file:line`. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 4 — UX/모바일 (UX)

> 당신은 모바일 우선 UX 디자이너입니다. `git diff HEAD` 를 UX 관점에서만 검증.
>
> - 필수 입력 표시(*) 명확성, 폼 검증 피드백(`aria-invalid`)
> - 터치 타겟 44x44 미달 (아이콘 버튼, 닫기 X)
> - 빈 상태(empty state)·로딩(`loading.tsx`)·에러 일관성
> - 모달/시트 닫기·뒤로가기·포커스 트랩 일관성
> - a11y: `aria-label`, `aria-expanded/current`, 키보드 네비게이션
> - 한국어 UI 톤 일관성, 과장·가벼운 카피 지양(채용 플랫폼 톤)
>
> 각 문제 `file:line` + 개선안. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 5 — 유지보수성 (Maintainability)

> 당신은 유지보수성 전문가입니다. `git diff HEAD` 를 장기 유지보수 관점에서만 검증.
>
> - 응집도/결합도, DRY 위반(중복 컴포넌트·로직)
> - 명명 일관성(kebab 폴더 / PascalCase 컴포넌트 / use-kebab 훅)
> - 매직 넘버·하드코딩(직종·지역·급여 등은 상수/마스터로)
> - 관심사 분리 (Component / Hook / Server Action / data 레이어)
> - 파일/함수 비대(50+ 라인 함수 분리 후보), 테스트 가능성
>
> 각 문제 `file:line` + 개선안. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 6 — 코드 품질 & 컨벤션 집행 (Quality)

> 당신은 프로젝트 규칙 집행자입니다. `CLAUDE.md`/`docs/conventions.md` 가 있으면 먼저 읽고, `git diff HEAD` 에서 규칙 준수 검증.
>
> - 타입: `any` 금지, `as` 단언 오용(`as const` 만 허용), non-null `!` 금지, `@ts-ignore`/`@ts-expect-error` 금지
> - 스타일: 임의 색상 하드코딩 지양(`bg-[#hex]`) — 단 카카오/네이버 등 브랜드 색은 예외. 디자인 토큰/Tailwind 유틸 우선
> - 외국어 UI 텍스트(한국어 전용), 반응형 클래스(`sm:`/`md:`) 누락
> - a11y: 아이콘 버튼 `aria-label`, hover 에 대응하는 `focus-visible:`
> - 편법: 사유 없는 `eslint-disable`, `.skip()`, `tsconfig exclude`, 빈 `catch {}`
> - 응답/에러 처리 일관성
>
> 각 문제 `file:line`. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 7 — Next.js 아키텍트 (Architecture)

> 당신은 Next.js 16 App Router 시니어 아키텍트입니다. `git diff HEAD` 를 아키텍처 관점에서만 검증.
>
> - Server vs Client Component 분리(Server-First). 클라이언트에서 `useEffect + fetch`/`supabase.from().select()` 초기 페칭 금지
> - mutation 은 Server Action, 외부 연동(OAuth 콜백·웹훅·크론)은 Route Handler
> - `@supabase/ssr` 패턴(server/client/middleware 분리), 미들웨어 세션 갱신
> - 다중 테이블 쓰기 시 트랜잭션/롤백 대응(Supabase 트랜잭션 제약)
> - 파일 간 결합도·순환 의존, 에러 처리 일관성
>
> 각 문제 `file:line` + 수정 방향. 문제 없으면 `CLEAN`. 200단어 이내.

### 검증가 8 — TypeScript strict (Type Safety)

> 당신은 TypeScript strict mode 전문가입니다. `git diff HEAD` 를 타입 안전성 관점에서만 검증.
>
> - `any`(정당 사유 없이), `as`/`as unknown as` 오용, non-null `!`
> - null/undefined 처리 누락, `Readonly<Props>` 누락
> - DB 타입(`Database["public"]["Tables"]...`) 일관성, Supabase 조인 결과 타입
> - `@ts-ignore`/`@ts-expect-error`, `catch (e)` 의 `unknown` 처리
>
> 각 문제 `file:line`. 문제 없으면 `CLEAN`. 200단어 이내.

---

## Step 3. 종합 판정

```
═══ 8인 병렬 검증 결과 ═══
[1 보안] [2 SEO] [3 성능] [4 UX] [5 유지보수] [6 품질] [7 아키텍처] [8 타입]  각 CLEAN / N건

CRITICAL (반드시 수정):
  - file:line — 요약
WARNING (강력 권고): ...
INFO (개선 여지): ...

결정: PASS | FAIL
```

**PASS 기준**: CRITICAL 0건 · 보안/품질은 CLEAN 또는 WARNING 이하 · 8명 전원 출력 수신.
**FAIL 이면**: CRITICAL/WARNING 을 실제 수정(Edit) → **반드시 `/review8` 재실행** → 건너뛰고 커밋 금지.

---

## Step 4. 통과 표시 (PASS 한정)

```bash
node .claude/hooks/review8-mark.mjs
```
현재 working tree 해시를 `.claude/.review8-hash` 에 기록 → `git commit` 게이트가 열림.

---

## 프로젝트 예외 (알려진 비결함 — 오탐 금지)

아래는 의도된 설계다. **CRITICAL/WARNING 으로 올리지 말 것**(이미 검증됨):

- **네이버 OAuth 토큰 요청의 `state` 는 필수** — 네이버 공식 사양(비표준, RFC6749와 다름). 제거하면 로그인 깨짐. RFC 근거로 제거 권고 금지.
- **`middleware.ts` 없음, `proxy.ts` 사용** — Next 16에서 middleware→proxy 이름변경. `proxy.ts`/`export function proxy` 정상.
- **준비중(스텁) 페이지의 `robots: { index:false }`** — 빈 페이지 색인 방지 의도. "메타데이터 누락"으로 보지 말 것.
- **`server.ts` 의 `setAll` 빈 catch** — @supabase/ssr 공식 패턴(proxy가 매 요청 세션 갱신). 무음 실패 아님.
- **카카오/네이버 버튼의 `bg-[#hex]`** — 브랜드 공식색(예외 허용).
- **카카오 Supabase 시크릿 없음** — 레거시 카카오 앱과 동일 구성(의도).
- **og:image 는 `opengraph-image.tsx`(next/og)로 자동 생성** — 별도 정적 파일 불필요.

> 외부 API/라이브러리 사양을 근거로 CRITICAL 판정하기 전, **공식문서/레거시 코드로 실제 확인**할 것. 일반 표준과 다른 비표준(특히 국내 SNS)일 수 있다. 확인 못 하면 CRITICAL 아닌 `UNVERIFIED`.

## 중요 규칙
- **8명 모두 Explore subagent 로 병렬 호출**(직렬 금지).
- **8/8 결과 필수.** 어느 한 분야라도 결과가 없거나 비면 그 분야는 `UNVERIFIED` 로 표기하고 **해당 분야만 재호출**한다. 8명 전원 결과를 받기 전에는 **PASS 판정 금지**(부분 결과로 PASS 절대 불가). 재호출 후에도 누락이면 최종 `FAIL`.
- **CLEAN 은 증거 기반.** 확인 못 했으면 `UNVERIFIED`(= PASS 아님).
- **검증 대상은 이 프로젝트(nurse-app)뿐.** 상위/형제 디렉터리(옛 PHP 레거시 등) 스캔 금지 — `git diff HEAD` 또는 프로젝트 내부 경로만.
- **자동 수정 금지** — /review8 은 검증만. 수정은 보고 후.
- **게이트 우회 금지** — FAIL 상태 `--no-verify`/마커 수동 조작 금지.
