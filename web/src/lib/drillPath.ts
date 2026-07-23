import type { Compartment, Room, Storage } from './types'

export type PathSeg = { kind: 'room' | 'storage' | 'cmp'; id: string }
export type ResolvedSeg =
  | { kind: 'room'; id: string; room: Room }
  | { kind: 'storage'; id: string; storage: Storage }
  | { kind: 'cmp'; id: string; cmp: Compartment; storage: Storage }

// 드릴다운 경로를 현재 데이터에 대조해 유효한 접두사만 반환.
// 다른 기기 동기화로 노드가 사라지거나 옮겨져도 화면이 죽지 않고 가장 가까운 조상으로 복귀한다.
export function resolvePath(path: PathSeg[], rooms: Room[], storages: Storage[]): ResolvedSeg[] {
  const out: ResolvedSeg[] = []
  for (const seg of path) {
    const prev = out[out.length - 1]
    if (seg.kind === 'room') {
      if (prev) return out
      const room = rooms.find((r) => r.id === seg.id)
      if (!room) return out
      out.push({ kind: 'room', id: seg.id, room })
    } else if (seg.kind === 'storage') {
      if (!prev || prev.kind !== 'room') return out
      const storage = storages.find((s) => s.id === seg.id && s.room_id === prev.room.id)
      if (!storage) return out
      out.push({ kind: 'storage', id: seg.id, storage })
    } else {
      if (!prev || prev.kind === 'room') return out
      const storage = prev.storage
      const parentId = prev.kind === 'cmp' ? prev.cmp.id : null
      const cmp = (storage.compartments ?? []).find((c) => c.id === seg.id && (c.parent_id ?? null) === parentId)
      if (!cmp) return out
      out.push({ kind: 'cmp', id: seg.id, cmp, storage })
    }
  }
  return out
}
