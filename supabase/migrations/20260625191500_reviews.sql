-- 병원 리뷰 (간호사 작성). 병원당 1리뷰, 별점 1~5, 신고/숨김. 평점은 트리거로 hospitals에 집계.
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  content      text not null check (char_length(content) between 10 and 2000),
  work_period  text,
  is_hidden    boolean not null default false,
  report_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hospital_id, author_id)
);
create index reviews_hospital_idx on public.reviews (hospital_id) where not is_hidden;
create index reviews_author_idx on public.reviews (author_id);

create trigger reviews_set_updated_at before update on public.reviews for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;
-- 공개 열람(숨김 제외), 본인 글은 항상. 작성/수정/삭제는 본인만.
create policy reviews_select on public.reviews for select using (not is_hidden or author_id = (select auth.uid()));
create policy reviews_insert_own on public.reviews for insert with check (author_id = (select auth.uid()));
create policy reviews_update_own on public.reviews for update using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy reviews_delete_own on public.reviews for delete using (author_id = (select auth.uid()));

-- 병원 평점 집계 재계산 (트리거 전용)
create function public.recompute_hospital_rating(h uuid) returns void language sql security definer set search_path = '' as $$
  update public.hospitals set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where hospital_id = h and not is_hidden), 0),
    rating_count = (select count(*) from public.reviews where hospital_id = h and not is_hidden)
  where id = h;
$$;
create function public.on_review_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_hospital_rating(coalesce(new.hospital_id, old.hospital_id));
  return null;
end;
$$;
create trigger reviews_rating_sync after insert or update or delete on public.reviews for each row execute function public.on_review_change();

revoke execute on function public.recompute_hospital_rating(uuid) from public, anon, authenticated;
revoke execute on function public.on_review_change() from public, anon, authenticated;
