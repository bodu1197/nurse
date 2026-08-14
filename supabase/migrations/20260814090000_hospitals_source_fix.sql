-- 명부(심사평가원)에서 받은 병원이 출처 'direct'(직접등록)로 잘못 박혀 있던 것을 바로잡는다.
--
-- 원인: sync-hospitals 의 upsert 가 source 를 안 넘겼다. hospitals.source 의 컬럼 기본값이
--       'direct' 라, **새로 INSERT 되는 행**에만 조용히 'direct' 가 붙었다(기존 행 UPDATE 는
--       source 를 안 건드리니 8만 건 중 아무 데도 티가 안 났다).
-- 실측 2026-08-14: 464행. 전부 ykiho 가 있고 is_claimed=false · owner_profile_id=null 인
--       순수 명부 행이었다(진짜 직접등록 8행은 ykiho 가 없어 여기 안 걸린다).
-- 재발 방지: lib/hira.ts 의 HospitalRow 가 source 를 항상 'public_data' 로 박는다.
update public.hospitals
   set source = 'public_data'
 where source = 'direct'
   and ykiho is not null;
