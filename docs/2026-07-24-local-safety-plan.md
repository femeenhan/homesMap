# 로컬 안전장치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-local-safety-design.md` 구현 — JSON 백업/복원 + 사진 IndexedDB 로컬 저장 + 저장소 보호(persist·설치 안내).

**Architecture:** (1) `lib/backup.ts` 순수 직렬화/검증(TDD), (2) idb v2 `photos` 스토어 + `store` 사진 API + page 사진 경로 교체·썸네일 배선, (3) 헤더 설정 시트(내보내기/가져오기/보호 상태) + 부팅 `persist()`.

**Tech Stack:** Next.js 16 / React 19 / vitest. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지(아이콘=Icon.tsx).
- 서버(Supabase) 접근 추가 금지 — 이 라운드로 page.tsx의 supabase 사용이 0이 되는 게 목표.
- 백업 형식은 스펙 §3 그대로: `{ app:'homes-map', version:1, exported_at, rooms, storages, items }`, items는 평문 `{id, storage_id, compartment_id, name, memo, created_at, photo?: base64}`.
- 사진 blob은 **평문** 저장(`photos` 스토어, key=itemId), `photo_path='local'` 마커.
- 가져오기 = 현재 familyId 데이터 **전체 교체**, 반드시 파싱 성공 후에만 삭제, 확인은 기존 `Modal` 재사용.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` 전부 통과.

---

### Task 1: lib/backup.ts — 직렬화/검증 (TDD)

**Files:**
- Create: `web/src/lib/backup.ts`, `web/src/lib/backup.test.ts`

**Interfaces:**
- Consumes: `Room`/`Storage`(`./types`)
- Produces(이후 태스크가 사용): `type BackupItem`, `type Backup`, `toBase64(bytes: Uint8Array): string`, `fromBase64(b64: string): Uint8Array`, `buildBackup(rooms, storages, items, exportedAt: string): string`, `parseBackup(text: string): Backup`(실패 시 한국어 메시지 Error throw)

- [ ] **Step 1: 실패하는 테스트 — `web/src/lib/backup.test.ts`**

```ts
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
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, rooms: [], storages: [], items: [] }))).toThrow('홈즈맵 백업 파일이 아니에요')
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
```

- [ ] **Step 2: 실패 확인** — `cd web && npm test` → FAIL(`Cannot find module './backup'`).

- [ ] **Step 3: `web/src/lib/backup.ts` 구현**

```ts
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
export function fromBase64(b64: string): Uint8Array {
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
```

- [ ] **Step 4: 통과 확인** — `npm test` → 신규 8개 포함 전부 PASS.
- [ ] **Step 5: tsc·lint 후 커밋**

```bash
git add web/src/lib/backup.ts web/src/lib/backup.test.ts
git commit -m "feat(backup): 백업 파일 v1 직렬화/검증 — 평문 JSON + base64 사진"
```

---

### Task 2: 사진 로컬 저장 + 썸네일 배선

**Files:**
- Modify: `web/src/lib/idb.ts`, `web/src/lib/store.ts`, `web/src/app/(app)/page.tsx`, `web/src/components/HomeTree.tsx`, `web/src/components/DrillDown.tsx`, `web/src/components/GridMap.tsx`

**Interfaces:**
- Consumes: 기존 `downscaleImage`(import 위치는 page.tsx에서 확인 — 반환형이 Uint8Array면 `new Blob([bytes], {type:'image/jpeg'})`, Blob이면 그대로 저장)
- Produces: `store.putPhoto(itemId: string, blob: Blob)` / `getPhoto(itemId): Promise<Blob | undefined>` / `delPhoto(itemId)`, `BootData.photoUrls: Record<string, string>`, `HomeTreeProps.photoUrls?: Record<string, string>`

- [ ] **Step 1: idb.ts — v2 `photos` 스토어**

`DB_VERSION`을 `2`로, `StoreName`에 `'photos'` 추가, `onupgradeneeded`를 증분-안전하게:

```ts
      req.onupgradeneeded = () => {
        const db = req.result
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
        if (!db.objectStoreNames.contains('dirty')) db.createObjectStore('dirty')
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos') // key=itemId → Blob(평문)
      }
```

- [ ] **Step 2: store.ts — 사진 API**

`store`에 추가:

```ts
  putPhoto(itemId: string, blob: Blob): Promise<void> { return idb.put('photos', blob, itemId) },
  getPhoto(itemId: string): Promise<Blob | undefined> { return idb.get<Blob>('photos', itemId) },
  delPhoto(itemId: string): Promise<void> { return idb.del('photos', itemId) },
```

`clearFamilyData`의 Promise.all에 `idb.clear('photos')` 추가.

- [ ] **Step 3: page.tsx — 업로드 → 로컬 저장**

`handleItemsAdd`의 사진 블록(supabase.storage.upload try/catch 전체)을 교체:

```tsx
      let photo_path: string | null = null
      if (draft.photoFile) {
        const bytes = await downscaleImage(draft.photoFile)
        await store.putPhoto(itemId, new Blob([bytes], { type: 'image/jpeg' }))
        photo_path = 'local'
      }
```

`photoFailed` 변수·"사진 업로드 실패" 토스트 제거. `createClient`/`encryptBytes` 등 이로써 죽는 import는 grep 후 제거(**page.tsx의 supabase 사용 0 확인**). 새 물건의 objectURL도 등록: 루프에서 `photo_path === 'local'`이면 `newUrls[itemId] = URL.createObjectURL(blob)`(blob은 putPhoto에 쓴 것 재사용) 모아서 `setData`에 `photoUrls: { ...d.photoUrls, ...newUrls }` 병합.

- [ ] **Step 4: page.tsx — photoUrls 로드·삭제 정리**

`BootData`에 `photoUrls: Record<string, string>` 추가. `loadLocalData`에서 `decItems` 계산 뒤:

```tsx
    // 사진 objectURL — 재로드 시 일괄 재생성(개별 revoke 생략: 세션 수명, 개인 규모라 무해)
    const photoUrls: Record<string, string> = {}
    await Promise.all(decItems.filter((it) => it.photo_path === 'local').map(async (it) => {
      const blob = await store.getPhoto(it.id)
      if (blob) photoUrls[it.id] = URL.createObjectURL(blob)
    }))
```

`setData({ ... , photoUrls })`. `handleItemDelete`에 소프트삭제 후 `await store.delPhoto(item.id)` + setData에서 `photoUrls`에서 해당 키 제거(revoke 포함).

- [ ] **Step 5: 썸네일 배선**

- `HomeTree.tsx`: `Props`에 `photoUrls?: Record<string, string>` 추가, `TreeStorage`의 `<CompartmentTree ...>`에 `photoUrls={p.photoUrls}` 전달(CompartmentTree는 기존 prop 보유).
- `DrillDown.tsx`: `ContainerScreen`의 `<ItemRow ...>`에 `photoUrl={p.photoUrls?.[it.id]}` 추가.
- `GridMap.tsx`: `StorageView`의 `<ItemRow ...>`에 동일 추가.
- page의 `treeProps`에 `photoUrls: data.photoUrls` 추가(HomeTree·DrillDown·GridMap 공용).

- [ ] **Step 6: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add -A && git commit -m "feat(photos): 사진 IndexedDB 로컬 저장 + 목록·드릴·맵 썸네일 — 서버 업로드 경로 제거"
```

---

### Task 3: 설정 시트(백업/복원·보호 안내) + persist()

**Files:**
- Create: `web/src/components/SettingsSheet.tsx`
- Modify: `web/src/components/Icon.tsx`(settings 아이콘), `web/src/components/Header.tsx`, `web/src/app/(app)/page.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 `buildBackup`/`parseBackup`/`toBase64`/`fromBase64`/`Backup`/`BackupItem`, Task 2 `store.putPhoto/getPhoto`, 기존 `Modal`
- Produces: `SettingsSheet({ onExport, onImportFile }: { onExport: () => void | Promise<void>; onImportFile: (f: File) => void | Promise<void> })` — 기어 버튼+시트 일체형, Header에서 렌더. page가 `handleExport`/`handleImportFile` 소유.

- [ ] **Step 1: Icon.tsx — settings 추가**

`IconName`에 `'settings'`, PATHS에:

```tsx
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
```

- [ ] **Step 2: `SettingsSheet.tsx` 생성**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

// 설정 시트: 백업 내보내기/가져오기 + 저장소 보호 상태·홈 화면 설치 안내.
export function SettingsSheet({ onExport, onImportFile }: {
  onExport: () => void | Promise<void>
  onImportFile: (f: File) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [open])

  return (
    <>
      <button type="button" className="hdr-settings" aria-label="설정" onClick={() => setOpen(true)}>
        <Icon name="settings" size={19} />
      </button>
      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet settings" onClick={(e) => e.stopPropagation()}>
            <div className="settings-title">설정</div>
            <div className="rowmenu-group">
              <button type="button" className="rowmenu-item" onClick={() => { setOpen(false); void onExport() }}>백업 파일 내보내기</button>
              <button type="button" className="rowmenu-item" onClick={() => fileRef.current?.click()}>백업 파일 가져오기</button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setOpen(false); void onImportFile(f) } }} />
            <div className="settings-note">
              데이터는 이 기기·브라우저에만 저장돼요.
              {persisted === true && ' 저장소 보호: 켜짐.'}
              {persisted === false && ' 저장소 보호: 꺼짐 — 브라우저가 오래 안 쓴 데이터를 정리할 수 있어요.'}
              <br />홈 화면에 추가하면 자동 정리를 막을 수 있어요 (사파리 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;).
            </div>
            <button type="button" className="rowmenu-item cancel" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Header.tsx 배선**

props에 `onExport: () => void | Promise<void>; onImportFile: (f: File) => void | Promise<void>` 추가, `SearchBar` 뒤에 `<SettingsSheet onExport={onExport} onImportFile={onImportFile} />`.

- [ ] **Step 4: page.tsx — export/import 핸들러 + persist + 확인 모달**

import: `import { buildBackup, parseBackup, toBase64, fromBase64, type Backup, type BackupItem } from '@/lib/backup'`, `import { Modal } from '@/components/Modal'`. 상태 `const [pendingImport, setPendingImport] = useState<Backup | null>(null)`.
`enterLocal` 끝에 `navigator.storage?.persist?.().catch(() => {})` (fire-and-forget).

```tsx
  async function handleExport() {
    if (!data) return
    const items: BackupItem[] = await Promise.all(data.decItems.map(async (it) => {
      const base: BackupItem = {
        id: it.id, storage_id: it.storage_id, compartment_id: it.compartment_id,
        name: it.name, memo: it.memo, created_at: it.created_at,
      }
      if (it.photo_path === 'local') {
        const blob = await store.getPhoto(it.id)
        if (blob) base.photo = toBase64(new Uint8Array(await blob.arrayBuffer()))
      }
      return base
    }))
    const json = buildBackup(data.rooms, data.storages, items, new Date().toISOString())
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `homes-map-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('백업 파일을 내려받았어요')
  }

  async function handleImportFile(file: File) {
    try {
      setPendingImport(parseBackup(await file.text()))
    } catch (e) {
      showToast(e instanceof Error ? e.message : '백업 파일을 읽지 못했어요')
    }
  }

  // 확인 후 실행: 현재 가족 데이터만 하드 삭제 → 파일 내용 재구성(재암호화·family_id 스탬프) → 리로드
  async function applyImport(backup: Backup) {
    if (!data) return
    const fdk = keys.getFDK()
    if (!fdk) return
    const now = new Date().toISOString()
    const [oldRooms, oldStorages, oldItems] = await Promise.all([
      store.getAll<Room>('rooms'), store.getAll<Storage>('storages'), store.getAll<Item>('items'),
    ])
    const mine = <T extends { family_id: string }>(rows: T[]) => rows.filter((r) => r.family_id === data.familyId)
    await Promise.all([
      ...mine(oldItems).map(async (it) => { await store.removeRow('items', it.id); await store.delPhoto(it.id) }),
      ...mine(oldRooms).map((r) => store.removeRow('rooms', r.id)),
      ...mine(oldStorages).map((s) => store.removeRow('storages', s.id)),
    ])
    for (const r of backup.rooms) await store.putLocal('rooms', { ...r, family_id: data.familyId, updated_at: now, deleted_at: null }, { dirty: false })
    for (const s of backup.storages) await store.putLocal('storages', { ...s, family_id: data.familyId, updated_at: now, deleted_at: null }, { dirty: false })
    for (const it of backup.items) {
      let photo_path: string | null = null
      if (it.photo) {
        await store.putPhoto(it.id, new Blob([fromBase64(it.photo)], { type: 'image/jpeg' }))
        photo_path = 'local'
      }
      const row: Item = {
        id: it.id, family_id: data.familyId, storage_id: it.storage_id,
        compartment_id: it.compartment_id ?? null,
        enc_name: await encryptField(fdk, it.name),
        enc_memo: it.memo ? await encryptField(fdk, it.memo) : null,
        emoji: '📦', photo_path, created_by: data.userId,
        created_at: it.created_at, updated_at: now, deleted_at: null,
      }
      await store.putLocal('items', row, { dirty: false })
    }
    await loadLocalData(data.familyId, data.userId, false)
    showToast('백업을 가져왔어요')
  }
```

`store.removeRow(table, id)`가 없으므로 `store.ts`에 추가(**이 태스크에서**):

```ts
  removeRow(table: Table, id: string): Promise<void> { return idb.del(table, id) },
```

JSX(토스트 앞)에 확인 모달:

```tsx
      {pendingImport && (
        <Modal title="백업 가져오기"
          message={`현재 데이터를 백업 파일 내용(방 ${pendingImport.rooms.length} · 수납장 ${pendingImport.storages.length} · 물건 ${pendingImport.items.length})으로 교체합니다. 되돌릴 수 없어요.`}
          okText="교체"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => { const b = pendingImport; setPendingImport(null); if (b) void applyImport(b) }} />
      )}
```

`<Header ...>`에 `onExport={handleExport} onImportFile={handleImportFile}` 추가.

- [ ] **Step 5: globals.css**

헤더 섹션에 추가:

```css
.hdr-settings{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--panel);color:var(--ink-soft);flex-shrink:0}
.hdr-settings:hover{background:var(--accent-soft);color:var(--accent-ink)}
.sheet.settings{padding:16px 16px calc(16px + env(safe-area-inset-bottom))}
.settings-title{font-size:16px;font-weight:700;margin-bottom:12px}
.settings-note{font-size:12.5px;line-height:1.6;color:var(--ink-soft);padding:12px 4px 4px}
```

- [ ] **Step 6: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A && git commit -m "feat(backup): 설정 시트 — 백업 내보내기/가져오기(전체 교체) + storage.persist + 설치 안내"
```

---

### Task 4: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트 재확인.
2. 최종 리뷰(opus) — 교차: import 교체가 파싱 실패 시 데이터 무손상인지, 사진 add/delete/import/export 왕복, photoUrls 누수 규모, idb v1→v2 업그레이드 안전성, page.tsx supabase 사용 0.
3. push, 원장·메모리 기록, 수동 확인 안내.
