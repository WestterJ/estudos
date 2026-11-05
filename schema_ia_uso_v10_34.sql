-- Planejador de Estudos V10.34 — histórico de uso da IA (consultas e tokens por modelo)
-- RODAR UMA VEZ no SQL Editor do Supabase, DEPOIS de schema_usuarios_v10_33.sql (usa study_is_admin / study_can_use_ai).
-- Seguro para repetir. Sem esta migração o app continua funcionando; só a seção "Uso da IA" da aba Usuários avisa que falta rodar.

create table if not exists public.study_ai_usage (
  id               bigint generated always as identity primary key,
  user_id          uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  modo             text,                         -- ex.: 'edital'
  model            text,                         -- modelo informado pela resposta da IA ('' = não informado)
  prompt_tokens    integer not null default 0,   -- entrada
  output_tokens    integer not null default 0,   -- saída (inclui "pensamento" quando o modelo informa)
  total_tokens     integer not null default 0,
  tokens_estimated boolean not null default false, -- true = o servidor não informou tokens; valor aproximado (caracteres ÷ 4)
  ok               boolean not null default true,
  error            text,
  duration_ms      integer
);
create index if not exists study_ai_usage_user_idx on public.study_ai_usage (user_id, created_at desc);
create index if not exists study_ai_usage_time_idx on public.study_ai_usage (created_at desc);

-- RLS ligado e sem policies: acesso só pelas funções abaixo.
alter table public.study_ai_usage enable row level security;
revoke all on public.study_ai_usage from anon, authenticated;

-- Registra uma consulta (o app chama depois de cada uso da IA). Só grava se a pessoa tem IA liberada.
create or replace function public.study_log_ai(
  p_modo text, p_model text, p_prompt integer, p_output integer, p_total integer,
  p_estimated boolean, p_ok boolean, p_error text, p_ms integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.study_can_use_ai() then return; end if;
  insert into public.study_ai_usage
    (user_id, modo, model, prompt_tokens, output_tokens, total_tokens, tokens_estimated, ok, error, duration_ms)
  values (
    auth.uid(), left(coalesce(p_modo, ''), 40), left(coalesce(p_model, ''), 80),
    greatest(0, least(coalesce(p_prompt, 0), 10000000)),
    greatest(0, least(coalesce(p_output, 0), 10000000)),
    greatest(0, least(coalesce(p_total, 0), 20000000)),
    coalesce(p_estimated, false), coalesce(p_ok, true), left(p_error, 300),
    greatest(0, least(coalesce(p_ms, 0), 3600000)));
end $$;

-- Resumo por usuário e modelo (só administrador). p_days = null → todo o período.
create or replace function public.study_ai_usage_summary(p_days integer default null)
returns table(r_user_id uuid, r_email text, r_model text, r_queries bigint, r_failed bigint,
              r_prompt bigint, r_output bigint, r_total bigint, r_estimated bigint, r_last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.study_is_admin() then
    raise exception 'Somente o administrador pode ver o uso da IA.';
  end if;
  return query
    select u.user_id, au.email::text,
           coalesce(nullif(u.model, ''), 'não informado'),
           count(*), count(*) filter (where not u.ok),
           coalesce(sum(u.prompt_tokens), 0)::bigint, coalesce(sum(u.output_tokens), 0)::bigint,
           coalesce(sum(u.total_tokens), 0)::bigint,
           count(*) filter (where u.tokens_estimated), max(u.created_at)
    from public.study_ai_usage u
    left join auth.users au on au.id = u.user_id
    where p_days is null or u.created_at >= now() - make_interval(days => p_days)
    group by u.user_id, au.email, coalesce(nullif(u.model, ''), 'não informado')
    order by 8 desc;
end $$;

-- Últimas consultas (só administrador).
create or replace function public.study_ai_usage_recent(p_limit integer default 50)
returns table(r_id bigint, r_created_at timestamptz, r_email text, r_modo text, r_model text,
              r_prompt integer, r_output integer, r_total integer, r_estimated boolean,
              r_ok boolean, r_error text, r_ms integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.study_is_admin() then
    raise exception 'Somente o administrador pode ver o uso da IA.';
  end if;
  return query
    select u.id, u.created_at, au.email::text, u.modo, coalesce(nullif(u.model, ''), 'não informado'),
           u.prompt_tokens, u.output_tokens, u.total_tokens, u.tokens_estimated, u.ok, u.error, u.duration_ms
    from public.study_ai_usage u
    left join auth.users au on au.id = u.user_id
    order by u.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

revoke all on function public.study_log_ai(text, text, integer, integer, integer, boolean, boolean, text, integer) from public, anon;
revoke all on function public.study_ai_usage_summary(integer) from public, anon;
revoke all on function public.study_ai_usage_recent(integer)  from public, anon;
grant execute on function public.study_log_ai(text, text, integer, integer, integer, boolean, boolean, text, integer) to authenticated;
grant execute on function public.study_ai_usage_summary(integer) to authenticated;
grant execute on function public.study_ai_usage_recent(integer)  to authenticated;
