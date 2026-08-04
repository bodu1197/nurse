-- 🔴 내가 지운 이력서 이름을 되돌린다.
--
-- 20260804210000 이 이름 규칙을 걸면서, 규칙을 못 맞추는 이력서 이름을 **null 로 비웠다**.
-- 7건이 비었고 그중 3건은 계정에 멀쩡한 한글 이름(정나영·김사랑·김도이)이 남아 있었다.
-- 이력서의 name 칸에 이모지·기호만 적혀 있었을 뿐, 그 사람의 이름을 우리가 알고 있었다는 뜻이다.
--
-- 결과가 나빴다: 이름이 빈 이력서는 공개 인재 목록에서 제외된다(searchPublicTalent 가
-- `name is not null` 로 거른다). 즉 **그 간호사들의 이력서가 병원 검색에서 사라졌다.**
--
-- profiles.full_name 은 이 정리에서 건드리지 않았으므로 원본이 그대로 있다. 거기서 되살린다.
-- 규칙을 통과하는 이름만 되살린다 — 계정 이름도 이모지면 되살려봐야 다시 막힌다.

update public.resumes r
   set name = public.valid_person_name(left(public.clean_person_name(p.full_name), 30))
  from public.profiles p
 where p.id = r.profile_id
   and r.name is null
   -- 내가 비운 것만 되돌린다. 그 전부터 비어 있던 8건은 다른 경위라 손대지 않는다.
   and r.updated_at > timestamptz '2026-08-04 02:40:00+00'
   and public.valid_person_name(left(public.clean_person_name(p.full_name), 30)) is not null;

insert into public.admin_actions (actor_id, actor_email, action, target_table, target_id, reason)
select null, '(마이그레이션)', 'resume.name_restore', 'resumes', r.profile_id::text,
       '20260804210000 이름 정리가 비운 이력서 이름을 계정 이름(profiles.full_name)에서 되살림'
  from public.resumes r
 where r.name is not null
   and r.updated_at > timestamptz '2026-08-04 02:40:00+00'
   and r.profile_id in (
     select profile_id from public.resumes where updated_at > timestamptz '2026-08-04 02:40:00+00'
   );
