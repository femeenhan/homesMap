import type { DecItem, Storage, Room } from './types'
export type SearchHit = { itemId: string; storageId: string; roomName: string; storageName: string; memo: string }
export function searchItems(items: DecItem[], storages: Storage[], rooms: Room[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const sById = new Map(storages.map(s => [s.id, s]))
  const rById = new Map(rooms.map(r => [r.id, r]))
  return items.filter(i => i.name.toLowerCase().includes(q) || (i.memo && i.memo.toLowerCase().includes(q)))
    .slice(0, 8).map(i => {
      const s = sById.get(i.storage_id); const r = s ? rById.get(s.room_id) : undefined
      return { itemId: i.id, storageId: s?.id ?? '', roomName: r?.name ?? '?', storageName: s?.name ?? '?', memo: i.memo }
    })
}
