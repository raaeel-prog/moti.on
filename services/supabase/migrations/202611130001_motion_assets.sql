-- Stock media library (motion-assets). Provider keys live in function secrets, never here.
-- No search history is stored per account: the cache is keyed by a hash of the request only.
create table public.motion_asset_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (user_id, window_start)
);
create table public.motion_asset_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  value jsonb not null check (pg_column_size(value) <= 1048576),
  expires_at timestamptz not null
);
create index motion_asset_cache_expiry on public.motion_asset_cache(expires_at);

alter table public.motion_asset_usage enable row level security;
alter table public.motion_asset_cache enable row level security;
revoke all on public.motion_asset_usage, public.motion_asset_cache from anon, authenticated;
grant all on public.motion_asset_usage, public.motion_asset_cache to service_role;

-- One call per panel request: counts the current minute, trims old windows and expired cache rows.
create function public.motion_asset_quota(p_user uuid, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if p_limit not between 1 and 600 then raise exception 'invalid limit'; end if;
  insert into public.motion_asset_usage(user_id, window_start, requests) values (p_user, date_trunc('minute', now()), 1)
  on conflict (user_id, window_start) do update set requests = public.motion_asset_usage.requests + 1
  returning requests into used;
  delete from public.motion_asset_usage where user_id = p_user and window_start < now() - interval '1 hour';
  delete from public.motion_asset_cache where key in (select key from public.motion_asset_cache where expires_at < now() limit 200);
  return used <= p_limit;
end $$;
revoke all on function public.motion_asset_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.motion_asset_quota(uuid, integer) to service_role;
