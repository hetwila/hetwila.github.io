// Real PostgreSQL + Supabase Auth + PostgREST. No cloud credentials are used.
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

const prefix = `hetwila-accounts-test-${process.pid}`
const jwtSecret = 'local-account-integration-test-only-secret-000000000'
const containers: string[] = []
let authUrl = '', restUrl = '', guestId = '', guestToken = '', adminId = '', adminToken = ''
const password = 'Integration-only-password-1!'
function docker(...args: string[]) { return execFileSync('docker', args, { encoding:'utf8', stdio:['pipe','pipe','pipe'] }).trim() }
function sql(query: string) { return execFileSync('docker', ['exec','-i','-e','PGPASSWORD=local-test-password',`${prefix}-db`,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-qAt','-1'], { input:query, encoding:'utf8',stdio:['pipe','pipe','pipe'] }).trim() }
function token(role: string) {
  const payload = [ {alg:'HS256',typ:'JWT'}, {role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600} ].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.')
  return `${payload}.${createHmac('sha256',jwtSecret).update(payload).digest('base64url')}`
}
const serviceToken = token('service_role'), anonToken = token('anon')
async function request(base: string, path: string, method = 'GET', body?: unknown, bearer = serviceToken) {
  const response = await fetch(base+path, {method,headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)})
  const text = await response.text()
  return {status:response.status,body:text?JSON.parse(text):null}
}
function rest(path: string, method = 'GET', body?: unknown, bearer = serviceToken) { return request(restUrl,path,method,body,bearer) }
function auth(path: string, method = 'GET', body?: unknown, bearer = serviceToken) { return request(authUrl,path,method,body,bearer) }
async function waitFor(check:()=>Promise<boolean>) {
  for(let i=0;i<120;i++) { try { if(await check()) return } catch { /* service is starting */ } await new Promise(r=>setTimeout(r,500)) }
  throw new Error('Local account service did not become ready')
}
function start(name:string,image:string,env:Record<string,string>,port?:number) {
  const fullName=`${prefix}-${name}`; containers.push(fullName)
  docker('run','--name',fullName,'--network',prefix,...(port?['-p',`127.0.0.1::${port}`]:[]),...(name==='db'?['--tmpfs','/var/lib/postgresql/data:rw']:[]),...Object.entries(env).flatMap(([key,value])=>['-e',`${key}=${value}`]),'-d',image)
  if (!port) return ''
  return `http://127.0.0.1:${JSON.parse(docker('inspect',fullName))[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort}`
}
async function invite(code:string,changes:Record<string,unknown>={}) {
  const result=await rest('/account_invitations','POST',{code,valid_from:new Date(Date.now()-60000).toISOString(),valid_until:new Date(Date.now()+3600000).toISOString(),...changes})
  assert.equal(result.status,201,JSON.stringify(result.body)); return result.body[0]
}
async function register(email:string,code:string) {
  const ticket=await rest('/rpc/account_prepare_registration','POST',{p_email:email,p_nickname:'可重复的昵称',p_code:code})
  if(ticket.status!==200) return ticket
  const result=await auth('/admin/users','POST',{email,password,email_confirm:true,app_metadata:{registration_ticket:ticket.body},user_metadata:{user_group:'admin'}})
  return result
}
async function login(email:string,pw=password) { return auth('/token?grant_type=password','POST',{email,password:pw},anonToken) }

before(async()=>{
  docker('network','create',prefix)
  start('db','postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b',{POSTGRES_PASSWORD:'local-test-password'})
  await waitFor(async()=>sql('select 1')==='1')
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator login noinherit password 'local-test-password'; grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin login password 'local-test-password'; create schema auth authorization supabase_auth_admin;
    alter role supabase_auth_admin set search_path=auth; create schema extensions;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
    create policy existing_broad_policy on storage.objects for all to authenticated using(true) with check(true);
    grant usage on schema auth,public,extensions to anon,authenticated,service_role;`)
  authUrl=start('auth','ghcr.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',{
    GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:local-test-password@${prefix}-db:5432/postgres`,
    GOTRUE_SITE_URL:'http://localhost:4173',API_EXTERNAL_URL:'http://localhost:9999',GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',
    GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',
    GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD:'true',
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH:'1000',GOTRUE_RATE_LIMIT_EMAIL_SENT:'1000',GOTRUE_RATE_LIMIT_VERIFY:'1000',
  },9999)
  await waitFor(async()=>(await fetch(authUrl+'/health')).ok)
  // Supabase's auth.uid() integration with PostgREST's modern request.jwt.claims.
  sql(`create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant execute on function auth.uid() to public;`)
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) sql(readFileSync(`supabase/migrations/${file}`,'utf8'))
  restUrl=start('rest','ghcr.io/supabase/postgrest:v16.5@sha256:1347d7552b88f17832912c06afbf7c43209af6eeeb60834b04aae12c9bd9d5cc',{
    PGRST_DB_URI:`postgres://authenticator:local-test-password@${prefix}-db:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,
  },3000)
  await waitFor(async()=>(await rest('/')).status===200)
}, {timeout:240000})
after(()=>{
  for(const name of containers.reverse()) {try {docker('rm','-f',name)} catch { /* already removed */ }}
  try {docker('network','rm',prefix)} catch { /* setup may have failed */ }
})

test('successful registration consumes exactly one invitation and always starts as guest',async()=>{
  await invite('GUEST1')
  const result=await register('guest@example.test','GUEST1'); assert.equal(result.status,200,JSON.stringify(result.body))
  guestId=result.body.id
  const session=await login('guest@example.test'); assert.equal(session.status,200); guestToken=session.body.access_token
  const profiles=await rest('/account_profiles','GET',undefined,guestToken)
  assert.equal(profiles.body.length,1); assert.equal(profiles.body[0].user_group,'guest')
  const codes=await rest('/account_invitations?code=eq.GUEST1'); assert.equal(codes.body[0].used_by,guestId); assert.ok(codes.body[0].used_at)
  assert.notEqual((await register('again@example.test','GUEST1')).status,200)
})
test('parallel registrations cannot redeem the same invitation twice',async()=>{
  await invite('RACE01')
  const results=await Promise.all([register('race1@example.test','RACE01'),register('race2@example.test','RACE01')])
  assert.equal(results.filter(r=>r.status===200).length,1)
  assert.equal(Number(sql("select count(*) from auth.users where email like 'race%@example.test'")),1)
})
test('failed registration rolls back invitation consumption; invalid dates are rejected',async()=>{
  await invite('RETRY1')
  assert.notEqual((await register('guest@example.test','RETRY1')).status,200)
  assert.equal((await rest('/account_invitations?code=eq.RETRY1')).body[0].used_at,null)
  assert.equal((await register('retry@example.test','RETRY1')).status,200)
  await invite('FUTURE',{valid_from:new Date(Date.now()+600000).toISOString()})
  await invite('EXPIRE',{valid_from:'2020-01-01T00:00:00Z',valid_until:'2020-01-02T00:00:00Z'})
  for(const code of ['FUTURE','EXPIRE','BAD000']) assert.notEqual((await register('invalid@example.test',code)).status,200)
})
test('direct Auth signup and admin creation without a verified ticket are blocked',async()=>{
  assert.notEqual((await auth('/signup','POST',{email:'bypass@example.test',password},anonToken)).status,200)
  assert.notEqual((await auth('/admin/users','POST',{email:'bypass@example.test',password,email_confirm:true})).status,200)
  assert.equal(sql("select count(*) from auth.users where email='bypass@example.test'"),'0')
})
test('guests cannot list invitations, change roles/avatar paths or register through private RPC',async()=>{
  assert.deepEqual((await rest('/account_invitations','GET',undefined,guestToken)).body,[])
  for(const body of [{user_group:'admin'},{avatar_path:'someone-else/avatar.png'},{email:'changed@example.test'}]) assert.equal((await rest(`/account_profiles?id=eq.${guestId}`,'PATCH',body,guestToken)).status,403)
  assert.equal((await rest('/rpc/account_prepare_registration','POST',{p_email:'bypass@example.test',p_nickname:'用户',p_code:'GUEST1'},guestToken)).status,403)
  assert.equal((await rest(`/account_profiles?id=eq.${guestId}`,'PATCH',{nickname:'新的昵称'},guestToken)).status,200)
  const anonymous=await rest('/account_profiles','GET',undefined,anonToken); assert.equal(anonymous.status,401)
  assert.throws(()=>sql(`set local role authenticated; insert into storage.objects(bucket_id,name) values('account-avatars','bypass.png')`),/row-level security/)
  sql(`set local role authenticated; insert into storage.objects(bucket_id,name) values('other-bucket','unaffected.png')`)
})
test('the Auth service requires the current password even for direct API requests',async()=>{
  for(const body of [{password:'New-password-123!'},{password:'New-password-123!',current_password:'incorrect'}]) assert.notEqual((await auth('/user','PUT',body,guestToken)).status,200)
  assert.equal((await auth('/user','PUT',{password:'New-password-123!',current_password:password},guestToken)).status,200)
  assert.equal((await login('guest@example.test')).status,400)
  const session=await login('guest@example.test','New-password-123!'); assert.equal(session.status,200); guestToken=session.body.access_token
})
test('admin can create, edit, inspect and delete invitations and list all users',async()=>{
  await invite('ADMIN1')
  const created=await register('admin@example.test','ADMIN1'); assert.equal(created.status,200); adminId=created.body.id
  sql(`update public.account_profiles set user_group='admin' where id='${adminId}'::uuid`)
  adminToken=(await login('admin@example.test')).body.access_token
  const list=await rest('/account_profiles','GET',undefined,adminToken); assert.ok(list.body.length>=4)
  assert.equal((await rest('/account_profiles','GET',undefined,guestToken)).body.length,1)
  assert.deepEqual((await rest(`/account_profiles?id=eq.${adminId}`,'PATCH',{nickname:'illegal'},guestToken)).body,[])
  const result=await rest('/account_invitations','POST',{valid_from:new Date(Date.now()-60000).toISOString(),valid_until:new Date(Date.now()+600000).toISOString(),note:'test'},adminToken)
  assert.equal(result.status,201,JSON.stringify(result.body)); const code=result.body[0]
  assert.match(code.code,/^[A-Z0-9]{6}$/); assert.equal(code.created_by,adminId)
  assert.equal((await rest(`/account_invitations?id=eq.${code.id}`,'PATCH',{note:'updated'},adminToken)).status,200)
  assert.equal((await rest('/rpc/account_delete_invitation','POST',{target:code.id},guestToken)).status,403)
  assert.equal((await rest('/rpc/account_delete_invitation','POST',{target:code.id},adminToken)).status,204)
  assert.notEqual((await register('deleted@example.test',code.code)).status,200)
  assert.equal((await rest('/account_invitations','POST',{code:code.code,valid_from:code.valid_from,valid_until:code.valid_until},adminToken)).status,409)
  assert.equal((await rest('/account_invitations?code=eq.GUEST1','PATCH',{code:'RESET1'},adminToken)).status,400)
})
