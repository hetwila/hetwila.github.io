import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { encode, decode } from 'npm:fast-png@8.0.0'
import { boundedPng } from '../_shared/png.ts'
import { register } from '../account-register/index.ts'
import { avatar } from '../account-avatar/index.ts'

Deno.env.set('SUPABASE_URL','https://account.example.test')
Deno.env.set('ACCOUNT_SECRET_KEY','sb_secret_local_test_only')
Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
Deno.env.set('ACCOUNT_ALLOWED_ORIGINS','https://hetwila.github.io')
Deno.env.set('TURNSTILE_SECRET_KEY','local-test-only')
const userId='01234567-1234-4234-8234-012345678901'
const payload={email:'test@example.test',password:'Testing-password-123',nickname:'测试用户',inviteCode:'ABC123',turnstileToken:'proof'}
function response(body:unknown,status=200) {return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function req(body:unknown,origin='https://hetwila.github.io') {return new Request('https://account.example.test/functions/v1/account-register',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})}
async function mock(run:(request:Request)=>Response|Promise<Response>,action:()=>Promise<void>) {
  const original=globalThis.fetch
  globalThis.fetch=(input,init)=>Promise.resolve(run(new Request(input,init)))
  try {await action()} finally {globalThis.fetch=original}
}

Deno.test('registration rejects failed proofs, wrong host/action, untrusted origins and oversized inputs',async()=>{
  for(const proof of [{success:false},{success:true,hostname:'evil.example',action:'register'},{success:true,hostname:'hetwila.github.io',action:'other'}]) {
    await mock(request=>{assert.equal(new URL(request.url).hostname,'challenges.cloudflare.com');return response(proof)},async()=>{
      assert.equal((await register(req(payload))).status,400)
    })
  }
  await mock(()=>{throw new Error('Unexpected network call')},async()=>{
    assert.equal((await register(req(payload,'https://evil.example'))).status,403)
    assert.equal((await register(req({...payload,nickname:'a'.repeat(9000)}))).status,413)
    assert.equal((await register(req({...payload,user_group:'admin'}))).status,400)
  })
})
Deno.test('verified registration uses a private ticket and confirms the email without sending mail',async()=>{
  const calls:string[]=[]
  await mock(async request=>{
    calls.push(new URL(request.url).pathname)
    if(request.url.includes('siteverify')) return response({success:true,hostname:'hetwila.github.io',action:'register'})
    const body=await request.json()
    if(request.url.includes('account_prepare_registration')) {assert.equal(body.p_code,'ABC123');return response('test-ticket')}
    assert.equal(body.email_confirm,true);assert.deepEqual(body.app_metadata,{registration_ticket:'test-ticket'})
    assert.equal(body.password,payload.password);assert.equal(body.user_group,undefined)
    return response({id:userId,email:payload.email})
  },async()=>{const result=await register(req(payload));assert.equal(result.status,200);assert.deepEqual(await result.json(),{userId})})
  assert.deepEqual(calls,['/turnstile/v0/siteverify','/rest/v1/rpc/account_prepare_registration','/auth/v1/admin/users'])
})
Deno.test('a rejected invitation never reaches Auth user creation',async()=>{
  await mock(request=>request.url.includes('siteverify')?response({success:true,hostname:'hetwila.github.io',action:'register'}):response({message:'Invalid invitation',code:'22023'},400),async()=>{
    assert.equal((await register(req(payload))).status,400)
  })
})
function image(size:number,height=size) {return encode({width:size,height,data:new Uint8Array(size*height*4).fill(128),channels:4,depth:8})}
function avatarRequest(bytes:Uint8Array,token='test-access-token') {return new Request('https://account.example.test/functions/v1/account-avatar',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},body:bytes as BodyInit})}
function profileMock(request:Request) {
  if(request.url.endsWith('/auth/v1/user')) return response({id:userId,email:'test@example.test'})
  if(request.method==='GET') return response({avatar_path:`${userId}/old.png`})
  throw new Error('Unexpected write')
}
Deno.test('avatar endpoint rejects malformed, nonsquare, oversized and unauthenticated uploads before writing',async()=>{
  await mock(profileMock,async()=>{
    for(const bytes of [new Uint8Array([1,2,3]),image(257),image(128,64)]) assert.equal((await avatar(avatarRequest(bytes))).status,400)
    assert.equal((await avatar(avatarRequest(new Uint8Array(524289)))).status,413)
  })
  await mock(()=>response({message:'Invalid JWT'},401),async()=>{assert.equal((await avatar(avatarRequest(image(1)))).status,401)})
})
Deno.test('avatar upload validates pixels, strips appended data and stores only in the authenticated user folder',async()=>{
  let stored=false,updated=false,removed=false
  const png=image(256),bytes=new Uint8Array(png.length+4);bytes.set(png);bytes.set([1,2,3,4],png.length)
  await mock(async request=>{
    if(request.method==='GET') return profileMock(request)
    if(request.url.includes('/storage/v1/object/account-avatars/')) {
      assert.match(new URL(request.url).pathname,new RegExp(`/account-avatars/${userId}/[a-f0-9-]+\\.png$`))
      const saved=new Uint8Array(await request.arrayBuffer());assert.equal(decode(saved).width,256);assert.ok(saved.length<bytes.length)
      stored=true;return response({Key:'avatar.png'})
    }
    if(request.method==='PATCH') {const body=await request.json();assert.ok(body.avatar_path.startsWith(userId+'/'));updated=true;return response(null)}
    assert.equal(request.method,'DELETE');removed=true;return response([])
  },async()=>{assert.equal((await avatar(avatarRequest(bytes))).status,200)})
  assert.ok(stored&&updated&&removed)
})
Deno.test('restoring default avatar clears the profile and removes the old object',async()=>{
  let removed=false
  await mock(async request=>{
    if(request.method==='GET') return profileMock(request)
    if(request.method==='PATCH') {assert.equal((await request.json()).avatar_path,null);return response(null)}
    assert.equal(request.method,'DELETE');removed=true;return response([])
  },async()=>{assert.deepEqual(await (await avatar(avatarRequest(new Uint8Array()))).json(),{avatarPath:null})})
  assert.ok(removed)
})
Deno.test('a small PNG header cannot hide an oversized compressed pixel stream',()=>{
  const png=image(1),compressed=deflateSync(new Uint8Array(1000000))
  const attack=new Uint8Array(33+12+compressed.length+12)
  attack.set(png.subarray(0,33));const view=new DataView(attack.buffer)
  view.setUint32(33,compressed.length);view.setUint32(37,0x49444154);attack.set(compressed,41)
  attack.set(png.subarray(png.length-12),attack.length-12)
  assert.throws(()=>boundedPng(attack,1,1),/maxOutputLength|larger than|too large|buffer/i)
})
