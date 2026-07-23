# 목록 트리 "심플 정돈" 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다크 아코디언 트리를 참고 이미지(홈즈 MVP 심플)처럼 정돈한다 — 행 우측 인라인 `＋` 제거, 각 레벨 **상단 `＋ 추가`**로 통일, 물건은 **최소 입력(이름만)+메모·사진 접힘**, 검색 결과에 **위치 브레드크럼**.

**Architecture:** `TreeRow`에서 추가 로직을 걷어내 행을 `[caret][아이콘][이름][개수][⋯]`로 단순화하고, 추가는 각 레벨 펼침 시 자식 목록 맨 위의 공용 `AddRow`(방·수납장) / `InlineAddForm`(수납장·칸 하위: 칸/물건 토글+최소입력)로 옮긴다. 검색은 순수함수 `compartmentPath`로 브레드크럼을 만든다. 데이터·저장·콜백·테마 토큰 무변경.

**Tech Stack:** Next.js/React/TS, 순수 CSS. 컴포넌트 테스트 인프라 없음 → UI 태스크는 tsc+lint+수동 검증. `lib/` 순수함수(검색·경로)만 vitest TDD.

## Global Constraints

- UI 문구 한국어, 기존 카피 톤. **새 의존성 금지.** 기존 `Modal`/`InlineInput`/`InlineItemForm`/`DeleteBtn`/`.sheet`·테마 토큰 재사용.
- 부모 콜백 시그니처 무변경(`onAddRoom/onRenameRoom/onDeleteRoom/onAddStorage/onRenameStorage/onDeleteStorage/onCompartmentsChange/onDeleteCompartment/onAddItem/onDeleteItem`).
- **테마 색 토큰(`:root`/다크) 무변경.** 아코디언·다크 유지. 드릴다운·라이트 전환·지도 재설계·모달 add/edit·물건 상세 화면은 **비목표**.
- 물건 기능 보존: 추가는 이름만 기본, 메모/사진은 `＋ 메모·사진` 접힘으로 유지(삭제 아님).
- 검증 게이트: UI 태스크 = `npx tsc --noEmit`(exit 0) + `npm run lint`(exit 0) + 수동 시나리오. lib 태스크 = 위 + `npm test`(vitest) 통과(TDD). 모두 `web/`에서. baseline green 확인됨.
- `main` 직접 작업(프로젝트 정책). 전체 완료(마지막 태스크) 후 push(=Vercel 자동배포).

---

## File Structure

| 파일 | 변경 | 태스크 |
|---|---|---|
| `web/src/components/CompartmentTree.tsx` | `AddRow`·`InlineAddForm` 신규 export; `CompartmentNode` 상단 ＋추가 이행 | T1, T3 |
| `web/src/app/globals.css` | `.tadd-row`/`.taddx*` 추가; 죽은 `.trow-act`/`.tree-add-root` 제거 | T1, T4 |
| `web/src/components/TreeRow.tsx` | `addOptions` optional화(T1) → 완전 제거·정리(T4) | T1, T4 |
| `web/src/components/HomeTree.tsx` | root/방/수납장 상단 ＋추가 이행, `InlineItemForm` import 제거 | T2 |
| `web/src/lib/compartments.ts` (+test) | `compartmentPath` 신규 | T5 |
| `web/src/lib/search.ts` (+test) | `SearchHit.pathNames` 추가 | T5 |
| `web/src/components/SearchBar.tsx` | 위치 브레드크럼 표시 | T5 |

---

## Task 1: 공용 추가 컴포넌트(AddRow·InlineAddForm) + CSS + TreeRow addOptions optional화

**Files:**
- Modify: `web/src/components/CompartmentTree.tsx` (신규 export 2개)
- Modify: `web/src/app/globals.css` (신규 스타일)
- Modify: `web/src/components/TreeRow.tsx` (`addOptions` optional)

**Interfaces:**
- Produces:
  - `AddRow({ depth: number, label: string, onClick: () => void })` — 트리 행 모양의 `＋ {label}` 버튼.
  - `InlineAddForm({ depth: number, onAddCompartment: (name: string) => void, onAddItem: (draft: {name;memo;photoFile?}) => void|Promise<void>, onCancel: () => void })` — 칸/물건 토글 + 이름(+접힘 메모·사진) 최소입력 폼.
- `TreeRow`의 `addOptions`가 optional이 되어, 이후 태스크에서 호출부가 생략해도 컴파일된다(＋ 미표시).

- [ ] **Step 1: `CompartmentTree.tsx`에 `AddRow`·`InlineAddForm` 추가**

`InlineItemForm` 정의 바로 아래(현재 67번째 줄 `}` 다음, `function ItemRow` 앞)에 삽입:

```tsx
// 각 레벨 상단 '＋ 추가' 트리거 행(방·수납장 등 이름만 받는 곳)
export function AddRow({ depth, label, onClick }: { depth: number; label: string; onClick: () => void }) {
  return <button type="button" className="tadd-row" style={pad(depth)} onClick={onClick}>＋ {label}</button>
}

// 수납장/칸 하위 추가: 칸/물건 토글 + 최소입력(이름) + 물건일 때 메모·사진 접힘
export function InlineAddForm({ depth, onAddCompartment, onAddItem, onCancel }: {
  depth: number
  onAddCompartment: (name: string) => void
  onAddItem: (draft: AddDraft) => void | Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<'cmp' | 'item'>('item')
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [details, setDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form className="tadd-form taddx" style={pad(depth)}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n || busy) return
        if (kind === 'cmp') { onAddCompartment(n); return }
        setBusy(true)
        try { await onAddItem({ name: n, memo: memo.trim(), photoFile: photo ?? undefined }) } finally { setBusy(false) }
      }}
    >
      <div className="taddx-kind">
        <button type="button" className={kind === 'cmp' ? 'on' : ''} aria-pressed={kind === 'cmp'} onClick={() => setKind('cmp')}>📁 칸</button>
        <button type="button" className={kind === 'item' ? 'on' : ''} aria-pressed={kind === 'item'} onClick={() => setKind('item')}>📦 물건</button>
      </div>
      <div className="taddx-row">
        <input autoFocus type="text" placeholder={kind === 'cmp' ? '칸 이름' : '물건 이름'} maxLength={kind === 'cmp' ? 20 : 30}
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
        <button type="submit" disabled={!name.trim() || busy}>추가</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
      </div>
      {kind === 'item' && (details ? (
        <div className="taddx-row">
          <input type="text" placeholder="메모 (선택)" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
          <label className={`tadd-photo${photo ? ' has' : ''}`}>{photo ? '✅ 사진' : '📷'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      ) : (
        <button type="button" className="taddx-more" onClick={() => setDetails(true)}>＋ 메모·사진</button>
      ))}
    </form>
  )
}
```

- [ ] **Step 2: `globals.css`에 스타일 추가**

`.tadd-photo.has{...}` 줄(현재 361) 바로 다음에 삽입:

```css
/* 상단 '＋ 추가' 행 + 칸/물건 토글 추가 폼 */
.tadd-row{display:flex;align-items:center;min-height:40px;padding:0 6px;font-size:13px;font-weight:600;color:var(--accent-ink);border-radius:8px;text-align:left;width:100%}
.tadd-row:hover{background:var(--accent-soft)}
.taddx{flex-direction:column;align-items:stretch;gap:6px}
.taddx-kind{display:flex;gap:4px}
.taddx-kind button{flex:1;font-size:12.5px;font-weight:700;padding:8px;border-radius:8px;background:var(--bg);color:var(--ink-soft)}
.taddx-kind button.on{background:var(--accent-soft);color:var(--accent-ink)}
.taddx-row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.taddx-more{align-self:flex-start;font-size:12px;font-weight:600;color:var(--accent-ink);padding:4px 2px}
```

- [ ] **Step 3: `TreeRow.tsx` — `addOptions` optional화**

Props 타입 변경 — old:
```
  addOptions: AddOption[]
```
new:
```
  addOptions?: AddOption[]
```

구조분해에 기본값 부여 — old:
```
  onRename, addOptions, deleteTitle, deleteMessage, onDelete, levelClass = '',
```
new:
```
  onRename, addOptions = [], deleteTitle, deleteMessage, onDelete, levelClass = '',
```

(나머지 add 로직은 T4에서 제거. 지금은 optional만 — 기존 호출부가 addOptions를 계속 넘기므로 동작 불변.)

- [ ] **Step 4: 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"
```
Expected: `tsc:0`, `lint:0`. (신규 export는 아직 미사용이지만 export라 lint 무경고.)

- [ ] **Step 5: 커밋**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/CompartmentTree.tsx web/src/app/globals.css web/src/components/TreeRow.tsx && git commit -m "$(printf 'feat(tree): AddRow·InlineAddForm 신규 + TreeRow addOptions optional\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: HomeTree — root/방/수납장 상단 ＋추가 이행

**Files:**
- Modify: `web/src/components/HomeTree.tsx`

**Interfaces:**
- Consumes: `AddRow`, `InlineAddForm`, `InlineInput`(기존), `TreeRow`(addOptions 생략).

- [ ] **Step 1: import 정리**

old:
```
import { CompartmentTree, InlineInput, InlineItemForm } from './CompartmentTree'
```
new:
```
import { CompartmentTree, InlineInput, AddRow, InlineAddForm } from './CompartmentTree'
```
(`InlineItemForm`은 HomeTree에서 더 이상 안 씀. DetailPanel이 계속 export를 사용하므로 CompartmentTree의 정의는 유지.)

- [ ] **Step 2: `HomeTree` 본문 — ＋방추가 상단 이동**

old (함수 본문 return):
```
    <div className="home-tree">
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 아래 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => <TreeRoom key={room.id} room={room} {...p} />)}
      {addingRoom ? (
        <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAddingRoom(false) }} onCancel={() => setAddingRoom(false)} />
      ) : (
        <div className="tree-add-root"><button type="button" onClick={() => setAddingRoom(true)}>＋ 방 추가</button></div>
      )}
    </div>
```
new:
```
    <div className="home-tree">
      {addingRoom
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAddingRoom(false) }} onCancel={() => setAddingRoom(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAddingRoom(true)} />}
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => <TreeRoom key={room.id} room={room} {...p} />)}
    </div>
```

- [ ] **Step 3: `TreeRoom` — addOptions 제거 + 상단 ＋수납장추가**

`<TreeRow ...>`에서 이 줄 제거:
```
        addOptions={[{ label: '＋ 수납장', onSelect: () => { setExpanded(true); setAdding(true) } }]}
```
그리고 expanded 블록 — old:
```
      {expanded && (
        <>
          {adding && <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
```
new:
```
      {expanded && (
        <>
          {adding
            ? <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
            : <AddRow depth={1} label="수납장 추가" onClick={() => setAdding(true)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
```

- [ ] **Step 4: `TreeStorage` 전체 교체** — addOptions 제거, `adding` boolean, 상단 InlineAddForm

old (함수 전체, 현재 68–104):
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
new:
```
function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const compartments = storage.compartments ?? []
  const hasKids = compartments.length > 0 || items.length > 0
  return (
    <div className="tnode">
      <TreeRow
        depth={1} levelClass="lv-storage" icon="📦" name={storage.name} count={items.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)}
      />
      {expanded && (
        <>
          {adding
            ? <InlineAddForm depth={2}
                onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding(false) }}
                onAddItem={async (d) => { await p.onAddItem(storage, null, d); setAdding(false) }}
                onCancel={() => setAdding(false)} />
            : <AddRow depth={2} label="추가" onClick={() => setAdding(true)} />}
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

- [ ] **Step 5: 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"
```
Expected: `tsc:0`, `lint:0`. (미사용 `InlineItemForm` import 잔존 시 lint 실패 → Step1 확인.)

- [ ] **Step 6: 수동 확인**
- 목록 맨 위 `＋ 방 추가` → 방 생성. 방 탭 펼침 → `＋ 수납장 추가` → 생성.
- 수납장 탭 펼침 → `＋ 추가` → 칸/물건 토글, 이름만 기본, `＋ 메모·사진` 펼치면 메모/사진, 등록.
- 행 우측에 `＋` 사라지고 `⋯`만 남았는지.

- [ ] **Step 7: 커밋**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/HomeTree.tsx && git commit -m "$(printf 'feat(tree): 방/수납장 상단 ＋추가 이행(인라인 ＋ 제거, 최소입력)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: CompartmentNode — 상단 ＋추가 이행

**Files:**
- Modify: `web/src/components/CompartmentTree.tsx` (`CompartmentNode`만)

- [ ] **Step 1: `CompartmentNode` 전체 교체**

old (현재 146–178):
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
new:
```
function CompartmentNode(p: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const children = childCompartments(p.compartments, p.compartment.id)
  const myItems = p.items.filter((it) => it.compartment_id === p.compartment.id)
  const hasKids = children.length > 0 || myItems.length > 0

  return (
    <div className="tnode">
      <TreeRow
        depth={p.depth} icon="📁" name={p.compartment.name} count={myItems.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRename(p.compartment.id, n)}
        deleteTitle="칸 삭제" deleteMessage={`'${p.compartment.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteCompartment(p.compartment.id)}
      />
      {expanded && (
        <>
          {adding
            ? <InlineAddForm depth={p.depth + 1}
                onAddCompartment={(n) => { p.onAddCompartment(p.compartment.id, n); setAdding(false) }}
                onAddItem={async (d) => { await p.onAddItem(p.compartment.id, d); setAdding(false) }}
                onCancel={() => setAdding(false)} />
            : <AddRow depth={p.depth + 1} label="추가" onClick={() => setAdding(true)} />}
          {children.map((c) => <CompartmentNode {...p} key={c.id} compartment={c} depth={p.depth + 1} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={p.depth + 1} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}
```

주의: `InlineInput`/`InlineItemForm`은 이제 `CompartmentNode`가 안 쓰지만, 파일에 정의·export되어 다른 곳(DetailPanel·HomeTree rooms)에서 계속 쓰이므로 **삭제 금지**. `AddRow`/`InlineAddForm`은 같은 파일 상단(T1)에 정의됨 — import 불필요.

- [ ] **Step 2: 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"
```
Expected: `tsc:0`, `lint:0`.

- [ ] **Step 3: 수동 확인** — 칸 펼침 → `＋ 추가` → 칸/물건 토글로 중첩 칸·물건 추가. 물건 최소입력+메모/사진 접힘 동작.

- [ ] **Step 4: 커밋**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/CompartmentTree.tsx && git commit -m "$(printf 'feat(tree): 칸 상단 ＋추가 이행 — 전 레벨 상단 추가 통일\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: TreeRow 정리(죽은 add 로직 제거) + 죽은 CSS 제거

**Files:**
- Modify: `web/src/components/TreeRow.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: `TreeRow.tsx` — add 관련 코드 완전 제거**

(a) `AddOption` 타입 제거 — old:
```
type AddOption = { label: string; onSelect: () => void }

```
new: (해당 두 줄 삭제 — 빈 줄 포함)

(b) Props에서 `addOptions` 제거 — old:
```
  addOptions?: AddOption[]
```
new: (해당 줄 삭제)

(c) 구조분해에서 `addOptions = []` 제거 — old:
```
  onRename, addOptions = [], deleteTitle, deleteMessage, onDelete, levelClass = '',
```
new:
```
  onRename, deleteTitle, deleteMessage, onDelete, levelClass = '',
```

(d) `addOpen` 상태 + `handlePlus` 제거 — old:
```
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
```
new:
```
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  function startEdit() { setDraft(name); setEditing(true) }
  function commitEdit() {
    const n = draft.trim()
    if (n && n !== name) onRename(n)
    setEditing(false)
  }
```

(e) 우측 액션 렌더 단순화 — old:
```
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
```
new:
```
      {!editing && (
        <span className="trow-actions" onClick={(e) => e.stopPropagation()}>
          <RowMenu onEditName={startEdit} onDelete={onDelete} deleteTitle={deleteTitle} deleteMessage={deleteMessage} />
        </span>
      )}
```

(f) 컴포넌트 주석 정리 — old:
```
// 방/수납장/칸 공용 행. 탭=펼치기, 이름수정은 ⋯메뉴로만(탭으로 편집 안 됨), ＋는 하위 추가 트리거.
```
new:
```
// 방/수납장/칸 공용 행. 탭=펼치기, 이름수정은 ⋯메뉴로만(탭으로 편집 안 됨). 추가는 각 레벨 상단 AddRow가 담당.
```

- [ ] **Step 2: `globals.css` — 죽은 규칙 제거**

(a) `.trow-act` 제거 — old:
```
.trow-act{font-size:12px;font-weight:700;color:var(--accent-ink);background:var(--accent-soft);padding:8px 12px;border-radius:8px;white-space:nowrap}
```
new: (해당 줄 삭제)

(b) `.tree-add-root` 제거 — old:
```
.tree-add-root{margin-top:8px;padding:0 6px}
.tree-add-root button{font-size:12.5px;font-weight:600;color:var(--ink-soft);padding:6px 10px;border-radius:7px}
.tree-add-root button:hover{background:var(--accent-soft);color:var(--accent-ink)}
```
new: (세 줄 삭제)

- [ ] **Step 3: 잔여 참조 확인 + 검증**

```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && grep -rn "addOptions\|trow-act\b\|tree-add-root\|AddOption" src/ ; npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"
```
Expected: grep 결과 없음(모두 제거). `tsc:0`, `lint:0`.

- [ ] **Step 4: 수동 확인** — 트리 전 레벨 행이 `[caret][아이콘][이름][개수][⋯]`로만 보이고 추가/이름수정/삭제 모두 정상.

- [ ] **Step 5: 커밋**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/components/TreeRow.tsx web/src/app/globals.css && git commit -m "$(printf 'refactor(tree): TreeRow에서 인라인 ＋ 로직·죽은 CSS 제거\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: 검색 결과 위치 브레드크럼 (TDD)

**Files:**
- Modify: `web/src/lib/compartments.ts` (+ `compartments.test.ts`)
- Modify: `web/src/lib/search.ts` (+ `search.test.ts`)
- Modify: `web/src/components/SearchBar.tsx`

**Interfaces:**
- Produces: `compartmentPath(compartments: Compartment[], id: string | null): Compartment[]` — 루트→자기 경로.
- `SearchHit`에 `pathNames: string[]` 추가(방→수납장→칸…). 기존 `roomName`/`storageName` 유지(비파괴).

- [ ] **Step 1: `compartments.test.ts`에 실패 테스트 추가**

import 줄 — old:
```
import { childCompartments, descendantIds } from './compartments'
```
new:
```
import { childCompartments, descendantIds, compartmentPath } from './compartments'
```
`describe('compartments tree', ...)` 안, `descendantIds` it 블록 다음에 추가:
```
  it('compartmentPath: 루트→자기 경로(순환 안전)', () => {
    expect(compartmentPath(cmps, 'bf').map((c) => c.name)).toEqual(['아래', '아래-앞'])
    expect(compartmentPath(cmps, 'top').map((c) => c.name)).toEqual(['위'])
    expect(compartmentPath(cmps, null)).toEqual([])
  })
```

- [ ] **Step 2: 실패 확인**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx vitest run src/lib/compartments.test.ts 2>&1 | tail -12
```
Expected: FAIL — `compartmentPath` is not a function / 미정의 export.

- [ ] **Step 3: `compartments.ts`에 `compartmentPath` 구현**

파일 끝에 추가:
```
// 루트→...→자기 칸 경로(검색 브레드크럼용). 순환 방지.
export function compartmentPath(compartments: Compartment[], id: string | null): Compartment[] {
  if (!id) return []
  const byId = new Map(compartments.map((c) => [c.id, c]))
  const chain: Compartment[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
  return chain
}
```

- [ ] **Step 4: 통과 확인**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx vitest run src/lib/compartments.test.ts 2>&1 | tail -8
```
Expected: PASS.

- [ ] **Step 5: `search.test.ts`에 pathNames 테스트 추가**

`describe('searchItems', ...)` 안, `'빈 쿼리는 빈 배열'` it 앞에 추가:
```
  it('pathNames: 방→수납장→칸 브레드크럼', () => {
    const s2 = { ...storageRow('s2', 'r1', '붙박이장'), compartments: [{ id: 'c1', name: '윗칸' }, { id: 'c2', name: '서랍', parent_id: 'c1' }] }
    const it2 = { ...item('i9', 's2', '양말', ''), compartment_id: 'c2' }
    const hits = searchItems([it2], [s2], rooms, '양말')
    expect(hits[0].pathNames).toEqual(['거실', '붙박이장', '윗칸', '서랍'])
  })
```

- [ ] **Step 6: 실패 확인**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx vitest run src/lib/search.test.ts 2>&1 | tail -12
```
Expected: FAIL — `hits[0].pathNames` undefined.

- [ ] **Step 7: `search.ts` — `pathNames` 추가**

전체 교체:
```
import type { DecItem, Storage, Room } from './types'
import { compartmentPath } from './compartments'
export type SearchHit = { itemId: string; storageId: string; roomName: string; storageName: string; memo: string; pathNames: string[] }
export function searchItems(items: DecItem[], storages: Storage[], rooms: Room[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const sById = new Map(storages.map(s => [s.id, s]))
  const rById = new Map(rooms.map(r => [r.id, r]))
  return items.filter(i => i.name.toLowerCase().includes(q) || (i.memo && i.memo.toLowerCase().includes(q)))
    .slice(0, 8).map(i => {
      const s = sById.get(i.storage_id); const r = s ? rById.get(s.room_id) : undefined
      const roomName = r?.name ?? '?'; const storageName = s?.name ?? '?'
      const cmps = compartmentPath(s?.compartments ?? [], i.compartment_id).map(c => c.name)
      return { itemId: i.id, storageId: s?.id ?? '', roomName, storageName, memo: i.memo, pathNames: [roomName, storageName, ...cmps] }
    })
}
```

- [ ] **Step 8: 통과 확인(전체 suite)**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npm test 2>&1 | tail -12
```
Expected: 모든 테스트 PASS(기존 `roomName/storageName` 테스트 포함 — 필드 유지했으므로 그대로 통과).

- [ ] **Step 9: `SearchBar.tsx` — 브레드크럼 표시**

old:
```
                  <span className="sr-loc">
                    📍 {h.roomName} → {h.storageName}
                    {h.memo ? ` · ${h.memo}` : ''}
                  </span>
```
new:
```
                  <span className="sr-loc">
                    📍 {h.pathNames.join(' › ')}
                    {h.memo ? ` · ${h.memo}` : ''}
                  </span>
```

- [ ] **Step 10: 검증 + 수동**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"; npm test 2>&1 | tail -4
```
Expected: `tsc:0`, `lint:0`, 테스트 all pass. 수동: 칸에 넣은 물건 검색 시 결과에 `방 › 수납장 › 칸 › …` 경로 표시.

- [ ] **Step 11: 커밋**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git add web/src/lib/compartments.ts web/src/lib/compartments.test.ts web/src/lib/search.ts web/src/lib/search.test.ts web/src/components/SearchBar.tsx && git commit -m "$(printf 'feat(search): 결과에 위치 브레드크럼(방 › 수납장 › 칸)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: 최종 리뷰·전체 검증·배포

- [ ] **Step 1: 데드코드/잔여 스캔**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && grep -rn "addOptions\|trow-act\b\|tree-add-root\|InlineItemForm" src/
```
확인: `addOptions`/`.trow-act`/`.tree-add-root` 참조 0. `InlineItemForm`은 정의(CompartmentTree) + DetailPanel import만 남아야 함(트리 쪽 미사용).

- [ ] **Step 2: 전체 검증**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map/web && npx tsc --noEmit; echo "tsc:$?"; npm run lint; echo "lint:$?"; npm test 2>&1 | tail -4; npm run build 2>&1 | tail -6; echo "build:$?"
```
Expected: `tsc:0`, `lint:0`, 테스트 all pass, `build:0`.

- [ ] **Step 3: 전체 수동 시나리오(모바일 폭 + 데스크톱 폭)**
1. 각 레벨 상단 `＋ 추가`로 방/수납장/칸/물건 추가. 물건은 이름만 기본 + `＋ 메모·사진` 접힘.
2. 행에 인라인 `＋` 없음(`⋯`만). 탭=펼치기, `⋯`=이름수정/삭제 정상.
3. 검색 결과에 `방 › 수납장 › 칸` 브레드크럼.
4. 도식화(지도) 뷰 회귀 없음(DetailPanel의 InlineItemForm/InlineInput 그대로 동작).

- [ ] **Step 4: push(배포)**
```bash
cd /Users/cheolminhan/claude_workspace/homes_map && git push
```
Vercel 자동배포 후 실기기 재확인.

---

## Self-Review (작성자 점검)

**Spec 커버리지:** 시각 정돈(행에서 ＋ 제거·상단 통일) ✔(T2–T4) · 상단 ＋추가 ✔(AddRow, T1–T3) · 최소 입력(이름만+메모/사진 접힘) ✔(InlineAddForm, T1) · 칸/물건 토글 ✔(T1) · 브레드크럼 ✔(T5). 모달/드릴다운/지도/물건상세/테마변경 = 의도적 제외.

**Placeholder 스캔:** 없음. 모든 코드 블록 전문. UI 검증은 tsc/lint/수동, lib는 vitest TDD(제약에 명시).

**타입 일관성:** `InlineAddForm` props(onAddCompartment/onAddItem/onCancel) ↔ 호출부(TreeStorage/CompartmentNode) 일치. `AddDraft`(name/memo/photoFile) ↔ `onAddItem`/`onAddStorage`... 물건은 `p.onAddItem(storage,null,draft)` 시그니처 유지. `SearchHit.pathNames` ↔ `SearchBar` `h.pathNames.join` 일치. `compartmentPath` 반환 `Compartment[]` ↔ `.map(c=>c.name)` 일치.

**전이 안전:** T1에서 `addOptions` optional화 → T2/T3 호출부가 생략해도 컴파일. T4에서 완전 제거(모든 호출부가 이미 생략). 각 커밋 green.

**리스크:** `InlineAddForm`이 추가 후 부모가 닫음(setAdding(false)) — 연속 추가는 `＋ 추가` 재탭 필요(현행과 동일, 모달 패턴과 일치). 빈 컨테이너는 caret 숨김이라 "탭하면 ＋추가 나온다"는 발견성이 약할 수 있음 — 수동 확인 항목.
