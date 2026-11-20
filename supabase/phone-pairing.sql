-- Run once in this project's SQL Editor as postgres.
-- Rerunning generates a new code and revokes the previous one.
begin;

create schema if not exists dryer_phone_private;
revoke all on schema dryer_phone_private from public, anon, authenticated;

create table if not exists dryer_phone_private.pairing (
  id boolean primary key default true check (id),
  code_hash bytea not null
);
alter table dryer_phone_private.pairing enable row level security;
revoke all on dryer_phone_private.pairing from public, anon, authenticated;

create or replace function dryer_phone_private.read_runs(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from dryer_phone_private.pairing
    where code_hash = pg_catalog.sha256(pg_catalog.convert_to(p_code, 'UTF8'))
  ) then
    raise sqlstate 'PT403' using message = 'Invalid or revoked phone pairing code';
  end if;

  return (
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'run_id', latest.run_id,
        'started_at', latest.started_at,
        'peak_c', latest.peak_c
      ) order by latest.started_at desc nulls last, latest.created_at desc
    ), '[]'::jsonb)
    from (
      select r.run_id, r.started_at, r.peak_c, r.created_at
      from public.runs as r
      order by r.started_at desc nulls last, r.created_at desc
      limit 30
    ) as latest
  );
end;
$function$;

revoke all on function dryer_phone_private.read_runs(text) from public, anon, authenticated;
grant usage on schema dryer_phone_private to anon;
grant execute on function dryer_phone_private.read_runs(text) to anon;

create or replace function public.read_dryer_phone_runs(p_code text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select dryer_phone_private.read_runs(p_code);
$function$;

revoke all on function public.read_dryer_phone_runs(text) from public, anon, authenticated;
grant execute on function public.read_dryer_phone_runs(text) to anon;

notify pgrst, 'reload schema';
commit;

with new_code as materialized (
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as code
), saved as (
  insert into dryer_phone_private.pairing (id, code_hash)
  select true, sha256(convert_to(code, 'UTF8')) from new_code
  on conflict (id) do update set code_hash = excluded.code_hash
  returning id
)
select new_code.code as phone_pairing_code from new_code cross join saved;
