# 전면 아코디언 복귀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-inline-accordion-design.md` — 수납장 화면전환(StoragePane) 폐지 → 목록 인라인 아코디언, 행 아이콘 2버튼(＋칸/＋물건), 지도·검색은 목록 동기화, 수납장 복사.

**Architecture:** (1) `duplicateCompartments` 순수함수(TDD) + Icon 2종 + TreeRow `addActions[]`/`onDuplicate`, (2) HomeTree에 수납장 아코디언·칸 재귀(CmpNode) 복원 + `focusStorageId` 동기화, page는 `openStorageId`→`focusStorageId` 전환·복사 핸들러, StoragePane·sp-CSS 삭제.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS / vitest. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 데이터 계층 무변경(복사 핸들러는 기존 putLocal/push 패턴). 삭제 확인 카피 기존 그대로.
- lint: effect 내 동기 setState 금지 — 지역 함수 래핑 패턴.
- 삭제는 grep 0건 확인 후. `InlineInput`/`InlineItemForm`/`ItemRow`/`AddRow`/`DrillHeader`(TreeRow 소속) 유지.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` 전부 통과.

---

### Task 1: duplicateCompartments(TDD) + Icon 2종 + TreeRow 확장

**Files:**
- Modify: `web/src/lib/compartments.ts`, `web/src/lib/compartments.test.ts`, `web/src/components/Icon.tsx`, `web/src/components/TreeRow.tsx`, `web/src/components/HomeTree.tsx`(TreeRoom 호출부만 — addActions 형식 전환)

**Interfaces:**
- Produces:
  - `duplicateCompartments(comps: Compartment[]): Compartment[]` — 전부 새 id, parent_id 재매핑(없는 부모 참조는 null)
  - `IconName`에 `'folder-plus' | 'box-plus'`
  - `TreeRow`: `onAdd?` 삭제 → `addActions?: { icon: IconName; label: string; onClick: () => void }[]`(버튼마다 `aria-label`·`title`=label), `onDuplicate?: () => void`(RowMenu에 `복사` 항목 — 이름 수정과 삭제 사이, 있을 때만)

- [ ] **Step 1: 실패하는 테스트 — compartments.test.ts에 추가**

```ts
describe('duplicateCompartments', () => {
  const c = (id: string, parent_id: string | null = null): Compartment => ({ id, name: id, parent_id })
  it('전부 새 id를 받고 중첩 부모 관계가 보존된다', () => {
    const src = [c('a'), c('b', 'a'), c('c', 'b'), c('d')]
    const out = duplicateCompartments(src)
    expect(out).toHaveLength(4)
    const srcIds = new Set(src.map((x) => x.id))
    for (const x of out) expect(srcIds.has(x.id)).toBe(false)
    const byName = (n: string) => out.find((x) => x.name === n)!
    expect(byName('b').parent_id).toBe(byName('a').id)
    expect(byName('c').parent_id).toBe(byName('b').id)
    expect(byName('d').parent_id).toBeNull()
  })
  it('없는 부모 참조는 null로 정리된다', () => {
    const out = duplicateCompartments([c('x', 'ghost')])
    expect(out[0].parent_id).toBeNull()
  })
})
```

(파일 상단 import에 `duplicateCompartments` 추가. `Compartment` 타입 import는 기존 파일 관례를 따름.)

- [ ] **Step 2: 실패 확인** — `cd web && npm test` → 신규 2개 FAIL.

- [ ] **Step 3: 구현 — compartments.ts에 추가**

```ts
// 수납장 복사용: 칸 트리 전체를 새 id로 복제. parent_id는 새 id로 재매핑(없는 부모 참조는 null 정리).
export function duplicateCompartments(comps: Compartment[]): Compartment[] {
  const idMap = new Map(comps.map((c) => [c.id, crypto.randomUUID()]))
  return comps.map((c) => ({
    ...c,
    id: idMap.get(c.id)!,
    parent_id: c.parent_id ? (idMap.get(c.parent_id) ?? null) : null,
  }))
}
```

- [ ] **Step 4: 통과 확인** — `npm test` 전부 PASS(36개).

- [ ] **Step 5: Icon.tsx — 2종 추가**

`IconName`에 `'folder-plus' | 'box-plus'`, PATHS에(lucide folder-plus / package-plus):

```tsx
  'folder-plus': <><path d="M12 10v6" /><path d="M9 13h6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>,
  'box-plus': <><path d="M16 16h6" /><path d="M19 13v6" /><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" /><path d="m7.5 4.27 9 5.15" /><polyline points="3.29 7 12 12 20.71 7" /><line x1="12" x2="12" y1="22" y2="12" /></>,
```

- [ ] **Step 6: TreeRow — addActions·onDuplicate**

- Props: `onAdd?` 제거 → `addActions?: { icon: IconName; label: string; onClick: () => void }[]`, `onDuplicate?: () => void` 추가.
- actions 렌더(기존 `{onAdd && ...}` 자리):

```tsx
          {addActions?.map((a) => (
            <button key={a.label} type="button" className="trow-iconbtn" aria-label={a.label} title={a.label} onClick={a.onClick}>
              <Icon name={a.icon} size={16} />
            </button>
          ))}
```

- `RowMenu`에 `onDuplicate?` prop — 항목 순서: 이름 수정 → (있으면) `복사` → 삭제. `복사` onClick: `{ setOpen(false); onDuplicate() }`. TreeRow가 RowMenu에 전달.
- `HomeTree.tsx`의 TreeRoom 호출부: `onAdd={...}` → `addActions={[{ icon: 'plus', label: '수납장 추가', onClick: () => { setAdding(true); setExpanded(true) } }]}`.

- [ ] **Step 7: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add -A
git commit -m "feat(tree): duplicateCompartments(TDD)+folder-plus/box-plus 아이콘+TreeRow addActions·복사 메뉴"
```

---

### Task 2: 아코디언 복원 + 동기화 전환 + StoragePane 삭제 + 복사 배선

**Files:**
- Modify: `web/src/components/HomeTree.tsx`, `web/src/app/(app)/page.tsx`, `web/src/components/GridMap.tsx`(수납장 버튼 콜백명), `web/src/app/globals.css`
- Delete: `web/src/components/StoragePane.tsx`

**Interfaces:**
- Produces: `HomeTreeProps` — `onOpenStorage?` 제거, `focusStorageId?: string | null`·`storageFlash?: boolean`·`onFocusStorage?: (id: string) => void`·`onDuplicateStorage?: (s: Storage) => void` 추가(GridMap 수납장 버튼은 `p.onFocusStorage` 호출).

- [ ] **Step 1: HomeTree — 수납장 아코디언 + 칸 재귀**

import에 `InlineItemForm`/`ItemRow`(./CompartmentTree), `childCompartments`(@/lib/compartments) 추가. `TreeStorage` 교체 + `CmpNode` 신설:

```tsx
function TreeStorage({ storage, ...p }: { storage: Storage } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const compartments = storage.compartments ?? []
  const validIds = new Set(compartments.map((c) => c.id))
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const direct = items.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const roots = childCompartments(compartments, null)
  const focused = p.focusStorageId === storage.id
  // 지도 타일·검색에서 이 수납장 선택 시 펼침+스크롤
  useEffect(() => {
    if (!focused) return
    const openIt = () => {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    openIt()
  }, [focused])
  return (
    <div className="tnode" ref={rowRef}>
      <TreeRow
        depth={1} levelClass={`lv-storage${focused ? ' sel' : ''}${focused && p.storageFlash ? ' flash' : ''}`}
        icon="folder" name={storage.name} count={items.length}
        expandable={compartments.length > 0 || items.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        addActions={[
          { icon: 'folder-plus', label: '칸 추가', onClick: () => { setAddingCmp(true); setExpanded(true) } },
          { icon: 'box-plus', label: '물건 추가', onClick: () => { setAddingItem(true); setExpanded(true) } },
        ]}
        onRename={(n) => p.onRenameStorage(storage, n)}
        onDuplicate={() => p.onDuplicateStorage?.(storage)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)}
      />
      {expanded && (
        <>
          {addingCmp && <InlineInput depth={2} placeholder="칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAddingCmp(false) }} onCancel={() => setAddingCmp(false)} />}
          {addingItem && <InlineItemForm depth={2} onSubmit={async (d) => { await p.onAddItem(storage, null, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />}
          {roots.map((c) => <CmpNode key={c.id} cmp={c} depth={2} storage={storage} compartments={compartments} {...p} />)}
          {direct.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={2} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}

// 칸 노드(무한 중첩): 탭=펼침, ＋칸/＋물건 2버튼, ⋯ 이름수정/삭제
function CmpNode({ cmp, depth, storage, compartments, ...p }: {
  cmp: Compartment; depth: number; storage: Storage; compartments: Compartment[]
} & Props) {
  const [expanded, setExpanded] = useState(false)
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const children = childCompartments(compartments, cmp.id)
  const myItems = p.decItems.filter((it) => it.storage_id === storage.id && it.compartment_id === cmp.id)
  return (
    <div className="tnode">
      <TreeRow
        depth={depth} icon="folder" name={cmp.name} count={myItems.length}
        expandable={children.length > 0 || myItems.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        addActions={[
          { icon: 'folder-plus', label: '칸 추가', onClick: () => { setAddingCmp(true); setExpanded(true) } },
          { icon: 'box-plus', label: '물건 추가', onClick: () => { setAddingItem(true); setExpanded(true) } },
        ]}
        onRename={(n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === cmp.id ? { ...x, name: n } : x)))}
        deleteTitle="칸 삭제" deleteMessage={`'${cmp.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteCompartment(storage, cmp.id)}
      />
      {expanded && (
        <>
          {addingCmp && <InlineInput depth={depth + 1} placeholder="칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: cmp.id }]); setAddingCmp(false) }} onCancel={() => setAddingCmp(false)} />}
          {addingItem && <InlineItemForm depth={depth + 1} onSubmit={async (d) => { await p.onAddItem(storage, cmp.id, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />}
          {children.map((c) => <CmpNode key={c.id} cmp={c} depth={depth + 1} storage={storage} compartments={compartments} {...p} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={depth + 1} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}
```

`Props` 변경: `onOpenStorage?` 제거 → `focusStorageId?: string | null; storageFlash?: boolean; onFocusStorage?: (id: string) => void; onDuplicateStorage?: (storage: Storage) => void`. `TreeRoom`: 포함 수납장이 포커스면 방도 펼침 —

```tsx
  const containsFocus = !!p.focusStorageId && storages.some((s) => s.id === p.focusStorageId)
  useEffect(() => {
    if (!focused && !containsFocus) return
    const openIt = () => { ... 기존 본문 ... }
    openIt()
  }, [focused, containsFocus])
```

(스크롤은 방·수납장 둘 다 시도돼도 `block:'nearest'`라 무해.)

- [ ] **Step 2: GridMap — 수납장 버튼 콜백**

`gm-sto` 보기 버튼 onClick을 `p.onOpenStorage?.(s.id)` → `p.onFocusStorage?.(s.id)`로.

- [ ] **Step 3: page.tsx**

- `openStorageId`/`openStorage`/`StoragePane` import·렌더 제거 → 항상 home-hybrid 렌더(`.main` 래퍼 분기 삭제).
- `const [focusStorageId, setFocusStorageId] = useState<string | null>(null)` 추가. `handleSearchPick` = `setFocusStorageId(id)` + `setSearchFlash(true)`.
- `treeProps`: `onOpenStorage` 제거, `focusStorageId`, `storageFlash: searchFlash`, `onFocusStorage: setFocusStorageId`, `onDuplicateStorage: handleDuplicateStorage` 추가.
- 복사 핸들러(기존 저장 패턴, `duplicateCompartments`·`autoPlace`·`roomInnerGrid`·`storageRect` import 확인):

```tsx
  // 수납장 복사: 칸 구조까지(물건 제외), 같은 방 빈 자리에 배치
  async function handleDuplicateStorage(storage: Storage) {
    if (!data) return
    const room = data.rooms.find((r) => r.id === storage.room_id)
    if (!room) return
    const inner = roomInnerGrid(room)
    const r = storageRect(storage)
    const sib = data.storages.filter((s) => s.room_id === storage.room_id).map(storageRect)
    const pos = autoPlace(sib, { w: r.w, h: r.h }, inner.cols)
    const row: Storage = {
      ...storage,
      id: crypto.randomUUID(),
      name: `${storage.name} 복사`,
      x: pos.x,
      y: Math.min(pos.y, Math.max(0, inner.rows - r.h)),
      compartments: duplicateCompartments(storage.compartments ?? []),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('storages', row, { dirty: true })
    setData((d) => d && { ...d, storages: [...d.storages, row] })
    showToast(`'${row.name}' 추가됨 — 이름은 ⋯에서 바꿀 수 있어요`)
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }
```

- [ ] **Step 4: 삭제 + CSS**

- `git rm web/src/components/StoragePane.tsx`(참조 grep 0 확인 — page·GridMap에서 이미 제거됨).
- globals.css: `.sp-panes`~`.sp-items` 블록 삭제(사용처 0 확인), `.gm-focus .gmap-scroll,.gm-focus .sp-right{...}` 규칙 삭제 → 대체 추가: `.trow.flash{animation:gm-focus 1.6s ease-out}` (`@keyframes gm-focus`는 유지).

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "feat(tree): 전면 아코디언 복귀 — 수납장 인라인 펼침·2버튼 추가·지도/검색 동기화·수납장 복사, StoragePane 삭제"
```

---

### Task 3: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트. 2. 최종 리뷰(opus) — 포커스 동기화(방·수납장 이중 스크롤/루프), 아코디언 깊은 중첩 들여쓰기, 2버튼 행 혼잡(모바일 44px), 복사(중첩 재매핑·빈 자리 배치·이름), 삭제 잔재. 3. push·원장·메모리·수동 안내.
