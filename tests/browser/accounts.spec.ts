import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const userId='01234567-1234-4234-8234-012345678901'
async function accountFixture(page:Page,group?:'guest'|'admin') {
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
async function captcha(page:Page) {await page.waitForFunction(()=>typeof (window as any).solveAccountCaptcha==='function');await page.evaluate(()=>(window as any).solveAccountCaptcha())}

test('registration validates password confirmation and CAPTCHA, then returns to the original article',async({page})=>{
  const api=await accountFixture(page)
  await page.goto('/wiki/禁制')
  await page.getByRole('link',{name:'用户中心',exact:true}).click()
  await page.getByRole('link',{name:'邀请码注册',exact:true}).click()
  await page.getByLabel('邮箱',{exact:true}).fill('reader@example.test')
  await page.getByLabel('昵称',{exact:true}).fill('重复昵称')
  await page.getByLabel('密码',{exact:true}).fill('Password123!')
  await page.getByLabel('再次输入密码',{exact:true}).fill('Mismatch123!')
  await page.getByLabel('邀请码',{exact:true}).fill('abc123')
  await page.getByLabel('昵称',{exact:true}).click()
  const submit=page.getByRole('button',{name:'注册并继续',exact:true})
  await expect(submit).toBeDisabled();await captcha(page);await expect(submit).toBeEnabled()
  await submit.click();await expect(page.getByText('两次输入的密码不一致。')).toBeVisible()
  expect(api.requests.some(r=>r.path==='/functions/v1/account-register')).toBe(false)
  await page.getByLabel('再次输入密码',{exact:true}).fill('Password123!');await submit.click()
  // The returnTo query already contains /wiki/ before navigation completes.
  await expect(page).toHaveURL(url=>decodeURIComponent(url.pathname)==='/wiki/禁制')
  expect(api.requests.find(r=>r.path==='/functions/v1/account-register')?.body).toMatchObject({inviteCode:'ABC123',turnstileToken:'test-proof',nickname:'重复昵称'})
})
test('login rejects invalid credentials and blocks an external return URL',async({page})=>{
  await accountFixture(page)
  await page.goto('/account/login?returnTo=https://evil.example')
  await page.getByLabel('邮箱',{exact:true}).fill('reader@example.test')
  await page.getByLabel('密码',{exact:true}).fill('incorrect')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page.getByText('登录失败，请检查邮箱和密码。')).toBeVisible()
  await page.getByLabel('密码',{exact:true}).fill('Password123!')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
})
test('a guest can edit their profile, crop a rectangular image and supply the old password',async({page})=>{
  const api=await accountFixture(page,'guest');await page.goto('/account')
  await expect(page.getByText('用户组：guest')).toBeVisible()
  await page.getByLabel('昵称',{exact:true}).fill('修改后的昵称')
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=400;const ctx=c.getContext('2d')!;ctx.fillStyle='#6e7b91';ctx.fillRect(0,0,640,400);return c.toDataURL('image/png').split(',')[1]!})
  await page.locator('input[type=file]').setInputFiles({name:'rectangle.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})
  await expect(page.getByRole('button',{name:'保存资料',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'确认裁剪',exact:true}).click()
  await expect(page.getByRole('button',{name:'保存资料',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'保存资料',exact:true}).click()
  await expect(page.getByText('个人资料已保存',{exact:true})).toBeVisible()
  const bytes=api.avatar()!;expect(bytes.readUInt32BE(16)).toBe(256);expect(bytes.readUInt32BE(20)).toBe(256)
  const center=await page.evaluate(async base64=>{const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return [...ctx.getImageData(128,128,1,1).data]},bytes.toString('base64'))
  expect(center).toEqual([110,123,145,255])
  expect(api.profile.nickname).toBe('修改后的昵称')
  await page.getByLabel('当前密码',{exact:true}).fill('Old-password123!')
  await page.getByLabel('新密码',{exact:true}).fill('New-password123!')
  await page.getByLabel('再次输入新密码',{exact:true}).fill('New-password123!')
  await page.getByRole('button',{name:'修改密码',exact:true}).click()
  await expect(page.getByText('密码已修改',{exact:true})).toBeVisible()
  expect(api.requests.find(r=>r.path==='/auth/v1/user'&&r.body?.password)?.body.current_password).toBe('Old-password123!')
  await page.goto('/account/admin');await expect(page.getByText('仅 admin 用户组可以访问管理中心。')).toBeVisible()
})
test('admin manages invitations and reads the user list',async({page})=>{
  await accountFixture(page,'admin');await page.goto('/account/admin')
  await page.getByRole('button',{name:'创建邀请码',exact:true}).click()
  await page.getByLabel('备注',{exact:true}).fill('测试邀请')
  await page.getByRole('button',{name:'保存邀请码',exact:true}).click()
  await expect(page.getByRole('cell',{name:'ABC123',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'详情／修改',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText(userId)
  await page.getByLabel('备注',{exact:true}).fill('修改备注')
  await page.getByRole('button',{name:'保存邀请码',exact:true}).click()
  await expect(page.getByRole('cell',{name:'修改备注',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'删除',exact:true}).click()
  await page.getByRole('button',{name:'确认删除',exact:true}).click()
  await expect(page.getByRole('cell',{name:'ABC123',exact:true})).toHaveCount(0)
  await page.getByRole('tab',{name:'注册用户',exact:true}).click()
  await expect(page.getByRole('cell',{name:'reader@example.test',exact:true})).toBeVisible()
})
for(const colorScheme of ['light','dark'] as const) test(`account forms fit mobile and remain accessible in ${colorScheme} mode`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme})
  await accountFixture(page);await page.goto('/account/register');await captcha(page)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const accessibility=await new AxeBuilder({page}).analyze()
  expect(accessibility.violations).toEqual([])
  await page.screenshot({path:test.info().outputPath(`account-${colorScheme}.png`),fullPage:true})
})

for (const mobile of [false, true]) test.describe(`avatar cropping on ${mobile ? 'touchscreen' : 'desktop'}`, () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile })
  for (const colorScheme of ['light', 'dark'] as const) test(`draw, resize and export the selected pixels in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    const api = await accountFixture(page, 'guest')
    await page.goto('/account')
    const width = mobile ? 200 : 640, height = mobile ? 320 : 400
    const png = await page.evaluate(({ width, height }) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#000'; ctx.fillRect(width / 2, 0, width / 2, height / 2)
      ctx.fillStyle = '#2060e0'; ctx.fillRect(width / 2, height / 2, width / 2, height / 2)
      return c.toDataURL('image/png').split(',')[1]!
    }, { width, height })
    await page.locator('input[type=file]').setInputFiles({ name: 'quadrants.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
    const area = page.getByRole('group', { name: '头像裁剪区域', exact: true })
    const selection = page.locator('cropper-selection'), image = page.locator('cropper-image')
    await expect(page.getByRole('button', { name: '确认裁剪', exact: true })).toBeEnabled()
    await area.scrollIntoViewIfNeeded()
    await area.locator('..').screenshot({ path: test.info().outputPath(`crop-${colorScheme}-initial.png`) })

    // Real pointer/touch gestures: no direct calls to Cropper's selection methods.
    const cdp = mobile ? await page.context().newCDPSession(page) : undefined
    async function drag(x: number, y: number, endX: number, endY: number) {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x + (endX - x) * step / 12, y: y + (endY - y) * step / 12 }]
        })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(x, y); await page.mouse.down()
        await page.mouse.move(endX, endY, { steps: 12 }); await page.mouse.up()
      }
    }
    async function drawBlue() {
      await area.scrollIntoViewIfNeeded()
      const b = (await image.boundingBox())!, size = Math.min(b.width, b.height) * 0.22
      await drag(b.x + b.width * 0.58, b.y + b.height * 0.6, b.x + b.width * 0.58 + size, b.y + b.height * 0.6 + size)
      const s = (await selection.boundingBox())!
      expect(Math.abs(s.width - size)).toBeLessThan(3)
      expect(Math.abs(s.width - s.height)).toBeLessThan(1)
      await expect(page.getByRole('button', { name: '重新框选', exact: true })).toHaveAttribute('aria-pressed', 'false')
    }
    await drawBlue()
    // Drawing also works upward/leftward, even when starting inside an existing selection.
    await page.getByRole('button', { name: '重新框选', exact: true }).click()
    await area.scrollIntoViewIfNeeded()
    const previousSelection = (await selection.boundingBox())!, reverseSize = previousSelection.width
    const reverseX = previousSelection.x + previousSelection.width / 2, reverseY = previousSelection.y + previousSelection.height / 2
    await drag(reverseX, reverseY, reverseX - reverseSize, reverseY - reverseSize)
    const reversed = (await selection.boundingBox())!
    expect(Math.abs(reversed.x - (reverseX - reverseSize))).toBeLessThan(3)
    expect(Math.abs(reversed.y - (reverseY - reverseSize))).toBeLessThan(3)
    expect(Math.abs(reversed.width - reverseSize)).toBeLessThan(3)
    let s = (await selection.boundingBox())!
    await drag(s.x + s.width / 2, s.y + s.height / 2, s.x + s.width / 2 - 12, s.y + s.height / 2 - 8)
    const moved = (await selection.boundingBox())!
    expect(moved.x).toBeCloseTo(s.x - 12, 0); expect(moved.width).toBeCloseTo(s.width, 0)
    const corner = (await page.locator('cropper-handle[action="se-resize"]').boundingBox())!
    await drag(corner.x + corner.width / 2, corner.y + corner.height / 2, corner.x + corner.width / 2 - 10, corner.y + corner.height / 2 - 10)
    expect((await selection.boundingBox())!.width).toBeLessThan(moved.width - 5)

    // Slider supports continuous pointing and keyboard input, including maximum size at an edge.
    const slider = page.getByRole('slider', { name: '选框大小', exact: true })
    await slider.focus(); await slider.press('End')
    await expect(slider).toHaveAttribute('aria-valuenow', '100')
    let b = (await image.boundingBox())!
    s = (await selection.boundingBox())!
    expect(s.width).toBeCloseTo(Math.min(b.width, b.height), 0)
    expect(s.x).toBeGreaterThanOrEqual(b.x - 1); expect(s.y).toBeGreaterThanOrEqual(b.y - 1)
    expect(s.x + s.width).toBeLessThanOrEqual(b.x + b.width + 1)
    expect(s.y + s.height).toBeLessThanOrEqual(b.y + b.height + 1)
    const thumb = (await slider.boundingBox())!, track = (await slider.locator('xpath=../..').boundingBox())!
    await drag(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2, track.x + track.width / 2, thumb.y + thumb.height / 2)
    const percent = Number(await slider.getAttribute('aria-valuenow'))
    expect(percent).toBeGreaterThan(40); expect(percent).toBeLessThan(60)
    await slider.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuenow', String(percent - 1))

    // Focus stays local: crop shortcuts must not consume the slider's arrow keys.
    await area.focus()
    const beforeKey = (await selection.boundingBox())!
    await area.press('-')
    expect((await selection.boundingBox())!.width).toBeLessThan(beforeKey.width)
    await area.press('+')
    expect((await selection.boundingBox())!.width).toBeCloseTo(beforeKey.width, 0)
    await area.press('ArrowLeft')
    expect((await selection.boundingBox())!.x).toBeCloseTo(beforeKey.x - 1, 0)
    if (!mobile) {
      s = (await selection.boundingBox())!
      await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
      await page.mouse.wheel(0, 120)
      await expect.poll(async () => (await selection.boundingBox())!.width).not.toBe(s.width)
    }
    await page.getByRole('button', { name: '重新框选', exact: true }).click()
    await drawBlue()
    if (mobile) {
      // Rotating/resizing must keep the same source pixels selected.
      await page.setViewportSize({ width: 600, height: 844 })
      await expect.poll(async () => {
        const i = (await image.boundingBox())!, crop = (await selection.boundingBox())!
        return (crop.x - i.x) / i.width
      }).toBeCloseTo(0.58, 1)
    }
    await area.locator('..').screenshot({ path: test.info().outputPath(`crop-${colorScheme}-selected.png`) })
    expect((await new AxeBuilder({ page }).include('.avatar-editor').analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '确认裁剪', exact: true }).click()
    await page.getByRole('button', { name: '保存资料', exact: true }).click()
    await expect(page.getByText('个人资料已保存', { exact: true })).toBeVisible()
    const bytes = api.avatar()!, expectedSize = Math.min(width, height) * 0.22
    // A small crop stays small, never upscaled to 256 pixels.
    expect(Math.abs(bytes.readUInt32BE(16) - expectedSize)).toBeLessThan(3)
    expect(bytes.readUInt32BE(20)).toBe(bytes.readUInt32BE(16))
    const pixels = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode()
      const c = document.createElement('canvas'); c.width = c.height = image.naturalWidth
      const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0)
      return [1, Math.floor(c.width / 2), c.width - 2].map(p => [...ctx.getImageData(p, p, 1, 1).data])
    }, bytes.toString('base64'))
    expect(pixels).toEqual([[32, 96, 224, 255], [32, 96, 224, 255], [32, 96, 224, 255]])
    await cdp?.detach()
  })
})
