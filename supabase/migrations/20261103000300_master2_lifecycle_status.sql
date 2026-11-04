-- Master 2 only (Supabase project ngrkqutqmlhdenrxyaos).
-- Preserve integration stages on profile updates; suspend on signed revocations.
create or replace function public.master2_receive_store(
  p_event text, p_id uuid, p_revision bigint, p_profile jsonb, p_fingerprint text
) returns text language plpgsql security invoker set search_path = '' as $$
declare previous public.master2_connection_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('master2:event:' || p_event, 0));
  select * into previous from public.master2_connection_events where event_id = p_event;
  if found then
    if previous.fingerprint <> p_fingerprint or previous.store_id <> p_id then return 'event_conflict'; end if;
    return previous.outcome;
  end if;
  if pg_catalog.jsonb_typeof(p_profile) <> 'object' or
     (p_profile ? 'kitAuthorized' and pg_catalog.jsonb_typeof(p_profile -> 'kitAuthorized') <> 'boolean') then
    return 'invalid_profile';
  end if;
  insert into public.master2_received_stores(id,revision,profile,status)
  values (p_id,p_revision,p_profile,
          case when p_profile->>'kitAuthorized' = 'false' then 'suspended' else 'pending_diagnosis' end)
  on conflict (id) do update
  set revision=excluded.revision,
      profile=excluded.profile,
      status=case
        when excluded.profile->>'kitAuthorized' = 'false' then 'suspended'
        when public.master2_received_stores.status = 'suspended' then 'pending_diagnosis'
        else public.master2_received_stores.status end,
      updated_at=now()
  where public.master2_received_stores.revision < excluded.revision;
  if not found then
    insert into public.master2_connection_events(event_id,store_id,fingerprint,outcome)
      values(p_event,p_id,p_fingerprint,'stale_revision');
    return 'stale_revision';
  end if;
  insert into public.master2_connection_events(event_id,store_id,fingerprint,outcome)
    values(p_event,p_id,p_fingerprint,'received');
  return 'received';
end; $$;
revoke all on function public.master2_receive_store(text,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.master2_receive_store(text,uuid,bigint,jsonb,text) to service_role;