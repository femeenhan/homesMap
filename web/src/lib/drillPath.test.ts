import { describe, it, expect } from 'vitest'
import { resolvePath, type PathSeg } from './drillPath'
import type { Compartment, Room, Storage } from './types'

const room = (id: string) => ({ id, name: id } as Room)
const cmp = (id: string, parent_id: string | null = null): Compartment => ({ id, name: id, parent_id })
const storage = (id: string, room_id: string, compartments: Compartment[] = []) =>
  ({ id, room_id, compartments } as Storage)

const rooms = [room('r1')]
const storages = [storage('s1', 'r1', [cmp('c1'), cmp('c2', 'c1')])]
const seg = (kind: PathSeg['kind'], id: string): PathSeg => ({ kind, id })

describe('resolvePath', () => {
  it('전체 유효 경로를 해석한다 (방→수납장→칸→중첩칸)', () => {
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'c1'), seg('cmp', 'c2')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1', 'c1', 'c2'])
    const last = out[3]
    expect(last.kind).toBe('cmp')
    expect(last.kind === 'cmp' ? last.storage.id : null).toBe('s1')
  })

  it('빈 경로는 빈 배열', () => {
    expect(resolvePath([], rooms, storages)).toEqual([])
  })

  it('없는 방이면 빈 배열', () => {
    expect(resolvePath([seg('room', 'gone')], rooms, storages)).toEqual([])
  })

  it('수납장이 다른 방 소속이면 방까지만', () => {
    const moved = [storage('s1', 'r2', [])]
    const out = resolvePath([seg('room', 'r1'), seg('storage', 's1')], rooms, moved)
    expect(out.map((o) => o.id)).toEqual(['r1'])
  })

  it('삭제된 칸이면 수납장까지만', () => {
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'gone')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1'])
  })

  it('부모가 달라진 중첩 칸이면 그 앞까지만', () => {
    // c2의 실제 부모는 c1인데 수납장 직속으로 접근하면 잘린다
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'c2')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1'])
  })
})
