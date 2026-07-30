-- 이관 이력서에 줄바꿈이 **글자 그대로**(역슬래시 + n) 들어간 것을 고친다.
--
-- 🔴 증상: 카드·상세에 "…8년차 간호사입니다.\n인공호흡기…" 처럼 역슬래시-n 이 그대로 보인다.
--    구 널스넷에서 옮겨올 때 이스케이프가 한 번 더 씌워져 저장됐다. 화면에서 치환하지 않고
--    데이터를 고친다 — 잘못 저장된 값이지 표시 문제가 아니다.
--
-- 🔴 조건을 LIKE 로 쓰면 안 된다. LIKE 는 기본 이스케이프가 역슬래시라 '%\n%' 이
--    "literal n" 을 뜻하게 되어 **letter n 이 든 모든 행**을 잡는다. chr(92)로 값 비교한다.
--
-- 🔴 updated_at 트리거를 반드시 끄고 돌린다. resumes 는 before-update 로 updated_at 을 now() 로
--    밀어올리는데(20260625200000), 인재 목록·홈 '구직 현황'이 updated_at 내림차순이라
--    **보정 작업이 건드린 행이 그대로 메인 첫 화면을 차지한다**(간호사는 아무것도 안 했는데
--    "몇 시간 전"으로 뜬다). 데이터 보정은 사용자의 갱신이 아니다.
alter table public.resumes disable trigger resumes_set_updated_at;

update public.resumes
set intro = replace(replace(intro, chr(92) || 'r' || chr(92) || 'n', chr(10)), chr(92) || 'n', chr(10))
where strpos(intro, chr(92) || 'n') > 0;

-- 제목은 한 줄이라 줄바꿈을 공백으로 접는다(제목이 두 줄이 되면 카드 레이아웃이 흔들린다).
update public.resumes
set resume_title = btrim(replace(replace(resume_title, chr(92) || 'r' || chr(92) || 'n', ' '), chr(92) || 'n', ' '))
where strpos(resume_title, chr(92) || 'n') > 0;

alter table public.resumes enable trigger resumes_set_updated_at;
