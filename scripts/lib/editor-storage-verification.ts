import { randomUUID } from 'node:crypto'

// Run through the operator Management API or the isolated integration database.
// All accounts, object metadata, grants and broad test policies are rolled back.
export function editorStorageVerification() {
  const admin = randomUUID(), other = randomUUID(), guest = randomUUID()
  const name = `1234567890123-dGVzdA-${randomUUID()}.json`
  const path = `${admin}/${name}`, foreign = `${other}/${name}`
  const claims = (id: string) => JSON.stringify({ sub: id, role: 'authenticated' })
  return { ids: [admin, other, guest], query: `begin;
set local storage.allow_delete_query = 'true';
insert into auth.users(id,email,aud,role) values
  ('${admin}','${admin}@example.invalid','authenticated','authenticated'),
  ('${other}','${other}@example.invalid','authenticated','authenticated'),
  ('${guest}','${guest}@example.invalid','authenticated','authenticated');
insert into public.account_profiles(id,email,nickname,user_group) values
  ('${admin}','${admin}@example.invalid','transaction-only editor','admin'),
  ('${other}','${other}@example.invalid','transaction-only other editor','admin'),
  ('${guest}','${guest}@example.invalid','transaction-only reader','guest');
-- Prove that unrelated permissive policies cannot open this bucket.
grant usage on schema storage to anon;
grant select,insert,update,delete on storage.objects to anon,authenticated;
create policy editor_verification_broad on storage.objects for all to anon,authenticated using(true) with check(true);
do $verify$ begin
  if not exists(select 1 from storage.buckets where id='editor-drafts' and public=false and file_size_limit=4194304 and allowed_mime_types=array['application/json']) then raise exception 'private bucket configuration mismatch'; end if;
end $verify$;
set local role authenticated;
select set_config('request.jwt.claims','${claims(admin)}',true);
do $verify$
declare changed integer;
begin
  insert into storage.objects(bucket_id,name) values('editor-drafts','${path}');
  if (select count(*) from storage.objects where bucket_id='editor-drafts' and name='${path}') <> 1 then raise exception 'owner read denied'; end if;
  update storage.objects set name='${admin}/replaced.json' where bucket_id='editor-drafts' and name='${path}';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'immutable snapshot overwritten'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('editor-drafts','${foreign}');
    raise exception 'foreign prefix write allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('editor-drafts','${admin}/../bad.json');
    raise exception 'invalid path allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','${claims(other)}',true);
  if exists(select 1 from storage.objects where bucket_id='editor-drafts' and name='${path}') then raise exception 'other admin read allowed'; end if;
  delete from storage.objects where bucket_id='editor-drafts' and name='${path}';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'other admin delete allowed'; end if;
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if exists(select 1 from storage.objects where bucket_id='editor-drafts') then raise exception 'guest read allowed'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('editor-drafts','${guest}/${name}');
    raise exception 'guest upload allowed';
  exception when insufficient_privilege then null; end;
end $verify$;
reset role;
update public.account_profiles set user_group='guest' where id='${admin}';
set local role authenticated;
select set_config('request.jwt.claims','${claims(admin)}',true);
do $verify$ begin
  if exists(select 1 from storage.objects where bucket_id='editor-drafts' and name='${path}') then raise exception 'revoked admin read allowed'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('editor-drafts','${admin}/1234567890123-new-${randomUUID()}.json');
    raise exception 'revoked admin upload allowed';
  exception when insufficient_privilege then null; end;
end $verify$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $verify$ begin
  if exists(select 1 from storage.objects where bucket_id='editor-drafts') then raise exception 'anonymous read allowed'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('editor-drafts','${path}');
    raise exception 'anonymous upload allowed';
  exception when insufficient_privilege then null; end;
end $verify$;
reset role;
update public.account_profiles set user_group='admin' where id='${admin}';
set local role authenticated;
select set_config('request.jwt.claims','${claims(admin)}',true);
do $verify$ declare changed integer; begin
  delete from storage.objects where bucket_id='editor-drafts' and name='${path}';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'owner delete failed'; end if;
end $verify$;
reset role;
rollback;` }
}
