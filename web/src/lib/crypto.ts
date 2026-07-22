const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const b64url = (buf: ArrayBuffer | Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/'))

const AES = { name: 'AES-GCM', length: 256 } as const

export async function generateFDK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt'])
}

export async function encryptField(fdk: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fdk, enc.encode(plaintext))
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) })
}
export async function decryptField(fdk: CryptoKey, blob: string): Promise<string> {
  const { iv, ct } = JSON.parse(blob)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, fdk, unb64(ct))
  return dec.decode(pt)
}

async function deriveWrapKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' },
    base, AES, false, ['encrypt', 'decrypt']
  )
}
export async function wrapFDK(fdk: CryptoKey, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const wrapKey = await deriveWrapKey(passphrase, salt)
  const raw = await crypto.subtle.exportKey('raw', fdk)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, raw)
  return JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) })
}
export async function unwrapFDK(wrapped: string, passphrase: string): Promise<CryptoKey> {
  const { salt, iv, ct } = JSON.parse(wrapped)
  const wrapKey = await deriveWrapKey(passphrase, unb64(salt))
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, wrapKey, unb64(ct))
  return crypto.subtle.importKey('raw', raw, AES, true, ['encrypt', 'decrypt'])
}

// 초대 프래그먼트 / 복구코드용 (URL-safe)
export async function exportFDKCode(fdk: CryptoKey): Promise<string> {
  return b64url(await crypto.subtle.exportKey('raw', fdk))
}
export async function importFDKCode(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64url(code), AES, true, ['encrypt', 'decrypt'])
}

// 사진 바이트: iv(12) + 암호문을 이어붙인 Uint8Array 반환/역변환
export async function encryptBytes(fdk: CryptoKey, bytes: ArrayBuffer): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fdk, bytes)
  return new Blob([iv, new Uint8Array(ct)])
}
export async function decryptBytes(fdk: CryptoKey, packed: ArrayBuffer): Promise<ArrayBuffer> {
  const all = new Uint8Array(packed)
  const iv = all.slice(0, 12), ct = all.slice(12)
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fdk, ct)
}
