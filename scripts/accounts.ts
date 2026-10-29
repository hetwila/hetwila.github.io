/** Operator-only provisioning. Never imported by Nuxt or published to Pages. */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { publicAccountConfig } from '../shared/account-config.ts'
import { readPublicContent } from './lib/content.ts'
import { commentRegistrySQL } from './lib/comment-registry.ts'

const required=['SUPABASE_PROJECT_ID','SUPABASE_URL','SUPABASE_KEY','SUPABASE_SECRET_KEY','SUPABASE_ACCESS_TOKEN','NUXT_PUBLIC_TURNSTILE_SITE_KEY','NUXT_TURNSTILE_SECRET_KEY']
const command=process.argv[2] || 'check'
function configuration() {
  const missing=required.filter(key=>!process.env[key])
  if(missing.length) throw new Error(`当前进程缺少环境变量：${missing.join(', ')}。请让 Codex 环境重新加载 Secrets，不要在聊天中粘贴密钥。`)
  const {supabaseUrl}=publicAccountConfig(process.env), ref=process.env.SUPABASE_PROJECT_ID!
  if(!/^[a-z]{20}$/.test(ref) || supabaseUrl!==`https://${ref}.supabase.co`) throw new Error('项目 ID 与 SUPABASE_URL 不匹配。')
  return {ref,url:supabaseUrl}
}
async function main() {
  if(command==='check') {
    for(const name of required) console.log(`${name}: ${process.env[name]?'已加载':'未加载'}`)
    configuration(); return
  }
  if(!['deploy','comments','bootstrap'].includes(command)) throw new Error('用法：pnpm accounts:check / accounts:deploy / comments:deploy / accounts:bootstrap <管理员邮箱>')
  const config=configuration()
  const origins=(process.env.ACCOUNT_ALLOWED_ORIGINS || 'https://hetwila.github.io').split(',').map(o=>o.trim())
  for(const origin of origins) { const url=new URL(origin); if(url.origin!==origin || (url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('ACCOUNT_ALLOWED_ORIGINS 必须是以逗号分隔的网站 Origin。') }
  async function management(path:string,method='GET',body?:unknown) {
    const result=await fetch(`https://api.supabase.com/v1/projects/${config.ref}${path}`,{method,headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
    if(!result.ok) throw new Error(`Supabase Management API ${method} ${path} 返回 ${result.status}。请检查项目权限与网络；响应内容未输出以避免泄露配置。`)
    const text=await result.text(); return text?JSON.parse(text):null
  }
  async function sql(query:string,readOnly=false) {return management(`/database/query${readOnly?'/read-only':''}`,'POST',{query})}
  async function cli(args:string[]) {
    await new Promise<void>((ok,fail)=>{
      const child=spawn('pnpm',['exec','supabase',...args],{stdio:'inherit',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}})
      child.on('error',()=>fail(new Error('无法启动 Supabase CLI。')))
      child.on('exit',code=>code===0?ok():fail(new Error(`Supabase CLI 未完成，退出码 ${code}。`)))
    })
  }
  if(command==='deploy' || command==='comments') {
    if(command==='deploy') {
    // Read first, then change only this feature's Auth settings and migrations.
    const existing=await management('/config/auth')
    if(existing.security_captcha_enabled) throw new Error('项目已启用 Auth 内置 CAPTCHA。当前设计只在注册 Edge Function 验证 Turnstile；请先核对现有登录客户端的 CAPTCHA 策略。')
    const settings={site_url:origins[0],disable_signup:true,external_email_enabled:true,mailer_autoconfirm:true,password_min_length:8,security_update_password_require_current_password:true,security_update_password_require_reauthentication:false}
    await management('/config/auth','PATCH',settings)
    const verified=await management('/config/auth')
    for(const [key,value] of Object.entries(settings)) if(verified[key]!==value) throw new Error(`Auth 配置 ${key} 未生效，已停止部署。`)
    console.log('Auth 设置已应用并复核。')
    }
    const history: {name?:string,version:string}[]=await management('/database/migrations')
    for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
      const name=file.slice(0,-4),query=readFileSync(`supabase/migrations/${file}`,'utf8')
      const marker=`hetwila-sha256: ${createHash('sha256').update(query).digest('hex')}`
      const applied=history.find(row=>row.name===name)
      if(applied) {
        const entry=await management(`/database/migrations/${applied.version}`)
        if(!entry.statements?.join('\n').includes(marker)) throw new Error(`迁移 ${file} 与已部署记录不一致，请新增迁移而不是覆盖历史。`)
        console.log(`已部署，跳过 ${file}`); continue
      }
      await management('/database/migrations','POST',{name,query:`-- ${marker}\n${query}`})
      console.log(`已应用 ${file}`)
    }
    const documents=await readPublicContent({wiki:resolve('content/wiki'),stories:resolve('content/stories')})
    await sql(commentRegistrySQL(documents))
    console.log('公开故事与评论区的 UID 关联已同步，现有开关和评论保持不变。')
    if(command==='deploy') {
    await management('/secrets','POST',[
      {name:'TURNSTILE_SECRET_KEY',value:process.env.NUXT_TURNSTILE_SECRET_KEY},
      {name:'ACCOUNT_SECRET_KEY',value:process.env.SUPABASE_SECRET_KEY},
      {name:'ACCOUNT_ALLOWED_ORIGINS',value:origins.join(',')},
    ])
    await cli(['functions','deploy','account-register','account-avatar','--project-ref',config.ref,'--use-api'])
    }
    // Use HTTPS like migrations; cloud executors may not have direct database TCP access.
    const advisors=await management('/advisors/security')
    if(!Array.isArray(advisors?.lints)) throw new Error('安全 advisors 返回格式异常，已停止部署。')
    for(const lint of advisors.lints) console.log(`安全 advisor：${lint.level} ${lint.name}`)
    if(advisors.lints.some((lint:{level:string})=>lint.level==='ERROR')) throw new Error('安全 advisors 检测到错误，请修复后重新部署。')
    if(command==='comments') { console.log('评论数据库部署与关联同步完成。'); return }
    const probe=await fetch(`${config.url}/functions/v1/account-avatar`,{method:'POST',headers:{apikey:process.env.SUPABASE_KEY!,Origin:origins[0]!}})
    if(probe.status!==401) throw new Error('头像接口的未登录访问验证未通过，请检查函数部署日志。')
    console.log('后端部署完成。Pages 构建仍需配置三个公开变量，详见 docs/用户系统.md。')
    return
  }
  const email=(process.argv[3] || '').trim().toLowerCase()
  if(!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) throw new Error('请传入首位管理员的邮箱。')
  const client=createClient(config.url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
  const existing=await sql("select count(*)::int as count from public.account_profiles where user_group='admin'",true)
  if(existing[0]?.count!==0) throw new Error('已有管理员；初始化流程不会修改或替换现有管理员。')
  // An unverified email is not evidence of ownership: never promote an existing account by email.
  const users=await sql(`select count(*)::int as count from auth.users where lower(email)='${email.replaceAll("'","''")}'`,true)
  if(users[0]?.count!==0) throw new Error('此邮箱已有账号。为防止提升冒用邮箱者的权限，已停止；请在受控环境中核对用户 UUID 后处理。')
  const stateDir=resolve('.secrets'); mkdirSync(stateDir,{recursive:true,mode:0o700})
  const path=resolve(stateDir,'first-admin.json'),password=randomBytes(24).toString('base64url')
  // Fail before creating anything if a previous bootstrap credential file exists.
  writeFileSync(path,JSON.stringify({email,password,projectId:config.ref,status:'pending'},null,2)+'\n',{mode:0o600,flag:'wx'})
  const {data:invite,error:inviteError}=await client.from('account_invitations').insert({valid_from:new Date(Date.now()-1000).toISOString(),valid_until:new Date(Date.now()+300000).toISOString(),note:'首位管理员初始化'}).select('code').single()
  if(inviteError) throw new Error('初始化邀请码创建失败；请检查部署及 .secrets/first-admin.json 的 pending 状态。')
  const {data:ticket,error:ticketError}=await client.rpc('account_prepare_registration',{p_email:email,p_nickname:'网站管理员',p_code:invite.code})
  if(ticketError) throw new Error('初始化注册票据失败。')
  const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{registration_ticket:ticket}})
  if(error || !data.user) throw new Error('管理员账号创建失败；初始化文件已保留，请核对 Auth 后再重试。')
  writeFileSync(path,JSON.stringify({email,password,userId:data.user.id,projectId:config.ref,status:'created'},null,2)+'\n',{mode:0o600})
  const {error:promote}=await client.from('account_profiles').update({user_group:'admin'}).eq('id',data.user.id).select('id').single()
  if(promote) throw new Error('账号已创建但尚未提升为 admin；请使用初始化文件中的 UUID 处理，不要重新注册。')
  writeFileSync(path,JSON.stringify({email,password,userId:data.user.id,projectId:config.ref,status:'admin'},null,2)+'\n',{mode:0o600})
  console.log(`首位管理员已创建。初始凭据仅保存在 ${path}（权限 0600），未写入日志。登录后请修改密码，并删除本地凭据文件。`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'账号配置失败。');process.exitCode=1})
