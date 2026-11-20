-- Run after phone-pairing.sql. This update preserves the existing pairing code.
begin;

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
        'run_key', latest.key,
        'run_id', latest.run_id,
        'started_at', latest.started_at,
        'peak_c', latest.peak_c
      ) order by latest.started_at desc nulls last, latest.created_at desc
    ), '[]'::jsonb)
    from (
      select r.key, r.run_id, r.started_at, r.peak_c, r.created_at
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

create or replace function dryer_phone_private.read_run_graph(p_code text, p_run_key text)
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
    select pg_catalog.jsonb_build_object(
      'step', r.step_s,
      't', pg_catalog.jsonb_agg(s.temp_f order by s.idx),
      'h', pg_catalog.jsonb_agg(s.humidity_pct order by s.idx)
    )
    from public.runs as r
    join public.readings as s on s.run_key = r.key
    where r.key::text = p_run_key
    group by r.step_s
  );
end;
$function$;

revoke all on function dryer_phone_private.read_run_graph(text, text) from public, anon, authenticated;
grant execute on function dryer_phone_private.read_run_graph(text, text) to anon;

create or replace function public.read_dryer_phone_run_graph(p_code text, p_run_key text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select dryer_phone_private.read_run_graph(p_code, p_run_key);
$function$;

revoke all on function public.read_dryer_phone_run_graph(text, text) from public, anon, authenticated;
grant execute on function public.read_dryer_phone_run_graph(text, text) to anon;

notify pgrst, 'reload schema';
commit;
