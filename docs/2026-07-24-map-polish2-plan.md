# 도식화 다듬기 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-map-polish2-design.md` — ① 탑뷰 편집에서 수납장 직접 이동/리사이즈, ② 수납장 화면을 좌(칸 트리)/우(선택 칸 물건) 2-pane으로.

**Architecture:** `GridMap.tsx` 중심 — EditableTile에 비정사각 셀(`cellH`) 지원 후 탑뷰 편집 오버레이를 중첩 EditableTile로 승격. StorageScreen은 TreeRow 재귀 트리 + 선택 상태 + ItemRow 목록의 2-pane으로 재작성(CompartmentTree 사용 중단 — 목록 뷰 전용 잔존).

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 수정 파일: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`만. `GridMapProps`·page.tsx·목록 뷰·`CompartmentTree.tsx`·`TreeRow.tsx` 무변경.
- EditableTile 기존 보증 유지: 포인터 캡처, start/move/end `stopPropagation`, moved 가드, 변경 시에만 `onCommit` 1회, `maxRows` 클램프.
- 삭제 카피 기존 그대로(칸: "'○○' 칸과 그 안의 칸·물건이 함께 삭제됩니다").
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` 전부 통과.

---

### Task 1: 탑뷰 수납장 직접 편집

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Produces: `EditableTile`에 `cellH?: number`(기본 `cell`) prop. `onClick`에 `e.stopPropagation()`. HomeCanvas 편집 모드에서 수납장 = 중첩 EditableTile.

- [ ] **Step 1: EditableTile — cellH + onClick 전파 차단**

- props에 `cellH?: number` 추가, 본문 첫머리에 `const ch = cellH ?? cell`.
- 세로 계산 전부 `ch` 사용: `move()`의 `const dy = Math.round((e.clientY - drag.sy) / ch)`, 스타일 `top: shown.y * ch, height: shown.h * ch`.
- `onClick={(e) => { e.stopPropagation(); ... }}` — 중첩 타일(수납장→방) 클릭 번짐 차단. 기존 로직(moved 가드 → editing이면 onSelect) 유지.

- [ ] **Step 2: HomeCanvas — 편집 오버레이를 EditableTile로**

방 타일(`EditableTile ... className="gm-tile gm-room"`) 내부의 수납장 렌더에서 **편집 분기만** 교체(보기 분기의 `<button className="gm-sto">`는 그대로). 방 px 크기 기반 로컬 셀:

```tsx
                  {roomStorages.map((s) => {
                    const r = storageRect(s)
                    if (editing) {
                      const cw = (room.w * cell) / inner.cols   // 방-로컬 가로 셀(px)
                      const chh = (room.h * cell) / inner.rows  // 방-로컬 세로 셀(px)
                      return (
                        <EditableTile key={s.id} rect={r}
                          cell={cw} cellH={chh} cols={inner.cols} minW={1} minH={1} maxRows={inner.rows}
                          editing selected={selectedId === s.id}
                          className="gm-sto"
                          onSelect={() => setSelectedId(s.id)}
                          onCommit={(next) => p.onStorageGeometry(s, next)}>
                          <span>{s.name}</span>
                        </EditableTile>
                      )
                    }
                    const st = {
                      left: `${(r.x / inner.cols) * 100}%`, top: `${(r.y / inner.rows) * 100}%`,
                      width: `${(r.w / inner.cols) * 100}%`, height: `${(r.h / inner.rows) * 100}%`,
                    }
                    return (
                      <button key={s.id} type="button" className="gm-sto" style={st}
                        onClick={(e) => { e.stopPropagation(); onOpenStorage(s.id) }}>
                        <span>{s.name}</span>
                      </button>
                    )
                  })}
```

주의: EditableTile은 px 좌표(`left: x*cell`)로 그리므로 %-style 불필요 — 방 타일이 containing block이라 그대로 방-로컬 배치가 됨. `selectedId`는 방/수납장 공용(수납장 선택 시 방 선택 해제 효과 자연 발생). 방 재탭-확대 로직은 무변경.

- [ ] **Step 3: 힌트·CSS**

- 힌트 문구 교체: `방을 한 번 더 탭하면 확대해서 수납장을 편집할 수 있어요` → `수납장은 바로 드래그해서 옮기고, 방을 한 번 더 탭하면 확대 편집할 수 있어요`.
- globals.css에서 `.gm-edit .gm-sto{pointer-events:none}` 규칙 삭제(편집 오버레이가 인터랙티브 타일이 됨).
- `.gm-sto`에 편집 타일로 쓰일 때의 시각 추가: `.gm-sto.gm-selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}`는 기존 `.gm-selected` 일반 규칙이 커버하는지 grep — 커버되면 추가 불필요.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): 탑뷰에서 수납장 직접 드래그/리사이즈 — 비정사각 셀(cellH) 지원"
```

---

### Task 2: 수납장 화면 2-pane (좌 칸 트리 / 우 물건)

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: `TreeRow`(`./TreeRow` — props: `depth, icon, name, count, expandable, expanded, onToggle, onRename, deleteTitle, deleteMessage, onDelete, levelClass?`), `InlineInput`/`InlineItemForm`/`AddRow`/`ItemRow`(`./CompartmentTree`), `childCompartments`(`@/lib/compartments`), `Icon`(`./Icon`)
- Produces: `StorageScreen` 2-pane 재작성. `CompartmentTree`·`InlineAddForm` import는 GridMap에서 제거(다른 사용처 없으면).

- [ ] **Step 1: StorageScreen 교체**

기존 StorageScreen 본문을 다음으로 교체(import 추가: `TreeRow`, `InlineItemForm`, `ItemRow`, `childCompartments`, `Icon`, `Compartment` 타입):

```tsx
// 수납장 화면: 좌=칸 트리(구조) / 우=선택 칸의 직속 물건 — 아래로만 길어지는 아코디언 대신 가로 공간 활용(스펙 §1)
function StorageScreen({ p, storage, flash, onBack }: {
  p: GridMapProps; storage: Storage; flash: boolean; onBack: () => void
}) {
  const [selCmpId, setSelCmpId] = useState<string | null>(null) // null = 수납장 루트
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const compartments = storage.compartments ?? []
  const validIds = new Set(compartments.map((c) => c.id))
  const sel = selCmpId && validIds.has(selCmpId) ? selCmpId : null // 선택 칸 소실 시 루트 복귀
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = sel
    ? allItems.filter((it) => it.compartment_id === sel)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const directCount = (cmpId: string | null) => (
    cmpId
      ? allItems.filter((it) => it.compartment_id === cmpId).length
      : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id)).length
  )
  const selName = sel ? (compartments.find((c) => c.id === sel)?.name ?? storage.name) : storage.name
  return (
    <div className={`gmap-page${flash ? ' gm-focus' : ''}`}>
      <DrillHeader name={storage.name} onBack={onBack}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)} />
      <div className="sp-panes">
        <div className="sp-left">
          {addingCmp
            ? <InlineInput depth={0} placeholder="칸 이름" onSubmit={(n) => {
                p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: sel }])
                setAddingCmp(false)
              }} onCancel={() => setAddingCmp(false)} />
            : <AddRow depth={0} label="칸" onClick={() => setAddingCmp(true)} />}
          <button type="button" className={`trow sp-root${sel === null ? ' sel' : ''}`} onClick={() => setSelCmpId(null)}>
            <span className="trow-ico"><Icon name="folder" size={16} /></span>
            <span className="trow-name">{storage.name}</span>
            {directCount(null) > 0 && <span className="trow-meta">{directCount(null)}</span>}
          </button>
          {childCompartments(compartments, null).map((c) => (
            <SpCmpNode key={c.id} cmp={c} depth={1} compartments={compartments}
              sel={sel} onSelect={setSelCmpId} directCount={directCount}
              onRename={(id, n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === id ? { ...x, name: n } : x)))}
              onDelete={(id) => p.onDeleteCompartment(storage, id)} />
          ))}
        </div>
        <div className="sp-right">
          <div className="sp-right-head">{selName}</div>
          {addingItem
            ? <InlineItemForm depth={0} onSubmit={async (d) => { await p.onAddItem(storage, sel, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />
            : <AddRow depth={0} label="물건" onClick={() => setAddingItem(true)} />}
          <div className="sp-items">
            {items.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={0} onDelete={p.onDeleteItem} />)}
            {items.length === 0 && <div className="tree-empty">아직 물건이 없어요</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// 좌측 칸 트리 노드: 탭=선택+펼침, ⋯=이름수정/삭제(TreeRow 재사용)
function SpCmpNode({ cmp, depth, compartments, sel, onSelect, directCount, onRename, onDelete }: {
  cmp: Compartment; depth: number; compartments: Compartment[]
  sel: string | null; onSelect: (id: string) => void; directCount: (id: string | null) => number
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const children = childCompartments(compartments, cmp.id)
  return (
    <div className="tnode">
      <TreeRow depth={depth - 1} levelClass={sel === cmp.id ? 'sel' : ''} icon="folder" name={cmp.name}
        count={directCount(cmp.id)}
        expandable={children.length > 0} expanded={expanded}
        onToggle={() => { onSelect(cmp.id); setExpanded((e) => !e) }}
        onRename={(n) => onRename(cmp.id, n)}
        deleteTitle="칸 삭제" deleteMessage={`'${cmp.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => onDelete(cmp.id)}
      />
      {expanded && children.map((c) => (
        <SpCmpNode key={c.id} cmp={c} depth={depth + 1} compartments={compartments}
          sel={sel} onSelect={onSelect} directCount={directCount} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  )
}
```

`CompartmentTree`·`InlineAddForm`가 GridMap에서 미사용이 되면 import에서 제거(grep으로 확인 — 다른 컴포넌트는 계속 사용하므로 파일은 무변경).

- [ ] **Step 2: globals.css — 2-pane**

도식화 섹션에 추가:

```css
/* 수납장 화면 2-pane: 좌=칸 트리 / 우=선택 칸 물건 */
.sp-panes{flex:1;min-height:0;display:flex;gap:12px}
.sp-left{width:40%;min-width:150px;max-width:280px;overflow-y:auto;border-right:1px solid var(--line);padding-right:8px;display:flex;flex-direction:column}
.sp-right{flex:1;min-width:0;overflow-y:auto;display:flex;flex-direction:column}
.sp-root{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 6px;border-radius:7px;text-align:left}
.sp-root:hover{background:var(--panel)}
.trow.sel,.sp-root.sel{background:var(--accent-soft)}
.trow.sel .trow-name{color:var(--accent-ink);font-weight:600}
.sp-right-head{font-size:13px;font-weight:700;color:var(--ink-soft);padding:8px 6px 2px}
.sp-items{display:flex;flex-direction:column}
```

`gm-focus` 타깃 조정: `.gm-focus .gmap-scroll{...}` → `.gm-focus .gmap-scroll,.gm-focus .sp-right{animation:gm-focus 1.6s ease-out}` (StorageScreen에 `.gmap-scroll`이 사라지므로).

- [ ] **Step 3: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): 수납장 화면 2-pane — 좌 칸 트리/우 선택 칸 물건, 칸·물건 추가 분리"
```

---

### Task 3: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트. 2. 최종 리뷰(opus) — 중첩 EditableTile 포인터 격리(수납장 드래그↔방 드래그/선택), cellH 수학, 2-pane 선택·소실 복귀·추가 대상 정합(목록 뷰와 데이터 의미 동일), 모바일 390px 좌우 폭. 3. push·원장·메모리·수동 안내.
