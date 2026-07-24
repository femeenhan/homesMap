// 도메인 API: idb.ts 위의 레이어. 렌더/편집은 이 API만 사용(IndexedDB를 직접 만지지 않음).
import * as idb from './idb'
import type { Table } from './idb'

type Row = { id: string; deleted_at?: string | null }
type DirtyEntry = { table: Table; id: string }
const dirtyKey = (table: Table, id: string) => `${table}:${id}`

export const store = {
  getAll<T extends Row>(table: Table): Promise<T[]> {
    return idb.getAll<T>(table)
  },
  bulkPut<T extends Row>(table: Table, rows: T[]): Promise<void> {
    return idb.bulkPut(table, rows)
  },
  async allActive<T extends Row>(table: Table): Promise<T[]> {
    return (await idb.getAll<T>(table)).filter(r => r.deleted_at == null)
  },
  // dirty: true면 sync 엔진이 나중에 서버로 밀어올릴 대상으로 표시.
  // row당 하나의 dirty 엔트리(key=`${table}:${id}`)에 단일 put — read-modify-write 없이 원자적
  async putLocal<T extends Row>(table: Table, row: T, { dirty }: { dirty: boolean }): Promise<void> {
    await idb.put(table, row)
    if (dirty) await idb.put('dirty', { table, id: row.id } satisfies DirtyEntry, dirtyKey(table, row.id))
  },
  async dirtyRows<T extends Row>(table: Table): Promise<T[]> {
    const entries = await idb.getAll<DirtyEntry>('dirty')
    const ids = new Set(entries.filter(e => e.table === table).map(e => e.id))
    if (ids.size === 0) return []
    return (await idb.getAll<T>(table)).filter(r => ids.has(r.id))
  },
  // 서버 push 성공 후 호출. row별 엔트리를 개별 delete — 다른 row의 동시 putLocal과 경합 없음
  async clearDirty(table: Table, ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => idb.del('dirty', dirtyKey(table, id))))
  },
  getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return idb.get<T>('meta', key)
  },
  setMeta(key: string, value: unknown): Promise<void> {
    return idb.put('meta', value, key)
  },
  putPhoto(itemId: string, blob: Blob): Promise<void> {
    return idb.put('photos', blob, itemId)
  },
  getPhoto(itemId: string): Promise<Blob | undefined> {
    return idb.get<Blob>('photos', itemId)
  },
  delPhoto(itemId: string): Promise<void> {
    return idb.del('photos', itemId)
  },
  // 계정 전환 감지 시 사용: 5개 데이터 스토어 + 사진 스토어를 비우고 lastSync만 리셋.
  // wrappedKey는 지우지 않음 — 현재 잠금해제된 세션이 소유한 값이라 계정 전환과 무관.
  async clearFamilyData(): Promise<void> {
    await Promise.all([...idb.TABLES.map((t) => idb.clear(t)), idb.clear('photos')])
    await idb.del('meta', 'lastSync')
  },
}
