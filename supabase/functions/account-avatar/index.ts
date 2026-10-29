import { decode, encode } from 'npm:fast-png@8.0.0'
import { authenticatedUser, boundedBody, handler, HttpError, service } from '../_shared/http.ts'
import { boundedPng } from '../_shared/png.ts'
export const avatar = handler(async request => {
  const user = await authenticatedUser(request)
  const client = service()
  const { data: profile, error: profileError } = await client.from('account_profiles').select('avatar_path').eq('id', user.id).single()
  if (profileError) throw profileError
  const bytes = await boundedBody(request, 524288)
  let path: string | null = null
  if (bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    // Bound dimensions before decoding to prevent decompression bombs.
    if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(12) !== 0x49484452) throw new HttpError(400, 'INVALID_IMAGE', '头像必须是裁剪后的 PNG 图片。')
    const width = view.getUint32(16), height = view.getUint32(20)
    if (!width || width !== height || width > 256) throw new HttpError(400, 'INVALID_DIMENSIONS', '头像必须是最大256×256像素的正方形。')
    let clean: Uint8Array
    try {
      const image = decode(boundedPng(bytes, width, height), { checkCrc: true })
      if (image.width !== width || image.height !== height || image.depth !== 8) throw new Error('Unsupported image')
      clean = encode(image) // Strip uploaded metadata and any appended data.
    } catch { throw new HttpError(400, 'INVALID_IMAGE', '图片无法读取，请重新选择。') }
    path = `${user.id}/${crypto.randomUUID()}.png`
    const { error } = await client.storage.from('account-avatars').upload(path, clean, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
    if (error) throw error
  }
  const { error } = await client.from('account_profiles').update({ avatar_path: path }).eq('id', user.id)
  if (error) {
    if (path) await client.storage.from('account-avatars').remove([path])
    throw error
  }
  if (profile.avatar_path) await client.storage.from('account-avatars').remove([profile.avatar_path])
  return { avatarPath: path }
})
if (import.meta.main) Deno.serve(avatar)
