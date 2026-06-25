-- 데모 시드 (jobs 비어있을 때만 1회) — 실제 워크넷/직접등록 데이터로 교체 예정.
do $$
begin
  if not exists (select 1 from public.jobs) then
    insert into public.hospitals (name, region, rating_avg, rating_count) values
      ('서울중앙병원', '서울 송파구', 4.6, 128),
      ('부산세계로병원', '부산 해운대구', 4.2, 54),
      ('대전우리요양병원', '대전 유성구', 4.0, 31),
      ('연세그린병원', '서울 서대문구', 4.8, 210),
      ('인천나래의원', '인천 연수구', 0, 0),
      ('경기365정신건강병원', '경기 수원시', 4.3, 42);

    insert into public.jobs (hospital_id, title, specialty, location, employment_type, salary_text, source, is_featured, benefits, description, posted_at)
    select h.id, v.title, v.specialty, v.location, v.etype, v.salary, v.source, v.featured, v.benefits, v.descr, now() - (v.days || ' days')::interval
    from (values
      ('서울중앙병원', '중환자실(ICU) 간호사 모집 — 경력 우대', '중환자실', '서울 송파구', '정규직', '연 4,200~5,000만원', 'direct', true,  array['기숙사 제공','4대보험','신규 지원금','교육비 지원'], '중환자실(ICU) 간호 업무를 담당합니다. 환자 모니터링, 투약, 처치 보조 및 기록. 3교대 근무이며 신규·경력 모두 지원 가능합니다.', 1),
      ('부산세계로병원', '수술실(OR) 간호사 — 신입/경력', '수술실', '부산 해운대구', '정규직', '월 320~380만원', 'worknet', false, array['경력 우대','인센티브','중식 제공'], '수술실 소독·순환 간호 업무. 수술 준비 및 기구 관리, 수술 중 보조. 신입 교육 프로그램 운영.', 2),
      ('대전우리요양병원', '병동 간호사 (요양) — 야간 전담 가능', '요양병원', '대전 유성구', '계약직', '월 360만원~', 'public_data', false, array['야간전담','주 3일 근무','퇴직금'], '요양병원 병동 간호 업무. 어르신 케어, 투약, 기록. 야간 전담 선택 가능.', 3),
      ('연세그린병원', '응급실(ER) 간호사 정규직 채용', '응급실', '서울 서대문구', '정규직', '연 4,500만원~', 'direct', true,  array['복지 우수','교육 지원','신규 지원금','명절 상여'], '응급실 간호 업무. 응급환자 분류(트리아지), 응급처치 보조, 모니터링. 3교대.', 1),
      ('인천나래의원', '외래 간호사 (Day) — 상근', '외래', '인천 연수구', '정규직', '월 280~330만원', 'worknet', false, array['주 5일','정시 퇴근','4대보험'], '외래 진료 보조 및 환자 안내, 처치, 접수 지원. 주간 상근 근무.', 5),
      ('경기365정신건강병원', '정신과 병동 간호사 — 경력 무관', '정신과', '경기 수원시', '정규직', '연 3,900~4,400만원', 'direct', false, array['경력 무관','기숙사','교육비 지원'], '정신건강의학과 병동 간호. 환자 관찰, 투약, 프로그램 보조. 신규 교육 제공.', 4)
    ) as v(hname, title, specialty, location, etype, salary, source, featured, benefits, descr, days)
    join public.hospitals h on h.name = v.hname;
  end if;
end $$;
