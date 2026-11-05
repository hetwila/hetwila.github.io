/** Operator-only deployed-schema verification. All fixtures are rolled back. */
import { randomUUID } from 'node:crypto'
import { publicAccountConfig } from '../shared/account-config.ts'
import { fetchPrivateRoutes } from './lib/private-routes.ts'

const { supabaseUrl, supabaseKey } = publicAccountConfig(process.env)
const ref = process.env.SUPABASE_PROJECT_ID, token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !/^[a-z]{20}$/.test(ref) || supabaseUrl !== `https://${ref}.supabase.co` || !supabaseKey || !token) throw new Error('Missing or mismatched public project configuration / Management token.')
async function sql(query: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`Deployed database verification failed (${response.status}); response omitted to protect project data.`)
  return response.json()
}
const admin = randomUUID(), guest = randomUUID(), label = `private-verification-${randomUUID()}`
const claims = (id: string) => JSON.stringify({ sub: id, role: 'authenticated' })

await sql(`begin;
-- No password, mail or external Auth request. Deferred registration triggers
-- never commit; every test account, document, ACL and route is rolled back.
insert into auth.users(id,email,aud,role) values
  ('${admin}','${admin}@example.invalid','authenticated','authenticated'),
  ('${guest}','${guest}@example.invalid','authenticated','authenticated');
insert into public.account_profiles(id,email,nickname,user_group) values
  ('${admin}','${admin}@example.invalid','transaction-only admin','admin'),
  ('${guest}','${guest}@example.invalid','transaction-only reader','guest');
set local role authenticated;
select set_config('request.jwt.claims','${claims(admin)}',true);
do $verify$
declare target uuid; version bigint; changed integer;
begin
  if not public.content_can_submit() then raise exception 'admin submission denied'; end if;
  insert into public.private_documents(kind,title,body_markdown,status) values ('story','${label}','Transaction-only private body','published') returning id into target;
  if (select count(*) from public.private_documents where id=target) <> 1 then raise exception 'admin read failed'; end if;
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if public.content_can_submit() then raise exception 'guest submission enabled'; end if;
  if (select count(*) from public.private_documents where id=target) <> 0 then raise exception 'ungranted reader leaked'; end if;
  begin
    insert into public.private_documents(kind,title,body_markdown) values('story','${label}','Forbidden');
    raise exception 'guest write bypass';
  exception when insufficient_privilege then null; end;
  begin
    perform public.content_set_access(target,array['${guest}'::uuid],array[]::public.account_group[],1);
    raise exception 'guest ACL bypass';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','${claims(admin)}',true);
  version := public.content_set_access(target,array['${guest}'::uuid],array[]::public.account_group[],1);
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if (select count(*) from public.private_documents where id=target) <> 1 then raise exception 'user grant failed'; end if;
  update public.private_documents set title='Forbidden' where id=target;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'reader edit bypass'; end if;
  perform set_config('request.jwt.claims','${claims(admin)}',true);
  version := public.content_set_access(target,array[]::uuid[],array['guest']::public.account_group[],version);
  begin
    perform public.content_set_access(target,array[]::uuid[],array[]::public.account_group[],version-1);
    raise exception 'stale ACL bypass';
  exception when serialization_failure then null; end;
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if (select count(*) from public.private_documents where id=target) <> 1 then raise exception 'group grant failed'; end if;
  perform set_config('request.jwt.claims','${claims(admin)}',true);
  update public.private_documents set status='draft' where id=target;
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if (select count(*) from public.private_documents where id=target) <> 0 then raise exception 'draft leaked'; end if;
  perform set_config('request.jwt.claims','${claims(admin)}',true);
  update public.private_documents set status='published' where id=target;
  perform public.content_set_access(target,array[]::uuid[],array[]::public.account_group[],version);
  perform set_config('request.jwt.claims','${claims(guest)}',true);
  if (select count(*) from public.private_documents where id=target) <> 0 then raise exception 'revocation failed'; end if;
end;
$verify$;
reset role;
rollback;`)
const cleanup = await sql(`select
  (select count(*)::int from auth.users where id in ('${admin}','${guest}')) as users,
  (select count(*)::int from public.account_profiles where id in ('${admin}','${guest}')) as profiles,
  (select count(*)::int from public.private_documents where title='${label}') as manuscripts;`)
if (cleanup[0]?.users !== 0 || cleanup[0]?.profiles !== 0 || cleanup[0]?.manuscripts !== 0) throw new Error('Verification fixtures were not fully rolled back.')
console.log('Deployed RLS: admin submission, user/group reads, draft isolation, edit/ACL denial, conflicts and revocation verified; transaction fixtures fully rolled back.')

for (const [table, column] of [['private_documents', 'id'], ['content_user_grants', 'document_id'], ['content_group_grants', 'document_id'], ['content_submission_permissions', 'user_group']]) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${column}&limit=1`, { headers: { apikey: supabaseKey }, signal: AbortSignal.timeout(20000) })
  if (![401, 403].includes(response.status)) throw new Error(`Anonymous ${table} access was not denied (${response.status}).`)
}
const paths = await fetchPrivateRoutes({ ...process.env, PRIVATE_CONTENT_ROUTES: 'required' })
console.log(`Anonymous API denial verified; route-only build catalogue is available (${paths.length} opaque paths).`)
