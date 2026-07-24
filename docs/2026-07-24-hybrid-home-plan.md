# 하이브리드 홈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-hybrid-home-design.md` — 목록/도식화 탭을 없애고 콤팩트 탑뷰+아코디언 목록을 한 화면에(양방향 동기화), 수납장 진입·검색 점프를 page 단일 경로로.

**Architecture:** (1) GridMap을 "탑뷰+편집" 전용으로 축소(수납장 화면·검색 상태를 page로 이관, 방 탭=선택), (2) HomeTree에 focusRoomId 동기화, (3) page가 `home-hybrid` 레이아웃(CSS로 모바일 스택/데스크톱 좌우)과 `openStorageId`/`homeRoomId`/`searchFlash`를 소유, (4) DrillDown·drillPath·useIsMobile·viewtabs 삭제.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. 이모지 금지.
- 데이터 계층·핸들러 시그니처 무변경. `HomeTreeProps` 추가는 `focusRoomId?: string | null`·`onSelectRoom?: (id: string | null) => void`만.
- EditableTile 포인터 보증(캡처·stopPropagation·moved·onCommit 1회·maxRows·cellH) 무변경 — `onOpen?` 재도입 시 `role`/`tabIndex`는 `editing || onOpen`일 때만.
- lint 규칙 주의: effect 내 동기 setState 금지 — 기존 파일들의 "지역 함수 래핑" 패턴을 따른다.
- 삭제는 grep 사용처 0건 확인 후에만. `DrillHeader`(TreeRow 소속)·`resolvePath`가 아닌 것 오인 금지.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` (drillPath 테스트가 빠져 총 개수 감소 — 남은 것 전부 통과).

---

### Task 1: GridMap 축소 — 방 탭=선택, 수납장 화면·검색 이관

**Files:**
- Modify: `web/src/components/GridMap.tsx`

**Interfaces:**
- Produces: `GridMapProps = HomeTreeProps & { homeRoomId: string | null; onSelectRoom: (id: string | null) => void; onRoomGeometry; onStorageGeometry }` (focusStorageId/onConsumeFocus 삭제). EditableTile에 `onOpen?: () => void`(있거나 editing일 때만 role=button·tabIndex 0·Enter 처리). GridMap은 StoragePane을 더 이상 렌더하지 않음.

- [ ] **Step 1: props·상태 정리**

- `GridMapProps`에서 `focusStorageId`/`onConsumeFocus` 제거, `homeRoomId: string | null`·`onSelectRoom: (id: string | null) => void` 추가.
- GridMap 본체에서 `storageId`/`focusFlash` state·검색 useEffect·flash useEffect·`StoragePane` 렌더 분기·import 제거. 남는 분기: `editRoom ? RoomEditView : HomeCanvas`.

- [ ] **Step 2: EditableTile — onOpen 재도입(옵션)**

props에 `onOpen?: () => void` 추가. JSX:

```tsx
      role={editing || onOpen ? 'button' : undefined} tabIndex={editing || onOpen ? 0 : undefined}
      ...
      onClick={(e) => {
        e.stopPropagation()
        if (moved.current) { moved.current = false; return }
        if (editing) onSelect(); else onOpen?.()
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !editing) onOpen?.() }}
```

- [ ] **Step 3: HomeCanvas — 방 탭=선택 토글·하이라이트·푸터 제거**

- 방 EditableTile에 `onOpen={() => p.onSelectRoom(p.homeRoomId === room.id ? null : room.id)}` 추가, className을 `` `gm-tile gm-room${p.homeRoomId === room.id ? ' hh-sel' : ''}` ``로.
- 수납장 보기 버튼 onClick을 `p.onOpenStorage?.(s.id)`로 교체(기존 `onOpenStorage` 로컬 prop 제거 — HomeCanvas 시그니처에서 `onOpenStorage` 파라미터 삭제하고 `p`에서 직접).
- `gmap-foot` div 제거. `gmap-page`의 `max-width:720px`는 유지(CSS 몫).

- [ ] **Step 4: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
```
(page.tsx가 아직 구 props를 넘겨 tsc 실패할 수 있음 — 그 경우 이 태스크에서는 **컴파일을 깨지 않기 위해** page.tsx의 GridMap 호출부만 최소 수정: `focusStorageId`/`onConsumeFocus` 제거, `homeRoomId={null} onSelectRoom={() => {}}` 임시 전달. Task 2가 실배선.)

```bash
git add -A
git commit -m "refactor(map): GridMap을 탑뷰+편집 전용으로 축소 — 방 탭=선택, 수납장/검색은 page로 이관"
```

---

### Task 2: 하이브리드 홈 배선 (page + HomeTree + CSS)

**Files:**
- Modify: `web/src/app/(app)/page.tsx`, `web/src/components/HomeTree.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1의 GridMapProps
- Produces: `HomeTreeProps`에 `focusRoomId?: string | null`·`onSelectRoom?: (id: string | null) => void`. page 상태 `homeRoomId`/`searchFlash`(view·mapFocusId·isMobile 소멸).

- [ ] **Step 1: HomeTree 동기화**

`Props`에 두 옵션 추가. `TreeRoom`에:

```tsx
function TreeRoom({ room, ...p }: { room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  const focused = p.focusRoomId === room.id
  // 지도에서 방 선택 시 펼침+스크롤 (동기 setState 아닌 지역 함수 래핑 — lint 규칙)
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
        depth={0} levelClass={`lv-room${focused ? ' sel' : ''}`} icon="folder" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded}
        onToggle={() => { setExpanded((e) => !e); p.onSelectRoom?.(focused ? null : room.id) }}
        ...(나머지 기존 그대로)
```

(`useRef`/`useEffect` import 추가. 기존 onToggle이 setExpanded만 하던 것에 onSelectRoom 통지 추가.)

- [ ] **Step 2: page.tsx — 탭 제거·하이브리드 렌더·검색 flash**

- 제거: `view` state, viewtabs JSX, `mapFocusId`, `isMobile`/`useIsMobile` import·사용, `DrillDown` import.
- 추가: `const [homeRoomId, setHomeRoomId] = useState<string | null>(null)`, `const [searchFlash, setSearchFlash] = useState(false)`, flash 해제 effect(1.6s, 기존 GridMap 패턴 그대로):

```tsx
  useEffect(() => {
    if (!searchFlash) return
    const t = setTimeout(() => setSearchFlash(false), 1600)
    return () => clearTimeout(t)
  }, [searchFlash])

  // 검색 결과 클릭: 해당 수납장 화면 + 하이라이트
  function handleSearchPick(storageId: string) {
    setOpenStorageId(storageId)
    setSearchFlash(true)
  }
```

- `treeProps`에 `onOpenStorage: setOpenStorageId`(기존)·`focusRoomId: homeRoomId`·`onSelectRoom: setHomeRoomId` 포함.
- 렌더(기존 `view === 'list' ? ... : ...` 블록 전체 교체):

```tsx
      {openStorage ? (
        <div className="main">
          <StoragePane p={treeProps} storage={openStorage} flash={searchFlash} onBack={() => setOpenStorageId(null)} />
        </div>
      ) : (
        <div className="home-hybrid">
          <div className="hh-map">
            <GridMap {...treeProps}
              homeRoomId={homeRoomId} onSelectRoom={setHomeRoomId}
              onRoomGeometry={handleRoomGeometry} onStorageGeometry={handleStorageGeometry} />
          </div>
          <div className="hh-list">
            <HomeTree {...treeProps} />
          </div>
        </div>
      )}
```

(StoragePane `‹`는 홈 복귀 — `homeRoomId`는 유지되어 복귀 시 문맥 보존.)

- [ ] **Step 3: globals.css**

viewtabs 블록(`/* ---------- 뷰 토글 ---------- */`~`.viewtabs button.active{...}`) 삭제(사용처 0 확인). 추가:

```css
/* ---------- 하이브리드 홈: 콤팩트 탑뷰 + 목록 ---------- */
.home-hybrid{flex:1;min-height:0;display:flex;flex-direction:column}
.hh-map{height:35vh;min-height:180px;display:flex;border-bottom:1px solid var(--line)}
.hh-list{flex:1;min-height:0;overflow-y:auto;padding:10px 12px}
@media (min-width:768px){
  .home-hybrid{flex-direction:row}
  .hh-map{height:auto;width:55%;border-bottom:none;border-right:1px solid var(--line)}
}
.gm-room.hh-sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
/* 모바일: 편집 모드·방 확대(RoomEditView) 중엔 지도 영역을 키워 조작 공간 확보 */
@media (max-width:767px){
  .hh-map:has(.gmap-edit.on),.hh-map:has(.drill-head){height:60vh}
}
```

`.tree-view`는 사용처가 남는지 grep — 목록이 `.hh-list`로 이동해 0이면 삭제. `.home-tree`(max-width 620)는 HomeTree가 계속 사용 — 유지.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "feat(home): 하이브리드 홈 — 탭 제거, 콤팩트 탑뷰+아코디언 목록 동기화(homeRoomId)"
```

---

### Task 3: 데드 코드 삭제

**Files:**
- Delete(각각 grep 사용처 0 확인 후): `web/src/components/DrillDown.tsx`, `web/src/lib/drillPath.ts`, `web/src/lib/drillPath.test.ts`, `web/src/lib/useIsMobile.ts`
- Modify: `web/src/app/globals.css`(`.lv-drill` 등 잔존 죽은 셀렉터)

- [ ] **Step 1: 참조 grep 후 파일 삭제**

```bash
cd web && grep -rn "DrillDown\|drillPath\|resolvePath\|PathSeg\|useIsMobile" src --include="*.tsx" --include="*.ts"
```
매치가 삭제 대상 내부뿐인지 확인(주의: `DrillHeader`는 TreeRow 소속 — 오인 금지) 후 `git rm` 4개 파일.

- [ ] **Step 2: 죽은 CSS**

`.lv-drill` 관련 규칙(`.trow.lv-drill`, `.lv-drill .trow-caret`, `.lv-drill .trow-iconbtn`, `.lv-drill .trow-chev` 등) — 사용처 0 확인 후 삭제. `.drill-head`/`.drill-back`/`.drill-title`은 DrillHeader가 사용 — **유지**. `.trow-chev`는 HomeTree 수납장 행(chevron)이 사용 — **유지**.

- [ ] **Step 3: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "chore: DrillDown·drillPath·useIsMobile 삭제 — 하이브리드 홈으로 역할 종료"
```

---

### Task 4: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트. 2. 최종 리뷰(opus) — 동기화 양방향 상태 흐름(무한 루프·초점 충돌), 콤팩트 지도에서 편집·확대(RoomEditView가 35vh 안에서 동작하는지), 수납장 3경로(지도/목록/검색) 동등성, 삭제 잔재, 320px/데스크톱 레이아웃 CSS 추론. 3. push·원장·메모리·수동 안내.
