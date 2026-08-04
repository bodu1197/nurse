# 관리자 페이지 설계 (2026-08-04)

`docs/admin-console-2026-07-30.md` 는 **무엇이 없는지**를 조사한 문서다.
이 문서는 그 다음 단계 — **무엇을 어떻게 만들 것인지**를 정한다.

---

## 0. 오늘의 실측

DB 직접 조회(2026-08-04). 설계의 크기는 이 숫자가 정한다.

| 대상 | 건수 | 관리자가 지금 손댈 수 있나 |
|---|---:|---|
| 회원 | 16,317 (간호사 13,650 · 병원 2,662 · 관리자 5) | ❌ 한 명도 조회 불가 |
| 이력서 | 7,270 (공개 6,970 · 비공개 300) | ❌ SQL 로만 |
| 게시글 · 댓글 | 6,528 (2,856 + 3,672) | ❌ 남의 글 못 지움 |
| 병원 명부 | 80,104 (소유자 연결 2) | ❌ 소유권 이전 코드 없음 |
| 공고 | 2,015 (워크넷 1,970 · 파트너 43 · 직접 2) | ❌ 남의 공고 못 건드림 |
| 리뷰 | 6 (신고 0) | ❌ 숨김 코드 0건 |
| 지원 | 1 | — |
| 결제 주문 | **0** | ❌ 조회 화면 없음 |
| 광고 게재 중 | **0** | — |

🔴 결제 주문 0건이 "결제가 꺼져 있다"는 뜻이 아니다. `.env.local` 에 포트원 키 4개가 다 있고
`iamportReady()` 는 그중 셋만 검사하므로 **결제 버튼은 지금 동작한다.** 아직 안 팔렸을 뿐이다.

**읽는 법이 중요하다.** 결제·지원·리뷰는 아직 0에 가깝고, **회원·이력서·게시글·명부는 이미 크다**
(레거시 이관분). 즉 *"오픈하면 급해지는 것"*(결제)과 *"이미 급한 것"*(모더레이션·회원)이 다르다.
7월 30일 문서는 결제를 1순위로 뒀지만, 결제는 아직 한 건도 없고 게시글은 6,528건이 이미 살아 있다.

---

## 1. 설계 결정

7월 30일 문서가 "오너가 정해야 한다"고 남긴 것들에 대한 답이다.

### 결정 1 — 권한은 **RLS 로** 준다. service_role 을 쓰지 않는다

문서가 남긴 두 갈래 중 (a)를 고른다.

```
(a) RLS 에 is_admin() 추가  → 관리자도 일반 클라이언트로 접속. DB 가 한 번 더 검사
(b) 관리자 화면만 service_role → 빠르지만 게이트 한 줄 뚫리면 16,317명 개인정보 전부
```

**(a)를 고르는 이유**는 `src/lib/supabase/admin.ts` 주석이 직접 써놨다 —
*"사용자가 넘긴 id 를 그대로 조회하는 데 쓰면 안 된다"*. 그런데 관리자 화면은 본질이 그거다
(운영자가 입력한 회원 id 로 조회). service_role 로 만들면 그 규칙을 **화면 전체가 상시 위반**하게 되고,
`requireAdmin()` 한 줄이 방어선의 전부가 된다.

RLS 로 하면 방어선이 2겹이다. `is_admin()` 함수는 **이미 있다**(`20260724200000`).
커뮤니티 3개 테이블에 이미 같은 모양으로 걸려 있어서, 나머지 테이블도 같은 문장을 복사하면 된다.

예외 2개만 service_role 유지:
- **계정 삭제** — `auth.users` 는 RLS 로 못 지운다 (기존 `deleteAccount` 도 그렇게 한다)
- **결제·크론** — 이미 service_role 이고 사용자 요청이 아니다

### 결정 2 — **삭제 버튼을 만들지 않는다. 숨김만 만든다**

관리자가 남의 데이터를 지울 수 있게 되는 순간, 오해로 지운 리뷰 6건을 되돌릴 방법이 없다.
숨김은 되돌릴 수 있고, 감사 로그에 `before` 스냅샷을 뜰 필요도 없어진다.

숨김 수단은 **대부분 이미 DB 에 있다**:

| 대상 | 숨김 수단 | 상태 |
|---|---|---|
| 리뷰 | `reviews.is_hidden` | ✅ 컬럼 있음, 쓰는 코드 0건 |
| 공고 | `jobs.status = 'hidden'` | ✅ CHECK 에 있음, 쓰는 코드 0건 |
| 이력서 | `resumes.is_public = false` | ✅ 있음 |
| 게시글 · 댓글 | 없음 | 🆕 `is_hidden` 컬럼 추가 필요 |

즉 신규 컬럼은 게시판 2개뿐이다.

계정만 예외 — 실제 탈퇴 요청(개인정보 삭제, 법정 의무)은 되돌릴 수 없는 게 정상이다.
이건 기존 `deleteAccount` 를 관리자가 대신 부르는 형태로 만든다.

### 결정 3 — 감사 로그는 뼈대와 **같이** 만든다

관리자 5명이 서로를 확인할 방법이 없다. 화면을 열기 전에 테이블이 있어야 한다.

```sql
create table admin_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references profiles(id),
  action       text not null,   -- 'review.hide' | 'user.suspend' | 'order.cancel' ...
  target_table text not null,
  target_id    text not null,
  reason       text not null,   -- 앱에서 입력 강제. 사유 없이 남의 데이터를 못 건드린다
  created_at   timestamptz not null default now()
);
-- RLS: select/insert = is_admin(). update·delete 정책 없음 = 아무도 못 고친다
```

`reason` 을 NOT NULL 로 둔 게 핵심이다. 이유를 안 쓰면 DB 가 거절한다.

### 결정 4 — 관리자 임명은 화면에서 하지 않는다

`role='admin'` 부여 코드는 전 소스에 없고, **없는 채로 둔다.** SQL 로만 임명한다.
화면에 만들면 관리자 계정 하나가 뚫렸을 때 공격자가 스스로 관리자를 늘릴 수 있다.
5명이 더 늘 일도 없다.

---

## 2. 화면 설계

### 뼈대 (0단계) — 나머지를 얹을 바닥

```
src/app/admin/layout.tsx      게이트 + 좌측 탭
src/app/admin/page.tsx        대시보드
src/lib/data/admin.ts         requireAdmin() · logAdmin()
supabase/migrations/…_admin_actions.sql
```

```ts
// src/lib/data/admin.ts
export async function requireAdmin() {
  const p = await getMyProfile();
  if (!p?.isAdmin) notFound();   // 403 아니라 404 — /admin 이 있다는 것조차 안 알린다
  return p;
}
```

**`isAdmin` 이지 `role` 이 아니다.** 보기 전환(`setViewAs`) 쿠키가 `role` 을 바꿔 보이게 하므로,
`role === 'admin'` 으로 검사하면 관리자가 병원 화면을 보는 동안 자기 관리자 페이지에서 튕긴다.
같은 함정을 `src/lib/data/talent.ts:151` 이 이미 주석으로 경고하고 있다.

**게이트는 layout 과 서버 액션 양쪽에 건다.** layout 은 서버 액션 호출 경로를 지나지 않는다 —
액션에서 다시 부르지 않으면 로그인만 한 사람이 액션을 직접 호출할 수 있다.

**대시보드**는 숫자 카드 8장 + 크론 3줄. 각 카드는 해당 목록으로 가는 링크다.
(회원 · 공고 · 이력서 · 게시글 · 리뷰 · 숨김 대기 · 주문 · 광고 중)

### 1단계 — 모더레이션 (데이터가 이미 6,528건 있는데 손을 못 댐)

```
src/app/admin/reviews/page.tsx    리뷰 6건 — 병원·평점·작성자·숨김 상태
src/app/admin/board/page.tsx      게시글 2,856 · 댓글 3,672 — 검색 + 숨김
src/app/admin/actions.ts          hideReview · hideBoardPost · hideBoardComment
supabase/migrations/…_admin_moderation.sql
```

마이그레이션 내용:
1. `board_posts.is_hidden` · `board_comments.is_hidden` 추가 (default false)
2. 읽기 정책에 `and (not is_hidden or is_admin())` — 숨긴 글이 목록에서 빠진다
3. update 정책에 `or is_admin()` — 지금은 `author_id = auth.uid()` 라 관리자도 남의 글을 못 고친다

**신고 접수 테이블은 만들지 않는다.** 신고 0건이고 리뷰가 6건이다.
`/contact` 의 메일(`[널스넷] 게시물 신고`)로 받아서 목록에서 찾아 숨기면 된다.
신고가 실제로 쌓이기 시작하면 그때 테이블을 만든다.

### 2단계 — 회원 (16,317명, 법정 의무 포함)

```
src/app/admin/users/page.tsx        검색: 이메일 · 아이디 · 이름 · 전화 · 역할 · 가입일
src/app/admin/users/[id]/page.tsx   상세: 프로필 · 이력서 · 공고 · 지원 · 주문 · 제재 이력
```

동작 4개:
- **이력서 강제 비공개** — 지난번 298건을 SQL 로 했다. 다음에도 SQL 이면 화면을 만든 의미가 없다
- **회원 정지** — 🆕 `profiles.suspended_until` · `suspended_reason` + 로그인 후 게이트
- **대리 탈퇴** — 개인정보 삭제 요청 대응. 기존 `deleteAccount` 재사용
- **역할 변경** — nurse ↔ hospital 만. admin 부여는 없다(결정 4)

RLS: `profiles` · `resumes` 의 select·update 정책에 `or is_admin()`.

### 3단계 — 병원 (명부 80,104, 화면이 이미 약속한 것)

```
src/app/admin/hospitals/page.tsx   명부 검색(이름 trgm 인덱스 이미 있음)
```

`/mypage/verify` 가 손님에게 **"확인 후 연결을 옮겨드립니다"** 라고 이미 써놨는데 옮기는 코드가 없다.
- 병원 ↔ 계정 **연결 강제 이전 / 해제** (공고를 유지한 채 — `unlinkHospital` 은 공고가 있으면 막는다)
- 사업자 인증 수동 부여 · 취소 (국세청 API 장애 시)
- 명부 정보 정정 (심평원 데이터 오류)

지금 소유자 연결이 2건이라 분쟁 확률은 낮다. 화면의 약속을 지키기 위한 것이다.

### 4단계 — 결제 (지금 0건. 키를 넣는 순간 시작된다)

```
src/app/admin/orders/page.tsx      주문 검색 · 상태 전환 · 매출 집계
```

여기는 **화면만 만들면 안 된다. 결제 코드에 구멍이 3개 있다** (7월 30일 문서 검증 완료):

| 구멍 | 지금 | 고칠 것 |
|---|---|---|
| 결제창을 손님이 닫음 | 서버에 안 알림 → `PREPARE` 영구 잔존 (`AdPurchase.tsx`) | 결제 미진행을 서버에 알려 `CANCELED` 기록 |
| 결제액 ≠ 주문액 | 상태를 **안 바꿈**. 돈이 나갔어도 아무도 모름 (`actions.ts:1030`) | `FAILED` + `imp_uid` + 사유 기록 |
| 포트원 콘솔에서 취소 | 웹훅이 `ignored` → 우리 쪽에 **아무 흔적도 없음** | 취소 사실을 `note` 에 기록. **광고는 건드리지 않는다** |

> 🔴 **광고 취소·환불 기능은 만들지 않는다** (오너 확정 2026-08-04).
> 광고를 올리고 10분 만에 사람을 구한 병원이 변심해 취소를 걸면 감당이 안 된다.
> 그래서 취소 통보가 와도 **광고를 자동으로 내리지 않는다** — 노출은 받고 돈은 안 내는 길이 열리기 때문이다.
> 약관 제9조(환불 없음)가 근거이고, 취소 통보는 자동 처리 대상이 아니라 사람이 대응할 사건으로 남긴다.
> `CANCELED` 상태는 **결제가 애초에 일어나지 않은 주문**(결제창을 닫음)에만 쓴다.

`ad_orders.status` 는 CHECK 에 `CANCELED` 가 **이미 있는데 쓰는 코드가 0건**이다.
실패 사유를 담을 곳이 없으니 `ad_orders.note text` 컬럼 1개를 더한다
(상태 값을 새로 늘리면 화면·필터·집계를 전부 손봐야 한다 — 컬럼 하나가 싸다).

화면 동작:
- 주문 검색(병원 · 기간 · 상태 · 금액), 상태 수동 전환
- `imp_uid` 로 포트원 실거래 조회해서 대조
- **남의 병원 공고에 광고 수동 부여 · 연장** — 지금 `activateAdFree` 는 자기 공고만
  (회수는 사고 대응용으로만. 손님 요청으로 내리는 경로는 만들지 않는다)
- 매출 집계 (`tier='admin_test'` = 0원 제외 규약 이미 있음)

### 5단계 — 콘텐츠 (배포 없이 공지를 올리기)

공지 · FAQ · 이벤트가 `src/lib/customerContent.ts` 안의 TypeScript 배열이다.
문구 한 줄에 재배포가 필요하다.

```sql
create table site_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('notice','faq','event')),
  title text not null, body text not null,
  published_at timestamptz, sort int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
```

테이블 하나로 3종을 다 받는다 — 구조가 같은데 테이블을 3개 만들면 화면도 3벌이 된다.
`/notice` · `/faq` · `/event` 를 이 테이블에서 읽게 바꾸고, `/admin/content` 에서 편집한다.

**광고 요금표(`src/lib/adPlans.ts`)는 건드리지 않는다** — 아래 미결 사항 참조.

### 6단계 — 관측 (크론 3개가 실패해도 조용하다)

```sql
create table cron_runs (
  id bigserial primary key, job text not null, ok boolean not null,
  processed int, error text, ran_at timestamptz not null default now()
);
```

크론 3개 끝에 기록 1줄씩 + `/admin/ops` 에서 마지막 실행·수동 재실행.
`guard-avatars-bucket` 은 **증명사진 버킷이 공개로 열려도 막지 못한 채 조용한** 상태라
(라우트 주석이 스스로 인정) 여기가 실제로는 보안 문제다.

---

## 3. DB 변경 총목록

| # | 변경 | 단계 |
|---|---|---|
| 1 | `admin_actions` 테이블 신설 | 0 |
| 2 | `board_posts.is_hidden` · `board_comments.is_hidden` 추가 | 1 |
| 3 | 커뮤니티 3테이블 read/update 정책에 `is_admin()` | 1 |
| 4 | `profiles.suspended_until` · `suspended_reason` 추가 | 2 |
| 5 | `profiles` · `resumes` 정책에 `is_admin()` | 2 |
| 6 | `hospitals` · `jobs` 정책에 `is_admin()` | 2·3 |
| 7 | `ad_orders.note` 추가 | 4 |
| 8 | `site_posts` 테이블 신설 + 기존 상수 이관 | 5 |
| 9 | `cron_runs` 테이블 신설 | 6 |

기존 데이터를 지우거나 옮기는 마이그레이션은 8번뿐이고, 그것도 **추가**다(원본 파일은 남긴다).

---

## 4. 만들지 않는 것

| 안 만드는 것 | 이유 |
|---|---|
| 세분화 권한(RBAC) | 관리자 5명, 전원 오너 측. 역할이 하나면 권한 표는 낭비다 |
| 삭제 버튼 | 숨김이면 충분하고 되돌릴 수 있다 (결정 2) |
| 신고 접수 테이블 · 대기열 | 신고 0건. 메일로 받아 목록에서 처리. 쌓이면 그때 |
| 관리자 임명 화면 | 계정 하나가 뚫리면 관리자가 증식한다 (결정 4) |
| 2단계 인증 | Supabase Auth MFA 를 나중에 켠다. 지금은 사유 입력 강제로 대신 |
| 실패 알림 메일 | SMTP 미설정 상태 — 내장 메일은 시간당 2통이라 알림에 못 쓴다 |
| 광고 요금 편집 화면 | 정본 미결 (아래) |
| 통계 · 추이 그래프 | 대시보드 숫자 8개로 시작. 추이가 실제로 필요해지면 그때 |

---

## 5. 오너가 정해야 하는 것 3가지

1. **광고 요금의 정본이 어느 쪽인가**
   `adPlans.ts`(레거시 등급제, 41,400~528,000원, 문의 방식)와 `ads.ts`(셀프 결제, 1주 무료 + 주당 77,000원)가
   **동시에 살아 있고 값이 다르다.** 손님이 `/ads` 에서 본 가격과 결제 화면 가격이 다르다.
   이걸 정하기 전에는 요금 편집 화면을 만들 수 없다.

2. **회원 정지를 만들 것인가**
   16,317명 중 문제 회원이 아직 없다. 정지 기능은 `profiles` 컬럼 2개 + 로그인 게이트 + 화면이다.
   "탈퇴 처리"만으로 충분하면 정지는 빼는 게 싸다.

3. **어느 단계까지 지금 만드는가**
   0단계(뼈대)는 무조건 먼저다. 그 다음 권하는 순서는 **결제 코드 수정 → 모더레이션 → 나머지**다.

   🔴 `.env.local` 에 포트원 키 4개가 **전부 채워져 있다.** `iamportReady()` 는 그 세 개만 보므로
   **결제 버튼은 이미 살아 있다.** 주문 0건은 "꺼져 있다"가 아니라 "아직 안 팔렸다"이다.
   첫 결제가 들어오는 순간 위 표의 구멍 3개가 실제 사고가 된다.

   그런데 그 구멍 중 2개(금액 불일치 기록 · 취소 웹훅 처리)는 **화면 없이 코드 수정만으로 막힌다.**
   4단계 전체(주문 화면)보다 훨씬 싸고 더 급하다 — 화면은 사고를 *고치는* 것이고,
   코드 수정은 사고가 *안 나게* 하는 것이다. 순서를 바꾼다:

   ```
   0. 뼈대 + 감사 로그
   4-A. 결제 구멍 3곳 코드 수정   ← 화면 없음. 제일 싸고 제일 급하다
   1. 모더레이션 (게시글 6,528 · 리뷰 6)
   2. 회원 → 3. 병원 → 4-B. 주문 화면 → 5. 콘텐츠 → 6. 관측
   ```

---

## 6. 규모

| 단계 | 새 파일 | DB 변경 | 크기 |
|---|---:|---|---|
| 0. 뼈대 + 대시보드 | 4 | 테이블 1 | 작음 |
| 1. 모더레이션 | 3 | 컬럼 2 + 정책 6 | 작음 |
| 2. 회원 | 2 | 컬럼 2 + 정책 4 | 중간 |
| 3. 병원 | 1 | 정책 2 | 작음 |
| 4. 결제 | 1 + 결제코드 수정 3곳 | 컬럼 1 | 중간 |
| 5. 콘텐츠 | 2 + 공개페이지 3곳 수정 | 테이블 1 | 중간 |
| 6. 관측 | 1 + 크론 3곳 수정 | 테이블 1 | 작음 |
