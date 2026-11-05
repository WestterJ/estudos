-- Planejador de Estudos V10.33 — módulo de usuários (permissão de uso da IA)
-- RODAR UMA VEZ no SQL Editor do Supabase (mesmo projeto do app) ANTES de publicar a V10.33.
-- Seguro para repetir: tudo usa "if not exists" / "create or replace".
-- Sem esta migração o app falha "fechado": ninguém vê os botões de IA e a aba Usuários não aparece.

-- 1) Administradores do Planejador de Estudos
create table if not exists public.study_app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2) Permissão de IA por usuário (ausência de linha = sem IA)
create table if not exists public.study_ai_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  allowed    boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- RLS ligado e nenhuma policy: as tabelas só são acessadas pelas funções abaixo (security definer).
alter table public.study_app_admins enable row level security;
alter table public.study_ai_access  enable row level security;
revoke all on public.study_app_admins from anon, authenticated;
revoke all on public.study_ai_access  from anon, authenticated;

-- 3) Administrador padrão (conta westter@gmail.com). Se a conta ainda não existir, nada é inserido:
--    rode este insert de novo depois do primeiro cadastro dela.
insert into public.study_app_admins (user_id)
select id from auth.users where lower(email) = 'westter@gmail.com'
on conflict do nothing;

-- 4) Funções
create or replace function public.study_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.study_app_admins where user_id = auth.uid());
$$;

-- Usada pela Edge Function para barrar a IA no servidor (administrador sempre pode).
create or replace function public.study_can_use_ai()
returns boolean language sql stable security definer set search_path = public as $$
  select public.study_is_admin()
      or coalesce((select allowed from public.study_ai_access where user_id = auth.uid()), false);
$$;

-- Uma chamada só para o app: sou administrador? tenho IA?
create or replace function public.study_my_access()
returns table(r_is_admin boolean, r_ai boolean)
language sql stable security definer set search_path = public as $$
  select public.study_is_admin(), public.study_can_use_ai();
$$;

-- Lista de todos os usuários cadastrados (só administrador).
create or replace function public.study_all_users()
returns table(r_user_id uuid, r_email text, r_created_at timestamptz, r_last_sign_in timestamptz,
              r_ai_allowed boolean, r_is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.study_is_admin() then
    raise exception 'Somente o administrador pode listar os usuários.';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           coalesce(a.allowed, false),
           exists (select 1 from public.study_app_admins s where s.user_id = u.id)
    from auth.users u
    left join public.study_ai_access a on a.user_id = u.id
    order by 6 desc, 2;
end $$;

-- Libera ou bloqueia a IA de um usuário (só administrador).
create or replace function public.study_set_ai(p_user uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.study_is_admin() then
    raise exception 'Somente o administrador pode alterar permissões.';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Usuário não encontrado.';
  end if;
  insert into public.study_ai_access (user_id, allowed, updated_by, updated_at)
  values (p_user, coalesce(p_allowed, false), auth.uid(), now())
  on conflict (user_id) do update
    set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Só usuários logados executam (nunca anon/public).
revoke all on function public.study_is_admin()        from public, anon;
revoke all on function public.study_can_use_ai()      from public, anon;
revoke all on function public.study_my_access()       from public, anon;
revoke all on function public.study_all_users()       from public, anon;
revoke all on function public.study_set_ai(uuid, boolean) from public, anon;
grant execute on function public.study_is_admin()        to authenticated;
grant execute on function public.study_can_use_ai()      to authenticated;
grant execute on function public.study_my_access()       to authenticated;
grant execute on function public.study_all_users()       to authenticated;
grant execute on function public.study_set_ai(uuid, boolean) to authenticated;

-- Conferência (opcional): deve listar westter@gmail.com
-- select u.email from public.study_app_admins a join auth.users u on u.id = a.user_id;
