-- OPCIONAL: use somente se public.study_planner_data ainda NÃO existir.
-- O Planejador usa esta tabela para guardar um documento JSON por usuário.
create table if not exists public.study_planner_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_planner_data enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_planner_data' and policyname='study_planner_data_select_own') then
    create policy study_planner_data_select_own on public.study_planner_data for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_planner_data' and policyname='study_planner_data_insert_own') then
    create policy study_planner_data_insert_own on public.study_planner_data for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_planner_data' and policyname='study_planner_data_update_own') then
    create policy study_planner_data_update_own on public.study_planner_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_planner_data' and policyname='study_planner_data_delete_own') then
    create policy study_planner_data_delete_own on public.study_planner_data for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.study_planner_data to authenticated;
