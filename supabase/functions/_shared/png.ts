import { inflateSync } from 'node:zlib'

/** Bound decompression before the image library runs, and skip compressed metadata. */
export function boundedPng(bytes: Uint8Array, width: number, height: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(8) !== 13 || bytes[24] !== 8) throw new Error('Expected an 8-bit PNG')
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)], compressed: Uint8Array[] = []
  let end = false
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), next = offset + length + 12
    if (next > bytes.length) throw new Error('Truncated PNG chunk')
    const type = view.getUint32(offset + 4)
    if (type === 0x49484452 && offset !== 8) throw new Error('Duplicate PNG header')
    // IHDR, IDAT, IEND, PLTE and tRNS are sufficient to recover pixels.
    if ([0x49484452, 0x49444154, 0x49454e44, 0x504c5445, 0x74524e53].includes(type)) chunks.push(bytes.subarray(offset, next))
    else if (!(bytes[offset + 4]! & 0x20)) throw new Error('Unknown critical PNG chunk')
    if (type === 0x504c5445 && length > 768) throw new Error('Invalid PNG palette')
    if (type === 0x74524e53 && length > 256) throw new Error('Invalid PNG transparency')
    if (type === 0x49444154) compressed.push(bytes.subarray(offset + 8, offset + 8 + length))
    if (type === 0x49454e44) { if (length !== 0) throw new Error('Invalid PNG end'); end = true; break }
    offset = next
  }
  if (!end || !compressed.length) throw new Error('Incomplete PNG')
  // RGBA pixels plus an upper bound on filter bytes for all Adam7 passes.
  // Header dimensions alone do not constrain the size of an IDAT stream.
  inflateSync(join(compressed), { maxOutputLength: width * height * 4 + height * 7 + 7 })
  return join(chunks)
}
function join(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}
