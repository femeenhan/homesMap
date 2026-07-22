// 도메인 API: idb.ts 위의 레이어. 렌더/편집은 이 API만 사용(IndexedDB를 직접 만지지 않음).
import * as idb from './idb'
import type { Table } from './idb'

type Row = { id: string; deleted_at?: string | null }

async function dirtyIds(table: Table): Promise<string[]> {
  return (await idb.get<string[]>('dirty', table)) ?? []
}

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
  // dirty: true면 sync 엔진이 나중에 서버로 밀어올릴 대상으로 표시
  async putLocal<T extends Row>(table: Table, row: T, { dirty }: { dirty: boolean }): Promise<void> {
    await idb.put(table, row)
    if (dirty) {
      const ids = await dirtyIds(table)
      if (!ids.includes(row.id)) await idb.put('dirty', [...ids, row.id], table)
    }
  },
  async dirtyRows<T extends Row>(table: Table): Promise<T[]> {
    const ids = new Set(await dirtyIds(table))
    if (ids.size === 0) return []
    return (await idb.getAll<T>(table)).filter(r => ids.has(r.id))
  },
  // 서버 push 성공 후 호출. 시그니처: clearDirty(table, ids) — 테이블별 dirty 집합이라 table 없이는 대상 스토어를 특정할 수 없음
  async clearDirty(table: Table, ids: string[]): Promise<void> {
    const remaining = (await dirtyIds(table)).filter(id => !ids.includes(id))
    await idb.put('dirty', remaining, table)
  },
  getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return idb.get<T>('meta', key)
  },
  setMeta(key: string, value: unknown): Promise<void> {
    return idb.put('meta', value, key)
  },
}
