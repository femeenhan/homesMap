# 목록 트리 재설계 Phase 1 — 터치 우선 트리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목록(트리) 뷰의 행 인터랙션을 터치 우선으로 교체한다 — 탭=펼치기, 이름수정은 `⋯`메뉴로만, `＋`/`⋯` 상시 노출(터치)·hover 노출(데스크톱), 44px 타겟.

**Architecture:** 방/수납장/칸의 거의 동일한 행 3벌(`TreeRoom`/`TreeStorage`/`CompartmentNode`)을, 공용 행 컴포넌트 `TreeRow`(+`RowMenu`) 하나로 통일한다. `TreeRow`가 caret·아이콘·이름(span↔편집input)·개수·`＋`(추가 트리거)·`⋯`(이름수정/삭제 메뉴)와 그 인터랙션을 전담하고, 세 wrapper는 펼침/추가 상태와 자식 렌더링만 담당한다. 데이터 모델·store/sync·부모 콜백 시그니처는 무변경.

**Tech Stack:** Next.js(커스텀 빌드, `web/AGENTS.md` 주의), React 19, TypeScript, 순수 CSS(`globals.css`). 컴포넌트 테스트 인프라 없음(vitest `node` 환경, `*.test.ts` 순수함수만) → **신규 테스트 프레임워크 추가 안 함.**

## Global Constraints

- UI 문구는 한국어. 기존 카피 톤 유지.
- **새 의존성 추가 금지.** 기존 컴포넌트(`Modal`, `InlineInput`, `InlineItemForm`, `DeleteBtn`)와 기존 CSS 유틸(`.sheet-wrap`/`.sheet`)을 재사용.
- 부모 콜백 시그니처 무변경: `onRenameRoom(room,name)`, `onDeleteRoom(room)`, `onAddStorage(room,name)`, `onRenameStorage(storage,name)`, `onDeleteStorage(storage)`, `onCompartmentsChange(storage,c[])`, `onDeleteCompartment(storage,id)`, `onAddItem(storage,compartmentId,draft)`, `onDeleteItem(item)`. CompartmentTree 내부: `onRename(id,name)`, `onAddCompartment(parentId,name)`, `onDeleteCompartment(id)`, `onAddItem(compartmentId,draft)`.
- Phase 1 비목표: 데스크톱 2-pane, 물건 사진 그리드, 라이트박스, 물건 탭 상세, `usePhotoUrls` 훅화. (Phase 2/3)
- **검증 게이트(테스트 인프라 없음)**: 각 태스크 = `npx tsc --noEmit` EXIT 0 + `npm run lint` EXIT 0 + 명시된 수동 시나리오. baseline(작업 전)은 둘 다 green 확인됨.
- 작업 디렉터리: `web/`. 커밋은 저장소 루트(`/Users/cheolminhan/claude_workspace/homes_map`)에서. 배포 정책: 각 태스크 완료 시 커밋, 전체 완료(Task 4) 후 push(=Vercel 자동배포).
- 브랜치: `main` 직접 작업(프로젝트 배포 정책).

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `web/src/components/TreeRow.tsx` | **신규.** 공용 행(chrome+인터랙션) + `RowMenu`(⋯ 시트). | Task 1 |
| `web/src/app/globals.css` | 트리 섹션(`.trow*`, `.titem`) 재작성 + `.rowmenu`·hover 분기 추가. | Task 1 |
| `web/src/components/HomeTree.tsx` | `TreeRoom`/`TreeStorage`를 `TreeRow` 사용으로 교체. | Task 1(방), Task 2(수납장) |
| `web/src/components/CompartmentTree.tsx` | `CompartmentNode`를 `TreeRow` 사용으로 교체. `ItemRow`는 무변경(CSS로 터치화). | Task 3 |

---

## Task 1: `TreeRow`+`RowMenu` 컴포넌트 + 트리 CSS + 방(TreeRoom) 이행

**Files:**
- Create: `web/src/components/TreeRow.tsx`
- Modify: `web/src/app/globals.css` (트리 섹션 306–337 부근)
- Modify: `web/src/components/HomeTree.tsx` (TreeRoom, import)

**Interfaces:**
- Produces: `TreeRow` 컴포넌트.
  ```ts
  type AddOption = { label: string; onSelect: () => void }
  type TreeRowProps = {
    depth: number
    icon: string
    name: string
    count: number            // 0이면 개수 배지 숨김
    expandable: boolean
    expanded: boolean
    onToggle: () => void
    onRename: (name: string) => void
    addOptions: AddOption[]   // [] 이면 ＋ 버튼 없음, 1개면 ＋ 직행, 2+면 ＋ 탭 시 인라인 선택
    deleteTitle: string
    deleteMessage: string
    onDelete: () => void
    levelClass?: string       // 'lv-room' | 'lv-storage' | ''(칸)
  }
  ```
- Consumes: 기존 `Modal`(`web/src/components/Modal.tsx`) — props `{title, message?, okText?, onCancel, onConfirm}` (삭제 확인엔 `onConfirm`이 `{name,colorIndex}`를 넘기지만 무시).

- [ ] **Step 1: `TreeRow.tsx` 생성**

Create `web/src/components/TreeRow.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Modal } from './Modal'

type AddOption = { label: string; onSelect: () => void }

type Props = {
  depth: number
  icon: string
  name: string
  count: number
  expandable: boolean
  expanded: boolean
  onToggle: () => void
  onRename: (name: string) => void
  addOptions: AddOption[]
  deleteTitle: string
  deleteMessage: string
  onDelete: () => void
  levelClass?: string
}

const pad = (d: number) => ({ paddingLeft: d * 14 + 6 })

// 방/수납장/칸 공용 행. 탭=펼치기, 이름수정은 ⋯메뉴로만(탭으로 편집 안 됨), ＋는 하위 추가 트리거.
export function TreeRow({
  depth, icon, name, count, expandable, expanded, onToggle,
  onRename, addOptions, deleteTitle, deleteMessage, onDelete, levelClass = '',
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [addOpen, setAddOpen] = useState(false)

  function startEdit() { setDraft(name); setEditing(true) }
  function commitEdit() {
    const n = draft.trim()
    if (n && n !== name) onRename(n)
    setEditing(false)
  }
  function handlePlus() {
    if (addOptions.length === 1) addOptions[0].onSelect()
    else setAddOpen((o) => !o)
  }

  return (
    <div className={`trow ${levelClass}`.trim()} style={pad(depth)} onClick={editing ? undefined : onToggle}>
      <span className="trow-caret">{expandable ? (expanded ? '▾' : '▸') : ''}</span>
      <span className="trow-ico">{icon}</span>
      {editing ? (
        <input
          className="trow-name-input" type="text" autoFocus aria-label="이름 수정"
          value={draft} maxLength={20}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="trow-name">{name}</span>
      )}
      {!editing && count > 0 && <span className="trow-meta">{count}</span>}
      {!editing && (
        <span className="trow-actions" onClick={(e) => e.stopPropagation()}>
          {addOpen ? (
            <>
              {addOptions.map((o) => (
                <button key={o.label} type="button" className="trow-act"
                  onClick={() => { o.onSelect(); setAddOpen(false) }}>{o.label}</button>
              ))}
              <button type="button" className="trow-iconbtn" aria-label="닫기" onClick={() => setAddOpen(false)}>✕</button>
            </>
          ) : (
            <>
              {addOptions.length > 0 && (
                <button type="button" className="trow-iconbtn" aria-label="추가" onClick={handlePlus}>＋</button>
              )}
              <RowMenu onEditName={startEdit} onDelete={onDelete} deleteTitle={deleteTitle} deleteMessage={deleteMessage} />
            </>
          )}
        </span>
      )}
    </div>
  )
}

// ⋯ 메뉴: 이름 수정 / 삭제. 시트(.sheet) 재사용, 삭제는 Modal 확인.
function RowMenu({ onEditName, onDelete, deleteTitle, deleteMessage }: {
  onEditName: () => void; onDelete: () => void; deleteTitle: string; deleteMessage: string
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button type="button" className="trow-iconbtn" aria-label="메뉴" onClick={() => setOpen(true)}>⋯</button>
      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet rowmenu" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="rowmenu-item" onClick={() => { setOpen(false); onEditName() }}>✏️ 이름 수정</button>
            <button type="button" className="rowmenu-item danger" onClick={() => { setOpen(false); setConfirming(true) }}>🗑️ 삭제</button>
            <button type="button" className="rowmenu-item cancel" onClick={() => setOpen(false)}>취소</button>
          </div>
        </div>
      )}
      {confirming && (
        <Modal title={deleteTitle} message={deleteMessage} okText="삭제"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete() }} />
      )}
    </>
  )
}
```

- [ ] **Step 2: 트리 CSS 교체** — `web/src/app/globals.css`

Edit A — `.trow` 높이·커서:
old:
```
.trow{display:flex;align-items:center;gap:6px;height:30px;padding:0 6px;border-radius:7px}
```
new:
```
.trow{display:flex;align-items:center;gap:6px;min-height:44px;padding:0 6px;border-radius:7px;cursor:pointer}
```

Edit B — caret에서 `cursor:pointer` 제거(행 전체가 탭 타겟):
old:
```
.trow-caret{width:14px;flex-shrink:0;font-size:9px;color:var(--ink-soft);text-align:center;line-height:1;cursor:pointer;user-select:none}
```
new:
```
.trow-caret{width:14px;flex-shrink:0;font-size:9px;color:var(--ink-soft);text-align:center;line-height:1;user-select:none}
```

Edit C — 아이콘에서 `cursor:pointer` 제거:
old:
```
.trow-ico{flex-shrink:0;font-size:14px;cursor:pointer;line-height:1}
```
new:
```
.trow-ico{flex-shrink:0;font-size:15px;line-height:1}
```

Edit D — 이름을 span으로, 편집 input 스타일 신설:
old:
```
.trow-name{flex:1;min-width:0;font-size:13.5px;color:var(--ink);background:transparent;border:none;outline:none;padding:0;text-overflow:ellipsis}
.trow-name::placeholder{color:var(--ink-soft)}
```
new:
```
.trow-name{flex:1;min-width:0;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
.trow-name-input{flex:1;min-width:0;font-size:14px;color:var(--ink);background:var(--surface);border:none;outline:none;padding:4px 6px;border-radius:6px;box-shadow:0 0 0 1.5px var(--accent)}
```

Edit E — focus/hover 기반 액션을 상시(터치)·hover(데스크톱) 구조로 교체:
old:
```
.trow-name:focus{background:var(--surface);box-shadow:0 0 0 1.5px var(--accent);border-radius:5px}
.trow-meta{font-size:11px;color:var(--ink-soft);flex-shrink:0;margin-left:6px}
.trow:hover .trow-meta{display:none}
.trow-actions{display:none;align-items:center;gap:2px;flex-shrink:0;margin-left:6px}
.trow:hover .trow-actions{display:flex}
.trow-act{font-size:11px;font-weight:600;color:var(--ink-soft);padding:3px 7px;border-radius:6px;white-space:nowrap}
.trow-act:hover{background:var(--accent-soft);color:var(--accent-ink)}
.trow-del{font-size:12px;padding:3px 5px;color:var(--ink-soft);border-radius:6px}
.trow-del:hover{background:var(--danger);color:#fff}
```
new:
```
.trow-meta{font-size:11px;color:var(--ink-soft);flex-shrink:0;margin-left:6px}
.trow-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;margin-left:auto}
.trow-act{font-size:12px;font-weight:700;color:var(--accent-ink);background:var(--accent-soft);padding:8px 12px;border-radius:8px;white-space:nowrap}
.trow-iconbtn{display:flex;align-items:center;justify-content:center;min-width:34px;height:34px;font-size:15px;color:var(--ink-soft);border-radius:8px}
.trow-iconbtn:hover{background:var(--bg);color:var(--ink)}
.trow-del{font-size:13px;color:var(--ink-soft);border-radius:8px;min-width:34px;height:34px;display:flex;align-items:center;justify-content:center}
.trow-del:hover{background:var(--danger);color:#fff}
/* 데스크톱(hover 가능): 노션처럼 우측 액션은 hover 시에만, 행은 더 조밀 */
@media (hover:hover){
  .trow{min-height:34px}
  .trow-actions{opacity:0;transition:opacity .12s}
  .trow:hover .trow-actions,.trow-actions:focus-within{opacity:1}
}
/* ⋯ 행 메뉴(시트 재사용) */
.rowmenu{padding:8px}
.rowmenu-item{display:block;width:100%;text-align:left;padding:14px 16px;font-size:15px;color:var(--ink);border-radius:10px}
.rowmenu-item:hover{background:var(--bg)}
.rowmenu-item.danger{color:var(--danger)}
.rowmenu-item.cancel{color:var(--ink-soft);text-align:center;margin-top:4px}
```

Edit F — 물건 행 터치화(높이) + 삭제 상시 노출:
old:
```
.titem{display:flex;align-items:center;gap:8px;height:30px;padding:0 6px;border-radius:7px}
```
new:
```
.titem{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 6px;border-radius:7px}
```
old:
```
.titem .trow-del{display:none;margin-left:auto}
.titem:hover .trow-del{display:block}
```
new:
```
.titem .trow-del{margin-left:auto}
@media (hover:hover){
  .titem{min-height:34px}
  .titem .trow-del{opacity:0;transition:opacity .12s}
  .titem:hover .trow-del{opacity:1}
}
```

- [ ] **Step 3: `TreeRoom`을 `TreeRow`로 교체** — `web/src/components/HomeTree.tsx`

Import에 `TreeRow` 추가(기존 import 줄 수정):
old:
```
import { CompartmentTree, DeleteBtn, InlineInput, InlineItemForm } from './CompartmentTree'
```
new:
```
import { CompartmentTree, DeleteBtn, InlineInput, InlineItemForm } from './CompartmentTree'
import { TreeRow } from './TreeRow'
```
(주의: `DeleteBtn`은 Task 2에서 TreeStorage 이행 후 미사용이 되면 그때 제거. Task 1 시점엔 TreeStorage가 아직 사용하므로 유지.)

`TreeRoom` 함수 본문 교체:
old:
```
function TreeRoom({ room, ...p }: { room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(room.name)
  const [adding, setAdding] = useState(false)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  const toggle = () => setExpanded((e) => !e)
  return (
    <div className="tnode">
      <div className="trow lv-room" style={pad(0)}>
        <button type="button" className="trow-caret" onClick={toggle}>{storages.length ? (expanded ? '▼' : '▶') : ''}</button>
        <span className="trow-ico" onClick={toggle}>🏠</span>
        <input className="trow-name" type="text" aria-label="방 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== room.name) p.onRenameRoom(room, n); else setName(room.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {storages.length > 0 && <span className="trow-meta">{storages.length}</span>}
        <span className="trow-actions">
          <button type="button" className="trow-act" onClick={() => { setExpanded(true); setAdding(true) }}>＋수납장</button>
          <DeleteBtn title="방 삭제(수납장·물건 포함)" onConfirm={() => p.onDeleteRoom(room)} />
        </span>
      </div>
      {expanded && (
        <>
          {adding && <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
    </div>
  )
}
```
new:
```
function TreeRoom({ room, ...p }: { room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="tnode">
      <TreeRow
        depth={0} levelClass="lv-room" icon="🏠" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameRoom(room, n)}
        addOptions={[{ label: '＋ 수납장', onSelect: () => { setExpanded(true); setAdding(true) } }]}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)}
      />
      {expanded && (
        <>
          {adding && <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 타입·린트 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?" && npm run lint; echo "lint:$?"
```
Expected: `tsc:0` 그리고 `lint:0`.
(주의: `pad`가 HomeTree.tsx 상단에 이미 정의돼 있어야 함 — 기존 `const pad = (d: number) => ({ paddingLeft: d * 16 + 6 })` 그대로 유지. TreeRoom은 이제 `pad`를 직접 안 쓰지만 TreeStorage가 아직 사용하므로 삭제 금지.)

- [ ] **Step 5: 수동 확인(방 레벨)**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npm run dev
```
브라우저(모바일 폭 ~390px 시뮬레이션)에서 목록 탭:
- 방 행 몸통 탭 → 펼침/접힘(이름 편집 안 됨, 키보드 안 뜸).
- 방 행 `＋`(상시 보임) → 수납장 이름 인라인 입력 → 추가됨.
- 방 행 `⋯` → 시트(이름 수정/삭제) → "이름 수정" 시 그 행만 편집 활성 → Enter/바깥탭 확정, Esc 원복.
- `⋯` → 삭제 → 확인 모달 → 삭제.
- 데스크톱 폭에서 방 행 hover 시에만 `＋`/`⋯` 노출.
- (수납장/칸/물건 행은 아직 구식 — 다음 태스크. 동작은 유지되어야 함.)

- [ ] **Step 6: 커밋**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/TreeRow.tsx web/src/app/globals.css web/src/components/HomeTree.tsx && git commit -m "$(printf 'feat(tree): TreeRow+RowMenu 공용 행 도입, 방 행 터치 이행\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: 수납장(TreeStorage) 이행

**Files:**
- Modify: `web/src/components/HomeTree.tsx` (TreeStorage, import 정리)

**Interfaces:**
- Consumes: `TreeRow`(Task 1), `addOptions`에 `＋ 칸`·`＋ 물건` 두 개 전달.

- [ ] **Step 1: `TreeStorage`를 `TreeRow`로 교체**

old:
```
function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(storage.name)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const compartments = storage.compartments ?? []
  const hasKids = compartments.length > 0 || items.length > 0
  const toggle = () => setExpanded((e) => !e)
  const startAdd = (m: 'cmp' | 'item') => { setExpanded(true); setAdding(m) }
  return (
    <div className="tnode">
      <div className="trow lv-storage" style={pad(1)}>
        <button type="button" className="trow-caret" onClick={toggle}>{hasKids ? (expanded ? '▼' : '▶') : ''}</button>
        <span className="trow-ico" onClick={toggle}>📦</span>
        <input className="trow-name" type="text" aria-label="수납장 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== storage.name) p.onRenameStorage(storage, n); else setName(storage.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {items.length > 0 && <span className="trow-meta">{items.length}</span>}
        <span className="trow-actions">
          <button type="button" className="trow-act" onClick={() => startAdd('cmp')}>＋칸</button>
          <button type="button" className="trow-act" onClick={() => startAdd('item')}>＋물건</button>
          <DeleteBtn title="수납장 삭제(물건 포함)" onConfirm={() => p.onDeleteStorage(storage)} />
        </span>
      </div>
      {expanded && (
        <>
          {adding === 'cmp' && <InlineInput depth={2} placeholder="새 칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {adding === 'item' && <InlineItemForm depth={2} onSubmit={async (d) => { await p.onAddItem(storage, null, d); setAdding('none') }} onCancel={() => setAdding('none')} />}
          <CompartmentTree
            storage={storage} items={items} members={p.members} baseDepth={2}
            onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
            onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
            onAddItem={(cid, d) => p.onAddItem(storage, cid, d)}
            onDeleteItem={p.onDeleteItem}
          />
        </>
      )}
    </div>
  )
}
```
new:
```
function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const compartments = storage.compartments ?? []
  const hasKids = compartments.length > 0 || items.length > 0
  const startAdd = (m: 'cmp' | 'item') => { setExpanded(true); setAdding(m) }
  return (
    <div className="tnode">
      <TreeRow
        depth={1} levelClass="lv-storage" icon="📦" name={storage.name} count={items.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameStorage(storage, n)}
        addOptions={[
          { label: '＋ 칸', onSelect: () => startAdd('cmp') },
          { label: '＋ 물건', onSelect: () => startAdd('item') },
        ]}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)}
      />
      {expanded && (
        <>
          {adding === 'cmp' && <InlineInput depth={2} placeholder="새 칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {adding === 'item' && <InlineItemForm depth={2} onSubmit={async (d) => { await p.onAddItem(storage, null, d); setAdding('none') }} onCancel={() => setAdding('none')} />}
          <CompartmentTree
            storage={storage} items={items} members={p.members} baseDepth={2}
            onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
            onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
            onAddItem={(cid, d) => p.onAddItem(storage, cid, d)}
            onDeleteItem={p.onDeleteItem}
          />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 미사용 import 정리** — `web/src/components/HomeTree.tsx`

이제 HomeTree.tsx에서 `DeleteBtn`과 `pad`가 미사용이 됨(TreeRoom/TreeStorage 둘 다 이행 완료). eslint 통과 위해 제거.
old:
```
import { CompartmentTree, DeleteBtn, InlineInput, InlineItemForm } from './CompartmentTree'
```
new:
```
import { CompartmentTree, InlineInput, InlineItemForm } from './CompartmentTree'
```
그리고 파일 상단 `pad` 정의 제거(HomeTree.tsx에만 있는 것; CompartmentTree.tsx의 `pad`는 별개, 건드리지 말 것):
old:
```
const pad = (d: number) => ({ paddingLeft: d * 16 + 6 })
```
new: (해당 줄 삭제)

- [ ] **Step 3: 타입·린트 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?" && npm run lint; echo "lint:$?"
```
Expected: `tsc:0`, `lint:0`. (미사용 `DeleteBtn`/`pad` 잔존 시 lint 실패 → 제거 확인.)

- [ ] **Step 4: 수동 확인(수납장 레벨)**

dev 서버에서:
- 수납장 행 탭 → 펼침/접힘, 이름 편집 안 됨.
- 수납장 `＋` → `＋ 칸`·`＋ 물건` 두 버튼 인라인 노출 → 각각 선택 시 해당 인라인 폼.
- 물건 폼(이름/메모/사진) 정상 등록.
- 수납장 `⋯` → 이름 수정/삭제 정상.

- [ ] **Step 5: 커밋**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/HomeTree.tsx && git commit -m "$(printf 'feat(tree): 수납장 행 터치 이행(＋칸/＋물건 인라인), 미사용 import 정리\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: 칸(CompartmentNode) 이행

**Files:**
- Modify: `web/src/components/CompartmentTree.tsx` (CompartmentNode, import)

**Interfaces:**
- Consumes: `TreeRow`(Task 1). `ItemRow`는 무변경(Task 1 CSS로 이미 터치화·삭제 상시화됨).

- [ ] **Step 1: import에 `TreeRow` 추가** — `web/src/components/CompartmentTree.tsx`

`InlineInput`/`InlineItemForm`은 같은 파일 내 정의라 import 불필요. 파일 상단 import에 추가:
old:
```
import { useState } from 'react'
import type { Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { childCompartments } from '@/lib/compartments'
```
new:
```
import { useState } from 'react'
import type { Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { childCompartments } from '@/lib/compartments'
import { TreeRow } from './TreeRow'
```

- [ ] **Step 2: `CompartmentNode`를 `TreeRow`로 교체**

old:
```
function CompartmentNode(p: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(p.compartment.name)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')
  const children = childCompartments(p.compartments, p.compartment.id)
  const myItems = p.items.filter((it) => it.compartment_id === p.compartment.id)
  const hasKids = children.length > 0 || myItems.length > 0
  const toggle = () => setExpanded((e) => !e)
  const startAdd = (m: 'cmp' | 'item') => { setExpanded(true); setAdding(m) }

  return (
    <div className="tnode">
      <div className="trow" style={pad(p.depth)}>
        <button type="button" className="trow-caret" onClick={toggle}>{hasKids ? (expanded ? '▼' : '▶') : ''}</button>
        <span className="trow-ico" onClick={toggle}>📁</span>
        <input className="trow-name" type="text" aria-label="칸 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== p.compartment.name) p.onRename(p.compartment.id, n); else setName(p.compartment.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {myItems.length > 0 && <span className="trow-meta">{myItems.length}</span>}
        <span className="trow-actions">
          <button type="button" className="trow-act" onClick={() => startAdd('cmp')}>＋칸</button>
          <button type="button" className="trow-act" onClick={() => startAdd('item')}>＋물건</button>
          <DeleteBtn title="칸 삭제(하위 칸·물건 포함)" onConfirm={() => p.onDeleteCompartment(p.compartment.id)} />
        </span>
      </div>
      {expanded && (
        <>
          {adding === 'cmp' && <InlineInput depth={p.depth + 1} placeholder="새 칸 이름" onSubmit={(n) => { p.onAddCompartment(p.compartment.id, n); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {adding === 'item' && <InlineItemForm depth={p.depth + 1} onSubmit={async (d) => { await p.onAddItem(p.compartment.id, d); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {children.map((c) => <CompartmentNode {...p} key={c.id} compartment={c} depth={p.depth + 1} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={p.depth + 1} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}
```
new:
```
function CompartmentNode(p: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')
  const children = childCompartments(p.compartments, p.compartment.id)
  const myItems = p.items.filter((it) => it.compartment_id === p.compartment.id)
  const hasKids = children.length > 0 || myItems.length > 0
  const startAdd = (m: 'cmp' | 'item') => { setExpanded(true); setAdding(m) }

  return (
    <div className="tnode">
      <TreeRow
        depth={p.depth} icon="📁" name={p.compartment.name} count={myItems.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRename(p.compartment.id, n)}
        addOptions={[
          { label: '＋ 칸', onSelect: () => startAdd('cmp') },
          { label: '＋ 물건', onSelect: () => startAdd('item') },
        ]}
        deleteTitle="칸 삭제" deleteMessage={`'${p.compartment.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteCompartment(p.compartment.id)}
      />
      {expanded && (
        <>
          {adding === 'cmp' && <InlineInput depth={p.depth + 1} placeholder="새 칸 이름" onSubmit={(n) => { p.onAddCompartment(p.compartment.id, n); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {adding === 'item' && <InlineItemForm depth={p.depth + 1} onSubmit={async (d) => { await p.onAddItem(p.compartment.id, d); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {children.map((c) => <CompartmentNode {...p} key={c.id} compartment={c} depth={p.depth + 1} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={p.depth + 1} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `DeleteBtn` 사용처 점검**

`CompartmentTree.tsx`의 `ItemRow`가 여전히 `DeleteBtn`을 사용하므로 `DeleteBtn` export/정의는 유지. `pad`도 `InlineInput`/`InlineItemForm`/`ItemRow`가 사용하므로 유지. **아무 것도 삭제하지 말 것.** (HomeTree가 import하던 `DeleteBtn`은 Task 2에서 이미 제거됨.)

- [ ] **Step 4: 타입·린트 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?" && npm run lint; echo "lint:$?"
```
Expected: `tsc:0`, `lint:0`.

- [ ] **Step 5: 수동 확인(칸·물건 레벨)**

- 칸 행 탭 → 펼침/접힘, 이름 편집 안 됨.
- 칸 `＋` → `＋ 칸`·`＋ 물건` → 중첩 칸/물건 추가.
- 칸 `⋯` → 이름 수정/삭제.
- 물건 행: 삭제(🗑️) 상시 보임(터치), 44px, 탭 정상. 데스크톱은 hover 시 삭제 노출.

- [ ] **Step 6: 커밋**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/CompartmentTree.tsx && git commit -m "$(printf 'feat(tree): 칸 행 터치 이행, 트리 전 레벨 TreeRow 통일\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: 정리·전체 검증·배포

**Files:**
- 점검만(코드 변경 최소). 필요 시 잔여 데드코드 제거.

- [ ] **Step 1: 데드코드/잔여 스캔**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && grep -rn "trow-name\b" src/ ; grep -rn "className=\"trow\"" src/
```
확인: 이제 `<input className="trow-name">` 사용처가 없어야 함(모두 `TreeRow`의 span/input로 대체). `.trow` 마크업은 `TreeRow.tsx`에만 존재해야 함. 남아있으면 미이행 잔여 → 해당 태스크로 복귀.

- [ ] **Step 2: 전체 타입·린트·빌드 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?" && npm run lint; echo "lint:$?" && npm run build 2>&1 | tail -8; echo "build:$?"
```
Expected: `tsc:0`, `lint:0`, `build:0`.

- [ ] **Step 3: 전체 수동 시나리오(모바일 폭 + 데스크톱 폭)**

목록 탭에서 방→수납장→칸→물건 전 경로:
1. hover 없이(터치) `＋`/`⋯`가 전부 보인다.
2. 어느 행이든 몸통 탭 = 펼치기만(rename/키보드 안 뜸).
3. `⋯ → 이름 수정`만 편집 진입, Esc 원복, Enter/바깥탭 확정.
4. `⋯ → 삭제` → 확인 → 하위 포함 삭제.
5. 각 레벨 추가(방/수납장/칸/물건) 정상, 물건 사진 첨부 정상.
6. 데스크톱 폭: 행 hover 시에만 우측 액션 노출(노션식), 조밀한 34px 행.
7. 도식화(지도) 뷰 진입/수납장 탭 → 회귀 없음(바텀시트 정상).

- [ ] **Step 4: push(배포)**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git push
```
Vercel 자동배포 후 실기기(모바일)에서 §Step 3 재확인.

---

## Self-Review (작성자 점검 결과)

**Spec 커버리지(Phase 1 항목):** 탭=펼치기 ✔(TreeRow onToggle) · 이름 span화+명시적 수정 ✔(RowMenu→editing) · ＋/⋯ 상시노출(터치)·hover(데스크톱) ✔(CSS `@media (hover:hover)`) · 44px ✔ · 인라인 추가(＋칸/＋물건 두 버튼) ✔ · TreeRow 통합 ✔. Phase 2/3 항목(2-pane·그리드·라이트박스·물건탭상세)은 의도적으로 제외.

**Placeholder 스캔:** TBD/TODO 없음. 모든 코드 블록은 실제 전문. 검증은 tsc/eslint/수동(테스트 인프라 부재를 Global Constraints에 명시).

**타입 일관성:** `TreeRowProps`(count: number 필수)와 세 wrapper의 `count={...length}` 일치. `onRename(name)` ↔ `p.onRenameRoom(room,n)`/`onRenameStorage(storage,n)`/`onRename(id,n)` 일치. `addOptions:{label,onSelect}[]` ↔ 리터럴 일치. `Modal` props(title/message/okText/onCancel/onConfirm) ↔ 실제 정의 일치.

**리스크:** Task 1 이후 Task 3 이전, 미이행 수납장/칸 행이 재작성된 `.trow` CSS를 상속 → 이름 input이 span 스타일을 받지만 **동작은 유지**(각 커밋 비깨짐). Task 3 완료 시 완전 일치.
