# 물건 상세 시트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-25-item-sheet-design.md` — 물건 행 탭→상세 시트(사진 크게·이름/메모 blur 저장·사진 변경/삭제·브레드크럼·삭제).

**Architecture:** 신규 `ItemSheet.tsx`(.sheet 재사용, Modal은 형제 렌더로 버블 차단) + `ItemRow.onOpen` + `HomeTreeProps.onOpenItem/onUpdateItem류` + page `openItemId`(소실 시 자동 닫힘)·`handleItemUpdate`(재암호화+사진 blob 교체/삭제+objectURL 정리).

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 저장 패턴 기존 그대로(putLocal dirty→낙관 setData→push catch 토스트). maxLength 이름 30·메모 40 유지.
- Modal은 `.sheet-wrap` **밖**(fragment 형제)에 렌더 — 안에 넣으면 클릭 버블로 시트가 닫힘.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`.

---

### Task 1: ItemSheet + 배선 + handleItemUpdate

**Files:**
- Create: `web/src/components/ItemSheet.tsx`
- Modify: `web/src/components/CompartmentTree.tsx`(ItemRow onOpen), `web/src/components/HomeTree.tsx`(Props+ItemRow 2곳), `web/src/app/(app)/page.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Produces:
  - `ItemSheet({ item, photoUrl, rooms, storages, onUpdate, onDelete, onClose })` — `onUpdate(patch: { name?: string; memo?: string; photoFile?: File | null })`(File=교체/추가, null=삭제, undefined=무변경)
  - `ItemRow`에 `onOpen?: () => void`(행 탭·Enter, 휴지통은 stopPropagation 래핑)
  - `HomeTreeProps`에 `onOpenItem?: (id: string) => void`
  - page: `handleItemUpdate(item: DecItem, patch)` — 재암호화·photo_path('local'/null)·photoUrls revoke/생성

- [ ] **Step 1: ItemSheet.tsx 생성**

```tsx
'use client'

import { useState } from 'react'
import type { DecItem, Room, Storage } from '@/lib/types'
import { Icon } from './Icon'
import { Modal } from './Modal'

// 물건 상세 시트: 사진 크게 + 이름·메모 blur 저장 + 사진 변경/삭제 + 위치 브레드크럼 + 삭제
export function ItemSheet({ item, photoUrl, rooms, storages, onUpdate, onDelete, onClose }: {
  item: DecItem; photoUrl?: string; rooms: Room[]; storages: Storage[]
  onUpdate: (patch: { name?: string; memo?: string; photoFile?: File | null }) => void | Promise<void>
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(item.name)
  const [memo, setMemo] = useState(item.memo)
  const [confirming, setConfirming] = useState(false)

  // 위치 브레드크럼: 방 › 수납장 › 칸 체인(칸은 parent 역추적)
  const storage = storages.find((s) => s.id === item.storage_id)
  const room = storage ? rooms.find((r) => r.id === storage.room_id) : undefined
  const path: string[] = []
  if (room) path.push(room.name)
  if (storage) {
    path.push(storage.name)
    const comps = storage.compartments ?? []
    const chain: string[] = []
    let cur = comps.find((c) => c.id === item.compartment_id)
    while (cur) {
      chain.unshift(cur.name)
      const pid = cur.parent_id
      cur = pid ? comps.find((c) => c.id === pid) : undefined
    }
    path.push(...chain)
  }

  return (
    <>
      <div className="sheet-wrap" onClick={onClose}>
        <div className="sheet item-sheet" onClick={(e) => e.stopPropagation()}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: objectURL
            <img className="is-photo" src={photoUrl} alt={item.name} />
          ) : (
            <div className="is-photo-empty"><Icon name="camera" size={22} /> 사진 없음</div>
          )}
          <div className="is-body">
            <div className="is-photo-actions">
              <label className="is-btn">
                {photoUrl ? '사진 변경' : '사진 추가'}
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onUpdate({ photoFile: f }) }} />
              </label>
              {photoUrl && <button type="button" className="is-btn" onClick={() => void onUpdate({ photoFile: null })}>사진 삭제</button>}
            </div>
            <label className="is-field">이름
              <input type="text" value={name} maxLength={30}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { const n = name.trim(); if (n && n !== item.name) void onUpdate({ name: n }); else setName(item.name) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </label>
            <label className="is-field">메모
              <input type="text" value={memo} maxLength={40} placeholder="메모 (선택)"
                onChange={(e) => setMemo(e.target.value)}
                onBlur={() => { const m = memo.trim(); if (m !== item.memo) void onUpdate({ memo: m }) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </label>
            {path.length > 0 && <div className="is-loc">{path.join(' › ')}</div>}
            <button type="button" className="is-del" onClick={() => setConfirming(true)}>물건 삭제</button>
          </div>
          <button type="button" className="rowmenu-item cancel is-close" onClick={onClose}>닫기</button>
        </div>
      </div>
      {confirming && (
        <Modal title="물건 삭제" message={`'${item.name}'을(를) 삭제하시겠습니까?`} okText="삭제"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete() }} />
      )}
    </>
  )
}
```

- [ ] **Step 2: ItemRow — onOpen**

`CompartmentTree.tsx`의 `ItemRow`에 `onOpen?: () => void` prop 추가. 루트 div:

```tsx
    <div className="titem" style={pad(depth)} onClick={onOpen}
      role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen() } : undefined}>
```

`DeleteBtn`을 `<span className="titem-del-wrap" onClick={(e) => e.stopPropagation()}><DeleteBtn ... /></span>`로 래핑. globals.css의 `.titem .trow-del{margin-left:auto}` → `.titem-del-wrap{margin-left:auto;display:flex}`로 교체(관련 `@media(hover:hover)`의 `.titem .trow-del` opacity 규칙은 그대로 동작 — 셀렉터 유지 확인).

- [ ] **Step 3: HomeTree 배선**

`Props`에 `onOpenItem?: (id: string) => void` 추가. `TreeStorage`·`CmpNode`의 `<ItemRow ...>` 2곳에 `onOpen={() => p.onOpenItem?.(it.id)}` 추가.

- [ ] **Step 4: page.tsx**

- import `ItemSheet`. 상태 `const [openItemId, setOpenItemId] = useState<string | null>(null)`.
- `handleItemUpdate` 추가(위치: handleItemDelete 인근):

```tsx
  // 물건 수정: 이름/메모 재암호화, 사진 교체(File)/삭제(null)/유지(undefined). photoUrls·objectURL 정리 포함.
  async function handleItemUpdate(item: DecItem, patch: { name?: string; memo?: string; photoFile?: File | null }) {
    if (!data) return
    const fdk = keys.getFDK()
    if (!fdk) return
    const now = new Date().toISOString()
    const name = patch.name ?? item.name
    const memo = patch.memo ?? item.memo
    let photo_path = item.photo_path
    let newUrl: string | undefined
    if (patch.photoFile instanceof File) {
      const bytes = await downscaleImage(patch.photoFile)
      const blob = new Blob([bytes], { type: 'image/jpeg' })
      await store.putPhoto(item.id, blob)
      photo_path = 'local'
      newUrl = URL.createObjectURL(blob)
    } else if (patch.photoFile === null) {
      await store.delPhoto(item.id)
      photo_path = null
    }
    const row: Item = {
      id: item.id, family_id: item.family_id, storage_id: item.storage_id, compartment_id: item.compartment_id,
      enc_name: await encryptField(fdk, name),
      enc_memo: memo ? await encryptField(fdk, memo) : null,
      emoji: item.emoji, photo_path, created_by: item.created_by,
      created_at: item.created_at, updated_at: now, deleted_at: null,
    }
    await store.putLocal('items', row, { dirty: true })
    setData((d) => {
      if (!d) return d
      const photoUrls = { ...d.photoUrls }
      if (patch.photoFile === null || newUrl) {
        const old = photoUrls[item.id]
        if (old) URL.revokeObjectURL(old)
        delete photoUrls[item.id]
      }
      if (newUrl) photoUrls[item.id] = newUrl
      return {
        ...d,
        decItems: d.decItems.map((it) => (it.id === item.id ? { ...it, name, memo, photo_path, updated_at: now } : it)),
        photoUrls,
      }
    })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }
```

- `treeProps`에 `onOpenItem: setOpenItemId`.
- 렌더(토스트 앞, 다른 시트들과 같은 층): `const openItem = openItemId ? (data?.decItems.find((it) => it.id === openItemId) ?? null) : null` (최종 return 직전 배치 — data 접근 안전 지점):

```tsx
      {openItem && data && (
        <ItemSheet item={openItem} photoUrl={data.photoUrls[openItem.id]}
          rooms={data.rooms} storages={data.storages}
          onUpdate={(patch) => handleItemUpdate(openItem, patch)}
          onDelete={() => { void handleItemDelete(openItem); setOpenItemId(null) }}
          onClose={() => setOpenItemId(null)} />
      )}
```

- [ ] **Step 5: globals.css**

설정 시트 규칙 인근에 추가:

```css
/* 물건 상세 시트 */
.sheet.item-sheet{max-height:85vh;overflow-y:auto}
.is-photo{width:100%;max-height:40vh;object-fit:contain;background:var(--panel)}
.is-photo-empty{display:flex;align-items:center;justify-content:center;gap:8px;height:120px;color:var(--ink-soft);font-size:13px;background:var(--panel)}
.is-body{display:flex;flex-direction:column;gap:12px;padding:14px 16px 4px}
.is-photo-actions{display:flex;gap:8px}
.is-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border-radius:8px;background:var(--panel);font-size:13px;font-weight:600;color:var(--ink);cursor:pointer}
.is-btn:hover{background:var(--accent-soft);color:var(--accent-ink)}
.is-field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--ink-soft)}
.is-field input{padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:14px;outline:none}
.is-field input:focus{border-color:var(--accent)}
.is-loc{font-size:12.5px;color:var(--ink-soft)}
.is-del{align-self:flex-start;font-size:13px;color:var(--danger);padding:6px 2px}
.is-close{margin:8px 16px calc(12px + env(safe-area-inset-bottom))}
```

- [ ] **Step 6: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "feat(item): 물건 상세 시트 — 사진 크게·변경/삭제, 이름·메모 blur 저장, 브레드크럼, 삭제"
```

---

### Task 2: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트. 2. 최종 리뷰(opus) — photoUrls revoke/교체 수명, 시트 열림 중 동기화 소실·삭제 경로, Modal 버블 차단, 행 탭↔휴지통 분리, blur 저장 중복 발화(Enter→blur 1회). 3. push·원장·메모리·수동 안내.
