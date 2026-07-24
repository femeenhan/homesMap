import type { Room, Storage } from './types'

// 백업 파일 v1 — 평문 JSON(로컬 키는 공개 고정값이라 암호화가 무의미). 사진은 base64 인라인.
export type BackupItem = {
  id: string; storage_id: string; compartment_id: string | null
  name: string; memo: string; created_at: string; photo?: string
}
export type Backup = {
  app: 'homes-map'; version: 1; exported_at: string
  rooms: Room[]; storages: Storage[]; items: BackupItem[]
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function buildBackup(rooms: Room[], storages: Storage[], items: BackupItem[], exportedAt: string): string {
  const b: Backup = { app: 'homes-map', version: 1, exported_at: exportedAt, rooms, storages, items }
  return JSON.stringify(b, null, 2)
}

export function parseBackup(text: string): Backup {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('JSON 형식이 아니에요') }
  const b = raw as Partial<Backup>
  if (b?.app !== 'homes-map') throw new Error('홈즈맵 백업 파일이 아니에요')
  if (b.version !== 1) throw new Error('지원하지 않는 백업 버전이에요')
  if (!Array.isArray(b.rooms) || !Array.isArray(b.storages) || !Array.isArray(b.items)) throw new Error('백업 데이터가 손상됐어요')
  for (const r of b.rooms) if (typeof r?.id !== 'string' || typeof r?.name !== 'string') throw new Error('방 데이터가 손상됐어요')
  for (const s of b.storages) if (typeof s?.id !== 'string' || typeof s?.name !== 'string' || typeof s?.room_id !== 'string') throw new Error('수납장 데이터가 손상됐어요')
  for (const it of b.items) if (typeof it?.id !== 'string' || typeof it?.name !== 'string' || typeof it?.storage_id !== 'string') throw new Error('물건 데이터가 손상됐어요')
  return b as Backup
}
