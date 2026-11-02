-- Local disposable PostgreSQL test only. These stand-ins model Supabase identities/topics.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema realtime;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
create table realtime.messages(extension text, payload jsonb);
alter table realtime.messages enable row level security;
grant usage on schema auth,realtime,public to anon,authenticated;
grant select,insert on realtime.messages to anon,authenticated;
-- An existing permissive policy must not open customer tracking channels.
create policy existing_broad_read on realtime.messages for select to anon,authenticated using (true);
create policy existing_broad_write on realtime.messages for insert to anon,authenticated with check (true);
