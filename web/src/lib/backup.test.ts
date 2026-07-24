import { describe, it, expect } from 'vitest'
import { buildBackup, parseBackup, toBase64, fromBase64, type BackupItem } from './backup'
import type { Room, Storage } from './types'

const room = { id: 'r1', family_id: 'f', name: '안방', x: 0, y: 0, w: 4, h: 3 } as Room
const storage = { id: 's1', family_id: 'f', room_id: 'r1', name: '옷장', x: 1, y: 1, compartments: [] } as unknown as Storage
const item: BackupItem = { id: 'i1', storage_id: 's1', compartment_id: null, name: '양말', memo: '겨울용', created_at: '2026-01-01T00:00:00Z' }

describe('base64', () => {
  it('바이트 왕복', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('buildBackup → parseBackup 왕복', () => {
  it('구조가 보존된다', () => {
    const text = buildBackup([room], [storage], [item], '2026-07-24T00:00:00Z')
    const b = parseBackup(text)
    expect(b.app).toBe('homes-map')
    expect(b.version).toBe(1)
    expect(b.rooms).toEqual([room])
    expect(b.storages).toEqual([storage])
    expect(b.items).toEqual([item])
  })
})

describe('parseBackup 검증', () => {
  it('JSON 아님 → throw', () => {
    expect(() => parseBackup('not json')).toThrow('JSON 형식이 아니에요')
  })
  it('앱 태그 다름 → throw', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, rooms: [], storages: [], items: [] }))).toThrow('그거거기 백업 파일이 아니에요')
  })
  it('버전 미지원 → throw', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'homes-map', version: 2, rooms: [], storages: [], items: [] }))).toThrow('지원하지 않는 백업 버전이에요')
  })
  it('배열 누락 → throw', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'homes-map', version: 1, rooms: [], items: [] }))).toThrow('백업 데이터가 손상됐어요')
  })
  it('필수 필드 누락 행 → throw', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'homes-map', version: 1, rooms: [{ id: 'r' }], storages: [], items: [] }))).toThrow('방 데이터가 손상됐어요')
    expect(() => parseBackup(JSON.stringify({ app: 'homes-map', version: 1, rooms: [], storages: [], items: [{ id: 'i', name: 'x' }] }))).toThrow('물건 데이터가 손상됐어요')
  })
})
