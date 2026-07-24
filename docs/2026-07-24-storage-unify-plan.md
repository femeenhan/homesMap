# 수납장 화면 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-storage-unify-design.md` — 2-pane 수납장 화면을 공용 컴포넌트로 추출해 목록·도식화 공용화 + 방 이름 중앙 워터마크.

**Architecture:** `DrillHeader`를 `TreeRow.tsx`로 이동(순환 임포트 방지) → `StoragePane.tsx` 신설(GridMap의 StorageScreen/SpCmpNode 이동·일반화) → page의 `openStorageId`로 목록 배선, HomeTree/DrillDown의 수납장 진입을 교체하고 인라인 칸 트리 코드(CompartmentTree 컴포넌트·ContainerScreen·InlineAddForm) 삭제.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 데이터 계층·핸들러 시그니처 무변경(`HomeTreeProps`에 `onOpenStorage?: (id: string) => void` **옵션 추가**만 허용).
- 삭제는 grep 사용처 0건 확인 후에만. `DeleteBtn`/`InlineInput`/`InlineItemForm`/`AddRow`/`ItemRow`/`pad`는 잔존 필수.
- 2-pane 화면(StoragePane)의 동작·마크업은 현 StorageScreen과 동일해야 함(이동+props 일반화만).
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` 전부 통과.

---

### Task 1: DrillHeader 이동 + StoragePane 추출 + GridMap 배선

**Files:**
- Create: `web/src/components/StoragePane.tsx`
- Modify: `web/src/components/TreeRow.tsx`, `web/src/components/DrillDown.tsx`(임포트만), `web/src/components/GridMap.tsx`

**Interfaces:**
- Produces:
  - `TreeRow.tsx`가 `DrillHeader` export(기존 코드 그대로 이동 — RowMenu 같은 파일이라 임포트 불필요, `Icon` 기존 임포트 사용)
  - `StoragePane({ p, storage, flash, onBack }: { p: HomeTreeProps; storage: Storage; flash?: boolean; onBack: () => void })` — 현 `StorageScreen`과 동일 마크업(루트 div `gmap-page` + `gm-focus`), `SpCmpNode` 내부 이동
  - GridMap은 `StoragePane` 사용(도식화 동작 무변화)

- [ ] **Step 1: DrillHeader 이동**

`DrillDown.tsx`의 `export function DrillHeader(...)` 블록 전체를 `TreeRow.tsx` 하단으로 그대로 이동(export 유지). `DrillDown.tsx`는 `import { TreeRow, RowMenu, DrillHeader } from './TreeRow'` 형태로 갱신(자기 파일에서 제거). `GridMap.tsx`의 `import { DrillHeader } from './DrillDown'` → `'./TreeRow'`.

- [ ] **Step 2: StoragePane.tsx 신설**

GridMap.tsx의 `StorageScreen`·`SpCmpNode`를 새 파일로 **그대로 이동**하되:
- 컴포넌트명 `StorageScreen` → `StoragePane`, props 타입을 `{ p: HomeTreeProps; storage: Storage; flash?: boolean; onBack: () => void }`로(본문 무변경 — `flash`는 `flash ?? false` 없이 falsy 그대로 동작).
- 파일 헤더 임포트: `useState`(react), `Storage`/`Compartment`(types), `childCompartments`(lib/compartments), `TreeRow`/`DrillHeader`(./TreeRow), `AddRow`/`InlineInput`/`InlineItemForm`/`ItemRow`(./CompartmentTree), `Icon`(./Icon), `HomeTreeProps`(./HomeTree), `'use client'` 지시자.
- 파일 첫 주석: `// 수납장 내용 2-pane: 좌=칸 트리 / 우=선택 칸 직속 물건. 목록·도식화 공용(스펙 §1).`

- [ ] **Step 3: GridMap 배선**

GridMap.tsx에서 StorageScreen/SpCmpNode 제거, `import { StoragePane } from './StoragePane'` 추가, 렌더를 `<StoragePane p={p} storage={storage} flash={focusFlash} onBack={() => setStorageId(null)} />`로. 이동으로 죽은 임포트(TreeRow·Icon·childCompartments·InlineItemForm·ItemRow·Compartment 등) 정리 — HomeCanvas/RoomEditView가 쓰는 것(AddRow·InlineInput·DrillHeader·grid 유틸)은 유지.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add web/src/components/StoragePane.tsx web/src/components/TreeRow.tsx web/src/components/DrillDown.tsx web/src/components/GridMap.tsx
git commit -m "refactor(storage): 2-pane 수납장 화면을 StoragePane으로 추출 — DrillHeader는 TreeRow로 이동"
```

---

### Task 2: 목록 배선 + 인라인 칸 트리 삭제

**Files:**
- Modify: `web/src/components/HomeTree.tsx`, `web/src/components/DrillDown.tsx`, `web/src/components/CompartmentTree.tsx`, `web/src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `StoragePane`
- Produces: `HomeTreeProps`에 `onOpenStorage?: (id: string) => void`. page가 `openStorageId` state로 목록에서 StoragePane 렌더.

- [ ] **Step 1: HomeTree — 수납장 행 = 진입**

`Props`에 `onOpenStorage?: (id: string) => void` 추가. `TreeStorage`를 다음으로 교체(인라인 CompartmentTree/InlineAddForm/AddRow 하위 블록 제거, `room` param 불필요 시 호출부와 함께 정리):

```tsx
function TreeStorage({ storage, ...p }: { storage: Storage } & Props) {
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  return (
    <TreeRow
      depth={1} levelClass="lv-storage" icon="folder" name={storage.name} count={items.length}
      expandable={false} expanded={false} chevron
      onToggle={() => p.onOpenStorage?.(storage.id)}
      onRename={(n) => p.onRenameStorage(storage, n)}
      deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
      onDelete={() => p.onDeleteStorage(storage)}
    />
  )
}
```

`TreeRoom`의 `＋ 수납장 추가` 행은 유지. 죽은 임포트 정리.

- [ ] **Step 2: DrillDown — 수납장 행 = 진입, ContainerScreen 삭제**

- `RoomScreen`의 수납장 `TreeRow` `onToggle`을 `() => p.onOpenStorage?.(s.id)`로 교체(chevron 유지).
- `DrillDown` 본체에서 storage/cmp 분기·`ContainerScreen` 삭제 — 경로는 루트/방만: `if (!cur) return <RootScreen .../>; return <RoomScreen room={cur.room} .../>` 형태로 단순화(`cur.kind === 'room'` 가드 유지, storage 세그는 더 이상 생성 안 됨 — resolvePath가 만들 수 없으니 타입 내로잉만 처리).
- 죽은 임포트(`InlineAddForm`·`ItemRow`·`childCompartments`·`Compartment` 등) 정리.

- [ ] **Step 3: CompartmentTree.tsx — 데드 컴포넌트 삭제**

grep으로 사용처 0 확인 후 `CompartmentTree`·`CompartmentNode`·`InlineAddForm`(+전용 타입 `Handlers`/`Props`/`NodeProps`) 삭제. **잔존 필수**: `DeleteBtn`·`InlineInput`·`InlineItemForm`·`AddRow`·`ItemRow`·`pad`·`AddDraft`. 파일 첫 주석을 "공용 인라인 폼·물건 행 모음(트리 컴포넌트는 StoragePane으로 대체됨)"으로 갱신.

- [ ] **Step 4: page.tsx 배선**

- `import { StoragePane } from '@/components/StoragePane'` 추가.
- `const [openStorageId, setOpenStorageId] = useState<string | null>(null)` 추가. 최종 return 직전(treeProps 근처): `const openStorage = openStorageId ? (data.storages.find((s) => s.id === openStorageId) ?? null) : null` (동기화 소실 시 자동 목록 복귀).
- `treeProps`에 `onOpenStorage: setOpenStorageId` 추가.
- 목록 뷰 JSX 교체:

```tsx
      {view === 'list' ? (
        openStorage ? (
          <div className="main">
            <StoragePane p={treeProps} storage={openStorage} onBack={() => setOpenStorageId(null)} />
          </div>
        ) : (
          <div className="tree-view">
            {isMobile ? <DrillDown {...treeProps} /> : <HomeTree {...treeProps} />}
          </div>
        )
      ) : (
```

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "feat(list): 목록에서도 공용 2-pane 수납장 화면 — 인라인 칸 트리(CompartmentTree)·ContainerScreen 제거"
```

---

### Task 3: (컨트롤러 직접) 워터마크 + 게이트 + 최종 리뷰 + 배포

1. globals.css — `.gm-room > .gm-name{position:relative;z-index:2;pointer-events:none}` 규칙을 다음으로 교체:

```css
.gm-room > .gm-name{
  position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;
  padding:4px;pointer-events:none;overflow:hidden;
  font-size:15px;font-weight:700;color:var(--ink-soft);
}
```

2. 전체 게이트 → 최종 리뷰(opus): StoragePane 이동 무결(마크업 diff 0 의도), 목록↔도식화 진입 동등성, 삭제 잔재, 워터마크 레이어(z 0 < gm-sto z 1). 3. push·원장·메모리·수동 안내.
