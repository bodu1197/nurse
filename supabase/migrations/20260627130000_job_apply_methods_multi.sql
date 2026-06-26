-- 지원 방법 복수 선택 — 한 공고가 간편지원·이메일·우편 등 여러 방식을 동시에 받을 수 있음.
alter table public.jobs add column if not exists apply_methods text[] not null default '{platform}';
-- 기존 단일값(apply_method) 이관.
update public.jobs set apply_methods = array[apply_method]
  where apply_method is not null and apply_method <> '' and apply_methods = '{platform}';
