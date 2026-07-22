import { describe, it, expect } from 'vitest'
import { searchItems } from './search'
import type { DecItem, Storage, Room } from './types'

const room = (id: string, name: string): Room => ({
  id, family_id: 'f1', name, x: 0, y: 0, w: 100, h: 100, color_index: 0, updated_at: '2026-01-01', deleted_at: null,
})
const storageRow = (id: string, roomId: string, name: string): Storage => ({
  id, family_id: 'f1', room_id: roomId, type: 'drawer', name, x: 0, y: 0, updated_at: '2026-01-01', deleted_at: null,
})
const item = (id: string, storageId: string, name: string, memo: string): DecItem => ({
  id, family_id: 'f1', storage_id: storageId, emoji: '📦', photo_path: null,
  created_by: 'u1', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null, name, memo,
})

describe('searchItems', () => {
  const rooms = [room('r1', '거실')]
  const storages = [storageRow('s1', 'r1', '서랍장')]
  const items = [
    item('i1', 's1', '손톱깎이', ''),
    item('i2', 's1', '참기름', '문쪽 아래 칸'),
  ]

  it('이름·메모 부분일치', () => {
    expect(searchItems(items, storages, rooms, '손톱').map(h => h.itemId)).toEqual(['i1'])
    expect(searchItems(items, storages, rooms, '아래').map(h => h.itemId)).toEqual(['i2'])
  })

  it('위치(방·수납장) 정보 포함', () => {
    const hits = searchItems(items, storages, rooms, '손톱')
    expect(hits[0]).toMatchObject({ storageId: 's1', roomName: '거실', storageName: '서랍장' })
  })

  it('빈 쿼리는 빈 배열', () => {
    expect(searchItems(items, storages, rooms, '')).toEqual([])
    expect(searchItems(items, storages, rooms, '   ')).toEqual([])
  })
})
