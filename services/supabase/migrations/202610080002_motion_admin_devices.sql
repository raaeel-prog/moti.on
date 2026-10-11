-- Administrator releases a computer slot. p_device null releases every active computer.
create function public.motion_admin_device(p_user uuid, p_device text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare released integer;
begin
  if p_device is not null and p_device !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$' then raise exception 'invalid device'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  with changed as (
    update public.motion_devices set deactivated_at = now()
    where user_id = p_user and deactivated_at is null and (p_device is null or device_id = p_device)
    returning device_id
  ), audit as (
    insert into public.motion_license_audit(user_id, action, device_id) select p_user, 'deactivate', device_id from changed returning 1
  )
  select count(*) into released from audit;
  return released;
end $$;
revoke all on function public.motion_admin_device(uuid, text) from public, anon, authenticated;
grant execute on function public.motion_admin_device(uuid, text) to service_role;
