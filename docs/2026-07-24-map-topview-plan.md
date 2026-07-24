# 도식화 통합 탑뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-map-topview-design.md` 구현 — 맵을 2레벨(탑뷰=방+수납장 오버레이 / 수납장=아코디언)로 재구조, 편집은 "선택-재탭 방 확대" 방식.

**Architecture:** `GridMap.tsx` 단일 파일 재구조 — 경로 스택(resolvePath) 제거 → `storageId`/`editRoomId` 두 상태. 수납장 오버레이는 방 타일 내부 %-비례 절대배치. 수납장 화면은 목록 뷰의 `CompartmentTree` 아코디언 재사용. `RoomCanvas`(L1)·`StorageView`(칸 스택) 삭제.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 수정 파일: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`만. page.tsx·데이터 계층·목록 뷰 무변경(`GridMapProps` 시그니처 유지).
- 삭제 카피·폼은 기존 그대로: 방 "'○○' 방과 그 안의 수납장·물건이 함께 삭제됩니다", 수납장 "'○○' 수납장과 그 안의 물건이 함께 삭제됩니다".
- `EditableTile`의 포인터 로직(캡처·stopPropagation·moved 가드·변경 시에만 onCommit 1회)은 유지 — Task 2의 `maxRows` 클램프만 추가.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` 전부 통과.

---

### Task 1: 보기 재구조 — 탑뷰 수납장 오버레이 + 수납장 아코디언 화면

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: `CompartmentTree`(`./CompartmentTree` — props: `storage, items, members, photoUrls?, baseDepth?, onCompartmentsChange(compartments), onDeleteCompartment(id), onAddItem(cid, draft), onDeleteItem(item)`), `DrillHeader`, `AddRow`/`InlineInput`/`InlineAddForm`, `roomInnerGrid`/`storageRect`
- Produces: `GridMap` 상태 = `storageId: string | null` (+`focusFlash`). `HomeCanvas`가 `onOpenStorage(id)` 수신. 편집은 이 태스크에선 기존 그대로(방 이동/리사이즈만 — 수납장 편집·확대는 Task 2). `RoomCanvas`/`StorageView`와 `resolvePath`/`PathSeg`/`childCompartments`/`descendantIds`/`ItemRow`/`Compartment` import 삭제, `CompartmentTree` import 추가.

- [ ] **Step 1: GridMap 본체 교체** (34–67행)

```tsx
// 도식화: 2레벨 — 탑뷰(방+수납장 오버레이) / 수납장 화면(아코디언). 노드가 동기화로 사라지면 자동 탑뷰 복귀.
export function GridMap(p: GridMapProps) {
  const [storageId, setStorageId] = useState<string | null>(null)
  const [focusFlash, setFocusFlash] = useState(false)

  // 검색 점프: 해당 수납장 화면으로 직행(소모형 prop)
  useEffect(() => {
    if (!p.focusStorageId) return
    const jump = () => { setStorageId(p.focusStorageId); setFocusFlash(true) }
    jump()
    p.onConsumeFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusStorageId])

  useEffect(() => {
    if (!focusFlash) return
    const t = setTimeout(() => setFocusFlash(false), 1600)
    return () => clearTimeout(t)
  }, [focusFlash])

  const storage = storageId ? (p.storages.find((s) => s.id === storageId) ?? null) : null
  if (storage) return <StorageScreen p={p} storage={storage} flash={focusFlash} onBack={() => setStorageId(null)} />
  return <HomeCanvas p={p} onOpenStorage={setStorageId} />
}
```

- [ ] **Step 2: HomeCanvas — 수납장 오버레이**

시그니처를 `{ p, onOpenStorage }: { p: GridMapProps; onOpenStorage: (id: string) => void }`로. 방 타일 렌더를 다음으로 교체(EditableTile 유지, `onOpen` 무동작, 개수 뱃지 제거 — 수납장이 보이므로 중복):

```tsx
            {p.rooms.map((room) => {
              const inner = roomInnerGrid(room)
              const roomStorages = p.storages.filter((s) => s.room_id === room.id)
              return (
                <EditableTile key={room.id} rect={{ x: room.x, y: room.y, w: room.w, h: room.h }}
                  cell={cell} cols={COLS} minW={ROOM_MIN} minH={ROOM_MIN}
                  editing={editing} selected={selectedId === room.id}
                  className="gm-tile gm-room"
                  onSelect={() => setSelectedId(room.id)}
                  onOpen={() => {}} // 보기에서 방 탭은 무동작 — 방은 레이아웃일 뿐(스펙 §1)
                  onCommit={(next) => p.onRoomGeometry(room, next)}>
                  <span className="gm-name">{room.name}</span>
                  {/* 수납장 오버레이 — 방-로컬 셀을 방 사각형에 %-비례 배치 */}
                  {roomStorages.map((s) => {
                    const r = storageRect(s)
                    const st = {
                      left: `${(r.x / inner.cols) * 100}%`, top: `${(r.y / inner.rows) * 100}%`,
                      width: `${(r.w / inner.cols) * 100}%`, height: `${(r.h / inner.rows) * 100}%`,
                    }
                    return editing ? (
                      <div key={s.id} className="gm-sto" style={st}><span>{s.name}</span></div>
                    ) : (
                      <button key={s.id} type="button" className="gm-sto" style={st}
                        onClick={(e) => { e.stopPropagation(); onOpenStorage(s.id) }}>
                        <span>{s.name}</span>
                      </button>
                    )
                  })}
                </EditableTile>
              )
            })}
```

- [ ] **Step 3: StorageScreen 신설, RoomCanvas·StorageView 삭제**

`RoomCanvas`(118–166행)·`StorageView`(168–225행) 함수를 삭제하고 다음을 추가. import 정리: `resolvePath`/`PathSeg`·`childCompartments`/`descendantIds`·`ItemRow`·`Compartment`·`contentRows`(HomeCanvas가 계속 씀 — 유지) 중 **미사용이 된 것만** 제거, `CompartmentTree` 추가.

```tsx
// 수납장 화면: 헤더 + 상단 추가 + 아코디언(목록 뷰와 동일 컴포넌트) — 칸부터는 공간이 아니라 분류(스펙 §1)
function StorageScreen({ p, storage, flash, onBack }: {
  p: GridMapProps; storage: Storage; flash: boolean; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  return (
    <div className={`gmap-page${flash ? ' gm-focus' : ''}`}>
      <DrillHeader name={storage.name} onBack={onBack}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll">
        <CompartmentTree storage={storage} items={items} members={p.members} photoUrls={p.photoUrls} baseDepth={0}
          onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
          onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
          onAddItem={(cid, d) => p.onAddItem(storage, cid, d)}
          onDeleteItem={p.onDeleteItem}
        />
        {compartments.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: globals.css**

추가(도식화 섹션):

```css
.gm-room{overflow:hidden}
.gm-room > .gm-name{position:relative;z-index:2;pointer-events:none}
.gm-sto{
  position:absolute;z-index:1;display:flex;align-items:flex-start;
  background:var(--surface);border:1px solid var(--line);border-radius:6px;
  padding:2px 5px;overflow:hidden;text-align:left;
}
.gm-sto span{font-size:10.5px;font-weight:600;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gm-sto:hover{border-color:var(--accent)}
.gm-edit .gm-sto{pointer-events:none}
```

교체: `.gm-focus .gm-stack,.gm-focus .gm-items{...}` → `.gm-focus .gmap-scroll{animation:gm-focus 1.6s ease-out}`.
삭제(사용처 grep 0 확인 후): `.gm-stack`, `.gm-block`(+`:hover`), `.gm-items`, `.gm-roomview`.

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): 통합 탑뷰(방+수납장 오버레이) + 수납장 아코디언 화면 — 2레벨 재구조"
```

과도기 참고(보고서에 기재): 이 태스크 완료 시점엔 수납장 이동/리사이즈 진입로가 일시 없음(Task 2의 확대 편집이 담당).

---

### Task 2: 편집 확장 — 선택-재탭 방 확대(RoomEditView) + maxRows 클램프

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 구조
- Produces: GridMap 상태에 `editRoomId: string | null` + `editing`(탑뷰 편집 토글 상태를 GridMap으로 리프트 — 확대에서 복귀해도 편집 유지). `EditableTile`에 `maxRows?: number` prop.

- [ ] **Step 1: 편집 상태 리프트 + 확대 진입**

`GridMap`에 `const [editing, setEditing] = useState(false)`와 `const [editRoomId, setEditRoomId] = useState<string | null>(null)` 추가. 렌더 분기(수납장 화면 우선):

```tsx
  const storage = storageId ? (p.storages.find((s) => s.id === storageId) ?? null) : null
  const editRoom = editRoomId ? (p.rooms.find((r) => r.id === editRoomId) ?? null) : null
  if (storage) return <StorageScreen p={p} storage={storage} flash={focusFlash} onBack={() => setStorageId(null)} />
  if (editRoom) return <RoomEditView p={p} room={editRoom} onBack={() => setEditRoomId(null)} />
  return <HomeCanvas p={p} editing={editing} onToggleEditing={() => setEditing((e) => !e)} onOpenStorage={setStorageId} onEditRoom={setEditRoomId} />
```

`HomeCanvas` 시그니처에 `editing: boolean; onToggleEditing: () => void; onEditRoom: (id: string) => void` 추가(로컬 `editing` state 제거, `selectedId`는 로컬 유지). 편집 토글 버튼 onClick은 `{ onToggleEditing(); setSelectedId(null) }`. 방 타일 `onSelect`를 재탭-확대로:

```tsx
                  onSelect={() => { if (selectedId === room.id) onEditRoom(room.id); else setSelectedId(room.id) }}
```

편집 중 안내 한 줄 — `gmap-bar` 아래에:

```tsx
      {editing && <div className="gmap-hint">방을 한 번 더 탭하면 확대해서 수납장을 편집할 수 있어요</div>}
```

- [ ] **Step 2: RoomEditView 신설**

```tsx
// 방 확대 편집: 수납장 이동/리사이즈(방 안으로 클램프) + 방 이름수정/삭제 + 수납장 추가. ‹로 탑뷰 편집 복귀.
function RoomEditView({ p, room, onBack }: { p: GridMapProps; room: Room; onBack: () => void }) {
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w } = useSize(wrapRef)
  const inner = roomInnerGrid(room)
  const cell = w / inner.cols
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="gmap-page">
      <DrillHeader name={room.name} onBack={onBack}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)} />
      <div className="gmap-bar">
        {adding
          ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      </div>
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap" style={{ height: inner.rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {storages.length === 0 && <div className="gmap-empty">수납장이 없어요 — 위 ‘수납장 추가’로 시작해보세요</div>}
            {storages.map((s) => (
              <EditableTile key={s.id} rect={storageRect(s)}
                cell={cell} cols={inner.cols} minW={1} minH={1} maxRows={inner.rows}
                editing selected={selectedId === s.id}
                className="gm-tile gm-storage"
                onSelect={() => setSelectedId(s.id)}
                onOpen={() => {}}
                onCommit={(next) => p.onStorageGeometry(s, next)}>
                <span className="gm-name">{s.name}</span>
              </EditableTile>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: EditableTile — maxRows 클램프**

props에 `maxRows?: number` 추가. `clampMove`의 y와 리사이즈 h를:

```tsx
    y: maxRows ? Math.min(Math.max(r.y, 0), maxRows - r.h) : Math.max(r.y, 0),
```

```tsx
            h: maxRows ? Math.min(Math.max(rect.h + dy, minH), maxRows - rect.y) : Math.max(rect.h + dy, minH),
```

주석(무제한 관련) 갱신: "탑뷰는 아래 무제한(행 확장), 방 확대는 maxRows로 방 안 클램프".

- [ ] **Step 4: globals.css**

```css
.gmap-hint{font-size:12px;color:var(--ink-soft);padding:2px 4px 6px}
```

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): 편집 — 방 선택-재탭 확대(RoomEditView), 수납장 방 안 클램프(maxRows)"
```

---

### Task 3: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트. 2. 최종 리뷰(opus) — 오버레이 %-수학(패딩 박스 기준), 편집 상태 리프트 후 복귀 흐름, 삭제 코드 잔재, 검색 점프/flash 재타깃, 접근성(무동작 방 타일 role=button). 3. push·원장·메모리·수동 확인 안내.
