import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeReturnTo } from '../shared/account.ts'
import { publicAccountConfig } from '../shared/account-config.ts'
test('return URLs keep local reading locations and reject redirects and authentication loops',()=>{
  assert.equal(safeReturnTo('/wiki/禁制#h31-01'),'/wiki/%E7%A6%81%E5%88%B6#h31-01')
  for(const path of ['https://evil.example','//evil.example','/\\evil.example','/%2fexample.test','/\n/example.test','/account/login?returnTo=/account/login','/account/register','/bad%escape',null,[]]) assert.equal(safeReturnTo(path),'/')
})
test('only public Supabase keys can enter the static runtime config',()=>{
  assert.deepEqual(publicAccountConfig({SUPABASE_URL:'https://project.supabase.co/',SUPABASE_KEY:'sb_publishable_test'}),{supabaseUrl:'https://project.supabase.co',supabaseKey:'sb_publishable_test'})
  const jwt=(role:string)=>`header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`
  assert.equal(publicAccountConfig({SUPABASE_KEY:jwt('anon')}).supabaseKey,jwt('anon'))
  for(const key of ['sb_secret_should_not_escape',jwt('service_role'),'invalid']) {
    assert.throws(()=>publicAccountConfig({SUPABASE_KEY:key}),error=>error instanceof Error&&!error.message.includes(key))
  }
})
