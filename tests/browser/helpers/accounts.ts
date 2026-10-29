import type { Page } from '@playwright/test'

export const userId='01234567-1234-4234-8234-012345678901'
export async function accountFixture(page:Page,group?:'guest'|'admin') {
  const user={id:userId,email:'reader@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}
  const accessToken=[{alg:'HS256',typ:'JWT'},{sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'test-signature'].map(part=>Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')
  const session={user,access_token:accessToken,refresh_token:'test-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'}
  const profile={id:userId,email:user.email,nickname:'测试读者',user_group:group||'guest',avatar_path:null as string|null,created_at:user.created_at,updated_at:user.created_at}
  const requests:{path:string,body:any}[]=[],invitations:any[]=[]
  let avatarBytes:Buffer|undefined
  // Override only the downloaded test document. Nothing is added to product code.
  await page.route('http://127.0.0.1:4173/**',async route=>{
    if(route.request().resourceType()!=='document') return route.continue()
    const original=await route.fetch()
    const body=(await original.text()).replace(/(window\.__NUXT__\.config=.*?)(<\/script>)/s, '$1;Object.assign(window.__NUXT__.config.public,{supabaseUrl:"https://account.example.test",supabaseKey:"sb_publishable_test_only",turnstile:{siteKey:"test-site-key"}});$2')
    await route.fulfill({response:original,body})
  })
  await page.addInitScript(({session,loggedIn})=>{if(loggedIn)localStorage.setItem('sb-account-auth-token',JSON.stringify(session))},{session,loggedIn:Boolean(group)})
  await page.route('https://challenges.cloudflare.com/turnstile/**',route=>route.fulfill({contentType:'text/javascript',body:`window.turnstile={render(el,options){window.solveAccountCaptcha=()=>options.callback('test-proof');window.expireAccountCaptcha=()=>options['expired-callback']();return 'test-widget'},reset(){},remove(){}};`}))
  await page.route('https://account.example.test/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range'}
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers})
    let body:any;try{body=request.postDataJSON()}catch{body=null}
    requests.push({path,body})
    const send=(value:unknown,status=200,extra={})=>route.fulfill({status,json:value,headers:{...headers,...extra}})
    if(path==='/auth/v1/token') return body.password==='incorrect' ? send({msg:'Invalid login credentials',error_code:'invalid_credentials'},400) : send(session)
    if(path==='/auth/v1/user') return send({user,...user})
    if(path==='/auth/v1/logout') return route.fulfill({status:204,headers})
    if(path==='/functions/v1/account-register') return send({userId})
    if(path==='/functions/v1/account-avatar') {avatarBytes=request.postDataBuffer()||undefined;profile.avatar_path=`${userId}/test.png`;return send({avatarPath:profile.avatar_path})}
    if(path.startsWith('/storage/')) return route.fulfill({status:404,headers})
    if(path==='/rest/v1/account_profiles') {
      if(request.method()==='PATCH') Object.assign(profile,body)
      return send(url.searchParams.has('id')?profile:[profile],200,{'content-range':'0-0/1'})
    }
    if(path==='/rest/v1/account_invitations') {
      if(request.method()==='POST') {const invite={id:'11111111-1111-4111-8111-111111111111',code:'ABC123',created_by:userId,created_at:user.created_at,updated_at:user.created_at,used_by:null,used_at:null,deleted_at:null,...body};invitations.push(invite);return send({id:invite.id},201)}
      if(request.method()==='PATCH') {Object.assign(invitations[0],body);return send({id:invitations[0].id})}
      return send(invitations,200,{'content-range':`0-${Math.max(0,invitations.length-1)}/${invitations.length}`})
    }
    if(path==='/rest/v1/rpc/account_delete_invitation') {invitations.splice(0);return route.fulfill({status:204,headers})}
    throw new Error(`Unexpected account request: ${request.method()} ${path}`)
  })
  return {requests,profile,avatar:()=>avatarBytes}
}
export async function captcha(page:Page) {await page.waitForFunction(()=>typeof (window as any).solveAccountCaptcha==='function');await page.evaluate(()=>(window as any).solveAccountCaptcha())}
