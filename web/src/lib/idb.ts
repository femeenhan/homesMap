// Raw IndexedDB promise wrapper. No external deps.
// SSR-safe: `indexedDB` is only touched inside openDB(), called lazily on first request —
// never at module import time (Next.js imports this module on the server too).

export type Table = 'rooms' | 'storages' | 'items' | 'activity' | 'members'
type StoreName = Table | 'meta' | 'dirty' | 'photos'

export const TABLES: Table[] = ['rooms', 'storages', 'items', 'activity', 'members']
const DB_NAME = 'homes-map'
const DB_VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta') // out-of-line key: getMeta/setMeta(key, value)
        if (!db.objectStoreNames.contains('dirty')) db.createObjectStore('dirty') // out-of-line key `${table}:${id}` -> { table, id }, one entry per dirty row (atomic put/del, no read-modify-write)
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos') // key=itemId → Blob(평문)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function wrap<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

async function getStore(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB()
  return db.transaction(name, mode).objectStore(name)
}

export async function get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return wrap<T | undefined>((await getStore(name, 'readonly')).get(key))
}
export async function getAll<T>(name: StoreName): Promise<T[]> {
  return wrap<T[]>((await getStore(name, 'readonly')).getAll())
}
export async function put(name: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const s = await getStore(name, 'readwrite')
  await wrap(key === undefined ? s.put(value) : s.put(value, key))
}
export async function bulkPut(name: Table, values: unknown[]): Promise<void> {
  const s = await getStore(name, 'readwrite')
  await Promise.all(values.map(v => wrap(s.put(v))))
}
export async function del(name: StoreName, key: IDBValidKey): Promise<void> {
  await wrap((await getStore(name, 'readwrite')).delete(key))
}
export async function clear(name: StoreName): Promise<void> {
  await wrap((await getStore(name, 'readwrite')).clear())
}
