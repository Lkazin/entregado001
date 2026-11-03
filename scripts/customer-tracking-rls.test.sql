\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.customer_tracking_grants(viewer_id,topic,expires_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','customer-tracking:'||repeat('a',64),now()+interval '15 minutes'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','customer-tracking:'||repeat('b',64),now()+interval '15 minutes'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','customer-tracking:'||repeat('c',64),now()-interval '1 minute');
insert into realtime.messages values ('broadcast','{}');
insert into public.store_feature_entitlements(store_id,feature,enabled) values ('test-store-a','customer_live_tracking',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('realtime.topic','customer-tracking:'||repeat('a',64),true);
do $$ begin
 if (select count(*) from public.customer_tracking_grants) <> 1 then raise exception 'viewer can read another or expired grant'; end if;
 if (select count(*) from realtime.messages) <> 1 then raise exception 'own channel refused'; end if;
 begin
  insert into public.customer_tracking_grants(viewer_id,topic,expires_at) values (auth.uid(),'customer-tracking:'||repeat('d',64),now()+interval '15 minutes');
  raise exception 'client minted own grant';
 exception when insufficient_privilege then null; end;
 begin
  select * from public.store_feature_entitlements;
  raise exception 'client read billing permissions';
 exception when insufficient_privilege then null; end;
 begin
  insert into realtime.messages values ('broadcast','{"forged":true}');
  raise exception 'client published tracking';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('realtime.topic','customer-tracking:'||repeat('b',64),true);
do $$ begin if (select count(*) from realtime.messages) <> 0 then raise exception 'foreign channel exposed'; end if; end $$;
select set_config('realtime.topic','customer-tracking:'||repeat('c',64),true);
do $$ begin if (select count(*) from realtime.messages) <> 0 then raise exception 'expired grant exposed'; end if; end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('realtime.topic','customer-tracking:'||repeat('b',64),true);
do $$ begin if (select count(*) from realtime.messages) <> 1 then raise exception 'second viewer own channel refused'; end if; end $$;
set local role anon;
do $$ begin if (select count(*) from realtime.messages) <> 0 then raise exception 'unauthenticated channel exposed'; end if; end $$;
select set_config('realtime.topic','unrelated-public-channel',true);
do $$ begin if (select count(*) from realtime.messages) <> 1 then raise exception 'unrelated channel changed'; end if; end $$;
rollback;
select 'PASS: own/foreign/expired channel, grants, billing, publish and unrelated-channel isolation' as result;
