-- Only run after customer_accounts_setup.sql in a disposable test database.
-- Bootstrap roles: anon, authenticated, service_role BYPASSRLS; never create these in production.
\set ON_ERROR_STOP on
begin;
insert into public.nw_customer_profiles(id,store_id,name,phone) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a','Cliente A','5551999990001'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','store-b','Cliente B','5551999990001');
insert into public.nw_customer_orders(store_id,order_id,profile_id,tracking_token,snapshot)
 values ('store-a','own-order','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tk-fake','{}');
insert into public.nw_customer_sessions(token_hash,profile_id,store_id,expires_at)
 values (repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a',now()+interval '1 day');
select public.nw_customer_update_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a',null,'5551999990002');
insert into public.nw_customer_profiles(id,store_id,name,phone) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','store-a','Outro perfil','5551999990003');
do $$ begin
 if exists(select 1 from public.nw_customer_sessions where profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and revoked_at is null) then raise exception 'phone update did not revoke sessions'; end if;
 begin
  perform public.nw_customer_update_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a','Must not apply','5551999990003');
  raise exception 'phone uniqueness failed';
 exception when unique_violation then null; end;
 if not exists(select 1 from public.nw_customer_profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and name='Cliente A' and phone='5551999990002') then raise exception 'failed update was not atomic';end if;
 if public.nw_customer_update_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-b','Forged',null) is not null then raise exception 'foreign store update allowed';end if;
end $$;
select public.nw_customer_save_address('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a',null,'Casa','{"street":"Rua teste"}',true);
select public.nw_customer_save_address('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a',null,'Trabalho','{"street":"Rua teste 2"}',true);
do $$ declare own_address uuid; begin
 if (select count(*) from public.nw_customer_addresses where profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and is_default)<>1 then raise exception 'default uniqueness failed'; end if;
 select id into own_address from public.nw_customer_addresses where profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' limit 1;
 begin
  perform public.nw_customer_save_address('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','store-b',own_address,'Forged','{}',true);
  raise exception 'cross profile address edit allowed';
 exception when raise_exception then if SQLERRM<>'ADDRESS_NOT_FOUND' then raise; end if; end;
 if public.nw_customer_remove_address('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','store-b',own_address) then raise exception 'cross profile address delete allowed'; end if;
 if public.nw_customer_delete_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-b') then raise exception 'cross store profile delete allowed'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.nw_customer_profiles;raise exception 'anon profiles exposed'; exception when insufficient_privilege then null;end;
 begin perform public.nw_customer_delete_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a');raise exception 'anon RPC allowed'; exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$ begin
 begin perform * from public.nw_customer_orders;raise exception 'authenticated history exposed'; exception when insufficient_privilege then null;end;
 begin perform * from public.nw_customer_sessions;raise exception 'authenticated sessions exposed'; exception when insufficient_privilege then null;end;
end $$;
reset role;
select public.nw_customer_delete_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','store-a');
do $$ begin
 if exists(select 1 from public.nw_customer_sessions where profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and revoked_at is null) then raise exception 'delete did not revoke sessions';end if;
 if exists(select 1 from public.nw_customer_addresses where profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'delete did not remove saved addresses';end if;
 if (select count(*) from public.nw_customer_orders where order_id='own-order')<>1 then raise exception 'historical order changed';end if;
 if not exists(select 1 from public.nw_customer_profiles where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and deleted_at is null) then raise exception 'foreign profile changed';end if;
end $$;
rollback;
select 'PASS: schema, default address, two-store ownership, web restrictions, session revocation and order preservation' as result;
