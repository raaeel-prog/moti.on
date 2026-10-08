-- Product access is manually granted. No billing, creative media or project paths.
create table public.motion_licenses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz, granted_at timestamptz not null default now(), revoked_at timestamptz
);
create table public.motion_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$'),
  name text not null check (char_length(name) between 1 and 80),
  activated_at timestamptz not null default now(), deactivated_at timestamptz,
  primary key (user_id, device_id)
);
create unique index motion_one_active_device on public.motion_devices(user_id) where deactivated_at is null;
create table public.motion_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('preferences','favorites','variants','gradients')),
  id text not null check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$'),
  value jsonb, deleted boolean not null default false, revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(), primary key(user_id,kind,id),
  check (pg_column_size(value) <= 131072), check ((deleted and value is null) or not deleted)
);
create table public.motion_sync_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id text not null check (mutation_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$'),
  operation jsonb not null, conflicted boolean not null, created_at timestamptz not null default now(),
  primary key(user_id,mutation_id)
);
create table public.motion_license_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check(action in ('grant','revoke','activate','deactivate')),
  device_id text, created_at timestamptz not null default now()
);

alter table public.motion_licenses enable row level security;
alter table public.motion_devices enable row level security;
alter table public.motion_sync_records enable row level security;
alter table public.motion_sync_receipts enable row level security;
alter table public.motion_license_audit enable row level security;
-- Reads stay account-scoped. All writes are via validated Edge -> service-only RPC.
create policy motion_license_read on public.motion_licenses for select to authenticated using ((select auth.uid()) = user_id);
create policy motion_device_read on public.motion_devices for select to authenticated using ((select auth.uid()) = user_id);
create policy motion_sync_read on public.motion_sync_records for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.motion_licenses, public.motion_devices, public.motion_sync_records, public.motion_sync_receipts, public.motion_license_audit from anon, authenticated;
grant select on public.motion_licenses, public.motion_devices, public.motion_sync_records to authenticated;
grant all on public.motion_licenses, public.motion_devices, public.motion_sync_records, public.motion_sync_receipts, public.motion_license_audit to service_role;
grant usage, select on sequence public.motion_license_audit_id_seq to service_role;

create function public.motion_license(p_user uuid, p_device text, p_name text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lic public.motion_licenses%rowtype; devs jsonb; result_state text; active_device text;
begin
  if p_action not in ('status','activate','deactivate') or p_device !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$' or char_length(p_name) not between 1 and 80 then raise exception 'invalid request'; end if;
  -- Serialize competing activations, including grants/deactivations. Unique index is a second guard.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into lic from public.motion_licenses where user_id=p_user for update;
  if lic.id is null then result_state := 'missing';
  elsif lic.status='revoked' then result_state := 'revoked';
  elsif lic.expires_at is not null and lic.expires_at <= now() then result_state := 'expired';
  else
    if p_action='deactivate' then
      update public.motion_devices set deactivated_at=now() where user_id=p_user and device_id=p_device and deactivated_at is null;
      if found then insert into public.motion_license_audit(user_id,action,device_id) values(p_user,'deactivate',p_device); end if;
      result_state := 'inactive';
    else
      select device_id into active_device from public.motion_devices where user_id=p_user and deactivated_at is null;
      if p_action='activate' and active_device is null then
        insert into public.motion_devices(user_id,device_id,name) values(p_user,p_device,p_name)
        on conflict(user_id,device_id) do update set name=excluded.name,activated_at=now(),deactivated_at=null;
        insert into public.motion_license_audit(user_id,action,device_id) values(p_user,'activate',p_device);
        active_device := p_device;
      end if;
      result_state := case when active_device=p_device then 'active' when active_device is null then 'inactive' else 'device_limit' end;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',device_id,'name',name,'activatedAt',activated_at) order by activated_at),'[]'::jsonb)
    into devs from public.motion_devices where user_id=p_user and deactivated_at is null;
  return jsonb_build_object('state',result_state,'devices',devs,'licenseId',lic.id,
    'issuedAt',floor(extract(epoch from now())*1000),
    'expiresAt',floor(extract(epoch from least(now()+interval '7 days',coalesce(lic.expires_at,now()+interval '7 days')))*1000));
end $$;

create function public.motion_admin_license(p_user uuid, p_action text, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('grant','revoke') then raise exception 'invalid action'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if p_action='grant' then
    if p_expires is not null and p_expires <= now() then raise exception 'expired grant'; end if;
    insert into public.motion_licenses(user_id,status,expires_at) values(p_user,'active',p_expires)
    on conflict(user_id) do update set status='active',expires_at=excluded.expires_at,granted_at=now(),revoked_at=null;
  else
    update public.motion_licenses set status='revoked',revoked_at=now() where user_id=p_user;
    if not found then raise exception 'license not found'; end if;
    update public.motion_devices set deactivated_at=now() where user_id=p_user and deactivated_at is null;
  end if;
  insert into public.motion_license_audit(user_id,action) values(p_user,p_action);
end $$;

create function public.motion_sync(p_user uuid, p_operations jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare op jsonb; current_record public.motion_sync_records%rowtype; receipt public.motion_sync_receipts%rowtype;
  entity_kind text; entity_id text; operation_id text; operation_value jsonb; base_revision bigint; is_deleted boolean;
  is_conflict boolean; conflicts integer := 0; acknowledgements jsonb := '[]'::jsonb; records jsonb; copy_id text;
begin
  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations)>100 or pg_column_size(p_operations)>1048576 then raise exception 'invalid batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,1));
  for op in select value from jsonb_array_elements(p_operations) loop
    entity_kind := op->>'kind'; entity_id := op->>'id'; operation_id := op->>'mutationId'; operation_value := op->'value';
    base_revision := (op->>'baseRevision')::bigint; is_deleted := (op->>'deleted')::boolean;
    if entity_kind not in ('preferences','favorites','variants','gradients') or entity_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$' or operation_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$' or base_revision<0 or is_deleted is null then raise exception 'invalid operation'; end if;
    select * into receipt from public.motion_sync_receipts where user_id=p_user and mutation_id=operation_id;
    if receipt.mutation_id is not null then
      if receipt.operation <> op then raise exception 'mutation replay mismatch'; end if;
      acknowledgements := acknowledgements || jsonb_build_array(operation_id); continue;
    end if;
    select * into current_record from public.motion_sync_records where user_id=p_user and kind=entity_kind and id=entity_id;
    is_conflict := coalesce(current_record.revision,0) <> base_revision;
    if is_conflict and entity_kind in ('variants','gradients') then
      -- A stale delete cannot erase a newer recipe. A stale edit becomes a recoverable copy.
      if not is_deleted then
        copy_id := left(entity_id,64)||'-copy-'||left(operation_id,48);
        operation_value := jsonb_set(jsonb_set(operation_value,'{id}',to_jsonb(copy_id)),'{name}',to_jsonb(left(operation_value->>'name',60)||' (conflict)'));
        insert into public.motion_sync_records(user_id,kind,id,value) values(p_user,entity_kind,copy_id,operation_value);
      end if;
      conflicts := conflicts+1;
    else
      -- Preferences are individual fields. Last received change wins only that field.
      insert into public.motion_sync_records(user_id,kind,id,value,deleted) values(p_user,entity_kind,entity_id,case when is_deleted then null else operation_value end,is_deleted)
      on conflict(user_id,kind,id) do update set value=excluded.value,deleted=excluded.deleted,revision=public.motion_sync_records.revision+1,updated_at=now();
    end if;
    insert into public.motion_sync_receipts(user_id,mutation_id,operation,conflicted) values(p_user,operation_id,op,is_conflict);
    acknowledgements := acknowledgements || jsonb_build_array(operation_id);
  end loop;
  if (select count(*) from public.motion_sync_records where user_id=p_user)>2000 then raise exception 'account entity limit'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'value',value,'deleted',deleted,'revision',revision) order by kind,id),'[]'::jsonb)
    into records from public.motion_sync_records where user_id=p_user;
  return jsonb_build_object('accountId',p_user,'records',records,'acknowledged',acknowledgements,'conflicts',conflicts);
end $$;
revoke all on function public.motion_license(uuid,text,text,text), public.motion_admin_license(uuid,text,timestamptz), public.motion_sync(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.motion_license(uuid,text,text,text), public.motion_admin_license(uuid,text,timestamptz), public.motion_sync(uuid,jsonb) to service_role;
