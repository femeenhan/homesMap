# 도식화 그리드 드릴다운 맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-map-grid-drilldown-design.md` 구현 — 940×600 px 자유배치 맵을 12칸 셀 그리드 + 드릴다운 3레벨 + 보기/편집 분리 구조로 교체.

**Architecture:** (1) `lib/grid.ts` 순수 그리드 유틸(셀 변환·레거시 px 변환·자동 배치, TDD), (2) `GridMap.tsx` 단일 컴포넌트가 경로 상태(`resolvePath` 재사용)로 L0(우리집)/L1(방)/L2(수납장) 화면 전환, (3) 편집 모드에서만 포인터 드래그(셀 스냅)·코너 핸들 리사이즈, (4) 구 캔버스 코드(MapCanvas/DetailPanel/RoomDetail/StorageBadge/geometry) 삭제.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS / vitest. **새 의존성 금지.**

## Global Constraints

- 작업 디렉터리: `web/` (명령은 `web/`에서). 저장소 main 직접 작업(프로젝트 정책), push는 최종 태스크에서만.
- 새 npm 의존성 금지. 이모지 사용 금지(카피는 한국어 텍스트 + `Icon.tsx`).
- 그리드 상수(스펙 §2 그대로): 가로 `COLS=12`, 방 최소 2×2셀·기본 4×3셀, 수납장 기본 3×2셀, 레거시 판정 `w>12 || h>12`, 레거시 월드 940×600.
- 삭제 확인 카피·인라인 폼은 목록의 기존 컴포넌트(`InlineInput`/`InlineAddForm`/`AddRow`/`ItemRow`/`RowMenu`/`DrillHeader`) 재사용 — 새 폼 만들지 말 것.
- 데이터 저장 패턴은 기존 그대로: `store.putLocal(t, row, {dirty:true})` → `setData` 낙관 갱신 → `try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }`.
- 방 색상은 무채색(`--panel` 배경 + `--line` 보더), 선택/하이라이트만 `--accent`. `ROOM_COLORS` UI 사용 금지.
- 검증 명령: `cd web && npx tsc --noEmit && npm run lint && npm test` (개수 고정하지 말고 전부 통과 확인).
- **맵 외 화면(목록·헤더·검색·인증)은 건드리지 않는다** (명시된 파일만 수정).

---

### Task 1: lib/grid.ts — 그리드 유틸 + 레거시 변환 (TDD)

**Files:**
- Create: `web/src/lib/grid.ts`, `web/src/lib/grid.test.ts`
- Modify: `web/src/lib/types.ts` (Storage에 `w`,`h` 추가)

**Interfaces:**
- Consumes: `Room`/`Storage` 타입 (`@/lib/types`)
- Produces (이후 태스크가 그대로 사용):
  - `COLS=12`, `ROOM_MIN=2`, `ROOM_DEFAULT={w:4,h:3}`, `STORAGE_DEFAULT={w:3,h:2}`
  - `type CellRect = { x: number; y: number; w: number; h: number }`
  - `isLegacyRoom(r)`, `convertLegacyRoom(r): CellRect`, `roomInnerGrid(r): {cols:number; rows:number}`
  - `rectsOverlap(a,b)`, `contentRows(rects, minRows)`, `autoPlace(occupied, size, cols): {x,y}`
  - `migrateLegacyGeometry(rooms, storages): { rooms; storages; changedRooms; changedStorages }` (순수 — updated_at 스탬프는 호출측)
  - `storageRect(s): CellRect` (w/h 널이면 기본 크기)
  - `types.ts`: `Storage`에 `w?: number | null; h?: number | null`

- [ ] **Step 1: types.ts 수정**

`Storage` 타입의 `x: number; y: number;` 다음에 `w?: number | null; h?: number | null;` 추가 (주석: `// 타일 크기(셀). 널=기본 3×2`).

- [ ] **Step 2: 실패하는 테스트 작성 — `web/src/lib/grid.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  COLS, ROOM_DEFAULT, STORAGE_DEFAULT,
  isLegacyRoom, convertLegacyRoom, roomInnerGrid, rectsOverlap,
  contentRows, autoPlace, migrateLegacyGeometry, storageRect,
} from './grid'
import type { Room, Storage } from './types'

const mkRoom = (o: Partial<Room>): Room => ({ id: 'r', x: 0, y: 0, w: 4, h: 3, ...o } as Room)
const mkStorage = (o: Partial<Storage>): Storage => ({ id: 's', room_id: 'r', x: 0, y: 0, ...o } as Storage)

describe('legacy 판정·변환', () => {
  it('w>12 또는 h>12면 레거시(px)', () => {
    expect(isLegacyRoom(mkRoom({ w: 210, h: 165 }))).toBe(true)
    expect(isLegacyRoom(mkRoom({ w: 4, h: 3 }))).toBe(false)
    expect(isLegacyRoom(mkRoom({ w: 4, h: 13 }))).toBe(true)
  })
  it('레거시 기본 방(210×165 @20,20)이 셀로 비례 변환된다', () => {
    // cell = 940/12 ≈ 78.33 → x=round(20/78.33)=0, w=round(210/78.33)=3, h=max(2,round(165/78.33))=2
    expect(convertLegacyRoom(mkRoom({ x: 20, y: 20, w: 210, h: 165 }))).toEqual({ x: 0, y: 0, w: 3, h: 2 })
  })
  it('경계를 넘는 레거시 방은 12칸 안으로 클램프', () => {
    const c = convertLegacyRoom(mkRoom({ x: 900, y: 0, w: 300, h: 100 }))
    expect(c.x + c.w).toBeLessThanOrEqual(COLS)
    expect(c.w).toBeGreaterThanOrEqual(2)
  })
})

describe('roomInnerGrid', () => {
  it('방 비율대로 12칸 × round(12h/w)행, 최소 4행', () => {
    expect(roomInnerGrid(mkRoom({ w: 4, h: 3 }))).toEqual({ cols: 12, rows: 9 })
    expect(roomInnerGrid(mkRoom({ w: 12, h: 2 }))).toEqual({ cols: 12, rows: 4 }) // round(2)→ min 4
  })
})

describe('rectsOverlap / contentRows / autoPlace', () => {
  it('겹침 판정', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true)
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false)
  })
  it('contentRows = max(minRows, 가장 아래 변)', () => {
    expect(contentRows([{ x: 0, y: 3, w: 2, h: 2 }], 4)).toBe(5)
    expect(contentRows([], 6)).toBe(6)
  })
  it('autoPlace: 좌상단부터 첫 빈 자리, 없으면 콘텐츠 아래 새 행', () => {
    expect(autoPlace([], { w: 4, h: 3 }, COLS)).toEqual({ x: 0, y: 0 })
    expect(autoPlace([{ x: 0, y: 0, w: 4, h: 3 }], { w: 4, h: 3 }, COLS)).toEqual({ x: 4, y: 0 })
    const full = [{ x: 0, y: 0, w: 12, h: 3 }]
    expect(autoPlace(full, { w: 4, h: 3 }, COLS)).toEqual({ x: 0, y: 3 })
  })
})

describe('migrateLegacyGeometry', () => {
  it('레거시 방과 그 수납장을 함께 변환하고 changed에 담는다', () => {
    const r = mkRoom({ id: 'r1', x: 20, y: 20, w: 210, h: 165 })
    const s = mkStorage({ id: 's1', room_id: 'r1', x: 125, y: 102 }) // 방 중앙(20+105, 20+82.5)
    const out = migrateLegacyGeometry([r], [s])
    expect(out.changedRooms).toHaveLength(1)
    expect(out.changedStorages).toHaveLength(1)
    const nr = out.rooms[0], ns = out.storages[0]
    expect(nr.w).toBeLessThanOrEqual(COLS)
    // 수납장은 방 내부 그리드(12×8) 중앙 근처의 3×2 좌상단 좌표
    const inner = roomInnerGrid(nr)
    expect(ns.x).toBeGreaterThanOrEqual(0); expect(ns.x).toBeLessThanOrEqual(inner.cols - STORAGE_DEFAULT.w)
    expect(ns.y).toBeGreaterThanOrEqual(0); expect(ns.y).toBeLessThanOrEqual(inner.rows - STORAGE_DEFAULT.h)
  })
  it('셀 좌표 방(비레거시)은 손대지 않는다', () => {
    const r = mkRoom({ id: 'r1', x: 1, y: 1, w: 4, h: 3 })
    const s = mkStorage({ id: 's1', room_id: 'r1', x: 2, y: 2 })
    const out = migrateLegacyGeometry([r], [s])
    expect(out.changedRooms).toHaveLength(0)
    expect(out.changedStorages).toHaveLength(0)
    expect(out.rooms[0]).toBe(r)
  })
})

describe('storageRect', () => {
  it('w/h 널이면 기본 3×2', () => {
    expect(storageRect(mkStorage({ x: 2, y: 1 }))).toEqual({ x: 2, y: 1, w: 3, h: 2 })
    expect(storageRect(mkStorage({ x: 2, y: 1, w: 5, h: 4 }))).toEqual({ x: 2, y: 1, w: 5, h: 4 })
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './grid'` (기존 테스트는 통과).

- [ ] **Step 4: `web/src/lib/grid.ts` 구현**

```ts
import type { Room, Storage } from './types'

// 그리드 월드: 가로 12칸 고정, 셀 정사각. 세로 행은 콘텐츠에 따라 동적.
export const COLS = 12
export const ROOM_MIN = 2
export const ROOM_DEFAULT = { w: 4, h: 3 }
export const STORAGE_DEFAULT = { w: 3, h: 2 }
// 레거시(구 px 월드) 변환에만 쓰는 상수
const LEGACY_W = 940
const LEGACY_CELL = LEGACY_W / COLS

export type CellRect = { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

// 셀 좌표는 항상 ≤12. px 시절 방은 w≥60이므로 w/h>12로 판정 가능.
export function isLegacyRoom(r: Pick<Room, 'w' | 'h'>): boolean {
  return r.w > COLS || r.h > COLS
}

export function convertLegacyRoom(r: Pick<Room, 'x' | 'y' | 'w' | 'h'>): CellRect {
  const x = clamp(Math.round(r.x / LEGACY_CELL), 0, COLS - ROOM_MIN)
  const w = clamp(Math.round(r.w / LEGACY_CELL), ROOM_MIN, COLS - x)
  const y = Math.max(0, Math.round(r.y / LEGACY_CELL))
  const h = Math.max(ROOM_MIN, Math.round(r.h / LEGACY_CELL))
  return { x, y, w, h }
}

// 방 확대(L1) 내부 그리드: 가로 12칸, 세로는 방 비율 유지(최소 4행)
export function roomInnerGrid(r: Pick<Room, 'w' | 'h'>): { cols: number; rows: number } {
  return { cols: COLS, rows: Math.max(4, Math.round((COLS * r.h) / r.w)) }
}

export function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function contentRows(rects: CellRect[], minRows: number): number {
  return Math.max(minRows, ...rects.map((r) => r.y + r.h), 0)
}

// 좌상단부터 행 우선 스캔으로 첫 빈 자리. 없으면 콘텐츠 바로 아래 새 행.
export function autoPlace(occupied: CellRect[], size: { w: number; h: number }, cols: number): { x: number; y: number } {
  const maxY = contentRows(occupied, 0)
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= cols - size.w; x++) {
      const cand = { x, y, ...size }
      if (!occupied.some((o) => rectsOverlap(o, cand))) return { x, y }
    }
  }
  return { x: 0, y: maxY }
}

export function storageRect(s: Pick<Storage, 'x' | 'y' | 'w' | 'h'>): CellRect {
  return { x: s.x, y: s.y, w: s.w ?? STORAGE_DEFAULT.w, h: s.h ?? STORAGE_DEFAULT.h }
}

// 레거시 수납장(전역 px 중심좌표) → 방 내부 그리드의 3×2 좌상단 셀
function convertLegacyStorage(
  s: Pick<Storage, 'x' | 'y'>, roomPx: CellRect, inner: { cols: number; rows: number },
): { x: number; y: number } {
  const fx = (s.x - roomPx.x) / roomPx.w
  const fy = (s.y - roomPx.y) / roomPx.h
  return {
    x: clamp(Math.round(fx * inner.cols - STORAGE_DEFAULT.w / 2), 0, inner.cols - STORAGE_DEFAULT.w),
    y: clamp(Math.round(fy * inner.rows - STORAGE_DEFAULT.h / 2), 0, inner.rows - STORAGE_DEFAULT.h),
  }
}

// px 시절 데이터 1회 변환(순수 — updated_at 스탬프·저장은 호출측 책임).
// 방이 px 판정이면 그 방 소속 수납장도 px로 간주해 함께 변환한다(스펙 §2).
export function migrateLegacyGeometry(rooms: Room[], storages: Storage[]): {
  rooms: Room[]; storages: Storage[]; changedRooms: Room[]; changedStorages: Storage[]
} {
  const outRooms: Room[] = []
  const changedRooms: Room[] = []
  const outStorages = [...storages]
  const changedStorages: Storage[] = []
  for (const r of rooms) {
    if (!isLegacyRoom(r)) { outRooms.push(r); continue }
    const roomPx: CellRect = { x: r.x, y: r.y, w: r.w, h: r.h }
    const cells = convertLegacyRoom(r)
    const nr = { ...r, ...cells }
    outRooms.push(nr)
    changedRooms.push(nr)
    const inner = roomInnerGrid(cells)
    for (let i = 0; i < outStorages.length; i++) {
      const s = outStorages[i]
      if (s.room_id !== r.id) continue
      const ns = { ...s, ...convertLegacyStorage(s, roomPx, inner) }
      outStorages[i] = ns
      changedStorages.push(ns)
    }
  }
  return { rooms: outRooms, storages: outStorages, changedRooms, changedStorages }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd web && npm test`
Expected: PASS — grid.test.ts 10개 포함 전부 통과.

- [ ] **Step 6: tsc·lint 확인 후 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint
git add web/src/lib/grid.ts web/src/lib/grid.test.ts web/src/lib/types.ts
git commit -m "feat(grid): 셀 그리드 유틸 + 레거시 px 변환 + Storage w/h 타입"
```

---

### Task 2: (컨트롤러 직접) storages w,h DB 마이그레이션

**Files:**
- Create: `supabase/migrations/0002_storage_size.sql`

컨트롤러가 서브에이전트 없이 직접 수행: 파일 작성 → supabase MCP `apply_migration`(프로젝트 kvyaaujhgcwiiievosqa) → `execute_sql`로 컬럼 존재 확인 → 커밋.

```sql
-- 수납장 타일 크기(셀 단위). NULL = 기본 크기(3×2). RLS 변경 없음.
alter table public.storages
  add column if not exists w int,
  add column if not exists h int;
```

---

### Task 3: GridMap L0/L1 보기 모드 + page 통합 + 레거시 변환 적용

**Files:**
- Create: `web/src/components/GridMap.tsx`
- Modify: `web/src/components/DrillDown.tsx`(DrillHeader export + `trailing` prop), `web/src/app/(app)/page.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 전부, `resolvePath`/`PathSeg`(`@/lib/drillPath`), `DrillHeader`, `AddRow`/`InlineInput`(`./CompartmentTree`), `HomeTreeProps`(`./HomeTree`)
- Produces:
  - `GridMap(props: GridMapProps)` — `type GridMapProps = HomeTreeProps & { focusStorageId: string | null; onConsumeFocus: () => void; onRoomGeometry: (room: Room, next: CellRect) => void; onStorageGeometry: (storage: Storage, next: CellRect) => void }` (geometry 콜백은 Task 5에서 사용, 지금은 prop만 정의)
  - `DrillHeader`가 `export`됨 (시그니처 무변경)
  - page: `handleRoomGeometry(room, next: CellRect)` 단순화판, `handleStorageGeometry(storage, next: CellRect)` 신설
  - L2 자리는 `<L2 자리표시>` 주석 + 임시 빈 div (Task 4가 교체)

- [ ] **Step 1: DrillDown.tsx — DrillHeader export**

`function DrillHeader(` → `export function DrillHeader(`. 다른 변경 없음.

- [ ] **Step 2: `web/src/components/GridMap.tsx` 생성 (L0/L1 보기)**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage } from '@/lib/types'
import { COLS, type CellRect, contentRows, roomInnerGrid, storageRect } from '@/lib/grid'
import { resolvePath, type PathSeg } from '@/lib/drillPath'
import { AddRow, InlineInput } from './CompartmentTree'
import { DrillHeader } from './DrillDown'
import type { HomeTreeProps } from './HomeTree'

export type GridMapProps = HomeTreeProps & {
  focusStorageId: string | null
  onConsumeFocus: () => void
  onRoomGeometry: (room: Room, next: CellRect) => void
  onStorageGeometry: (storage: Storage, next: CellRect) => void
}

// 컨테이너 크기 관찰(셀 크기 = 폭/12, 최소 행 = 높이/셀)
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

// 도식화: 사각형 드릴다운 맵. 경로 상태는 목록 드릴다운과 동일한 resolvePath로 검증.
export function GridMap(p: GridMapProps) {
  const [path, setPath] = useState<PathSeg[]>([])
  const valid = resolvePath(path, p.rooms, p.storages)
  const cur = valid[valid.length - 1]
  const toSegs = () => valid.map((v) => ({ kind: v.kind, id: v.id }) as PathSeg)
  const enter = (seg: PathSeg) => setPath([...toSegs(), seg])
  const back = () => setPath(toSegs().slice(0, -1))

  // 검색 점프: 해당 수납장 L2로 즉시 이동(소모형 prop)
  useEffect(() => {
    if (!p.focusStorageId) return
    const s = p.storages.find((x) => x.id === p.focusStorageId)
    if (s) setPath([{ kind: 'room', id: s.room_id }, { kind: 'storage', id: s.id }])
    p.onConsumeFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusStorageId])

  if (!cur) return <HomeCanvas p={p} onEnter={enter} />
  if (cur.kind === 'room') return <RoomCanvas p={p} room={cur.room} onEnter={enter} onBack={back} />
  return <div /> /* L2 자리표시 — Task 4가 StorageView로 교체 */
}

const px = (r: CellRect, cell: number) => ({
  left: r.x * cell, top: r.y * cell, width: r.w * cell, height: r.h * cell,
})

// L0: 우리집 — 방 타일
function HomeCanvas({ p, onEnter }: { p: GridMapProps; onEnter: (s: PathSeg) => void }) {
  const [adding, setAdding] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const cell = w / COLS
  const rects = p.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
  const rows = cell > 0 ? contentRows(rects, Math.ceil(h / cell)) : 0
  return (
    <div className="gmap-page">
      {adding
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap" style={{ height: rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {p.rooms.length === 0 && <div className="gmap-empty">방이 없어요 — 위 ‘방 추가’로 시작해보세요</div>}
            {p.rooms.map((room) => (
              <button key={room.id} type="button" className="gm-tile gm-room" style={px(room, cell)}
                onClick={() => onEnter({ kind: 'room', id: room.id })}>
                <span className="gm-name">{room.name}</span>
                {p.storages.filter((s) => s.room_id === room.id).length > 0 && (
                  <span className="gm-meta">{p.storages.filter((s) => s.room_id === room.id).length}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="gmap-foot">
        방 {p.rooms.length} · 수납장 {p.storages.length} · 물건 {p.decItems.length}개
      </div>
    </div>
  )
}

// L1: 방 확대 — 수납장 타일 (방 비율의 내부 그리드)
function RoomCanvas({ p, room, onEnter, onBack }: {
  p: GridMapProps; room: Room; onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
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
      {adding
        ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap gm-roomview" style={{ height: inner.rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {storages.length === 0 && <div className="gmap-empty">수납장이 없어요 — 위 ‘수납장 추가’로 시작해보세요</div>}
            {storages.map((s) => (
              <button key={s.id} type="button" className="gm-tile gm-storage" style={px(storageRect(s), cell)}
                onClick={() => onEnter({ kind: 'storage', id: s.id })}>
                <span className="gm-name">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: page.tsx 통합**

1. import 정리: `MapCanvas`/`DetailPanel`/`RoomDetail` import 삭제, `import { GridMap } from '@/components/GridMap'` 추가, `import { recomputeChildStorages } from '@/lib/geometry'`와 `import type { Pt, Rect } from '@/lib/geometry'` 삭제, `import { COLS, ROOM_DEFAULT, STORAGE_DEFAULT, autoPlace, roomInnerGrid, storageRect, migrateLegacyGeometry, type CellRect } from '@/lib/grid'` 추가.
2. 상태 정리: `selectedStorageId`/`selectedRoomId`/`flashStorageId`/`flashTimerRef`/`selectStorage`/`selectRoom` 및 이를 쓰는 파생값(`selectedStorage`, `selectedRoom`, `storageRoom`, `selectedItems`, `selectedRoomStorageCount` 등 — grep으로 전수 확인) 삭제. 새 상태 `const [mapFocusId, setMapFocusId] = useState<string | null>(null)` 추가.
3. `handleSearchPick` 교체:

```tsx
  // 검색 결과 클릭: 도식화로 전환해 해당 수납장 확대(L2)로 점프
  function handleSearchPick(storageId: string) {
    setView('map')
    setMapFocusId(storageId)
  }
```

4. **레거시 변환 적용**: BootData를 조립해 `setData(...)`하는 지점(일반 boot·게스트 진입 공통 — `rooms`/`storages`를 store에서 읽어오는 곳)을 찾아, setData 직전에:

```tsx
      // 구 px 좌표(940×600 시절) 1회 셀 변환 — 변경분만 dirty 저장(스펙 §2)
      const mig = migrateLegacyGeometry(rooms, storages)
      if (mig.changedRooms.length > 0 || mig.changedStorages.length > 0) {
        const now = new Date().toISOString()
        const stampedRooms = new Map(mig.changedRooms.map((r) => [r.id, { ...r, updated_at: now }]))
        const stampedStorages = new Map(mig.changedStorages.map((s) => [s.id, { ...s, updated_at: now }]))
        rooms = mig.rooms.map((r) => stampedRooms.get(r.id) ?? r)
        storages = mig.storages.map((s) => stampedStorages.get(s.id) ?? s)
        await Promise.all([
          ...[...stampedRooms.values()].map((r) => store.putLocal('rooms', r, { dirty: true })),
          ...[...stampedStorages.values()].map((s) => store.putLocal('storages', s, { dirty: true })),
        ])
        push().catch(() => {})
      }
```

(조립 지점이 2곳이면 이 블록을 헬퍼 `async function applyGridMigration(rooms, storages)`로 빼서 양쪽에서 호출.)

5. `handleAddRoom` 좌표 계산 교체 — 함수 본문에서 `x/y/w/h` 부분만:

```tsx
    const pos = autoPlace(
      data.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
      ROOM_DEFAULT, COLS,
    )
    // row: { ...기존 필드, x: pos.x, y: pos.y, w: ROOM_DEFAULT.w, h: ROOM_DEFAULT.h, color_index: 0 }
```

6. `handleAddStorageInList` 좌표 계산 교체:

```tsx
    const inner = roomInnerGrid(room)
    const sib = data.storages.filter((s) => s.room_id === room.id).map(storageRect)
    const pos = autoPlace(sib, STORAGE_DEFAULT, inner.cols)
    const row: Storage = { /* 기존 필드 유지 */ x: pos.x, y: Math.min(pos.y, inner.rows - STORAGE_DEFAULT.h), w: null, h: null, /* ... */ }
```

7. `handleRoomCreate`/`handleStoragePlace`/`handleAddStorageToRoom`/`handleStorageMove` **삭제**. `handleRoomGeometry`를 셀 버전으로 교체(자식 재계산 불필요 — 수납장은 방-로컬 좌표):

```tsx
  // 방 이동/리사이즈 커밋(편집 모드): 셀 좌표 갱신만 — 수납장은 방-로컬 좌표라 함께 움직일 필요 없음
  async function handleRoomGeometry(room: Room, next: CellRect) {
    if (!data) return
    const updatedRoom: Room = { ...room, ...next, updated_at: new Date().toISOString() }
    await store.putLocal('rooms', updatedRoom, { dirty: true })
    setData((d) => d && { ...d, rooms: d.rooms.map((r) => (r.id === room.id ? updatedRoom : r)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  async function handleStorageGeometry(storage: Storage, next: CellRect) {
    if (!data) return
    const updated: Storage = { ...storage, ...next, updated_at: new Date().toISOString() }
    await store.putLocal('storages', updated, { dirty: true })
    setData((d) => d && { ...d, storages: d.storages.map((s) => (s.id === storage.id ? updated : s)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }
```

8. 맵 뷰 JSX 교체 — 기존 `<div className="main"><MapCanvas ... />{selectedStorage && <DetailPanel .../>}{selectedRoom && <RoomDetail .../>}</div>` 전체를:

```tsx
        <div className="main">
          <GridMap {...treeProps}
            focusStorageId={mapFocusId} onConsumeFocus={() => setMapFocusId(null)}
            onRoomGeometry={handleRoomGeometry} onStorageGeometry={handleStorageGeometry} />
        </div>
```

- [ ] **Step 4: globals.css — 맵 CSS 추가**

`/* ---------- 모바일 드릴다운 ---------- */` 섹션 뒤에 추가:

```css
/* ---------- 도식화(그리드 맵) ---------- */
.gmap-page{flex:1;min-height:0;display:flex;flex-direction:column;max-width:720px;margin:0 auto;width:100%;padding:12px 12px 0}
.gmap-scroll{flex:1;min-height:0;overflow-y:auto;margin-top:4px}
.gmap{
  position:relative;width:100%;border:1px solid var(--line);border-radius:10px;
  background-image:
    repeating-linear-gradient(0deg,transparent 0 calc(100% - 1px),var(--grid) 0 100%),
    repeating-linear-gradient(90deg,transparent 0 calc(100% - 1px),var(--grid) 0 100%);
}
.gmap-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--ink-soft);font-size:13px;pointer-events:none}
.gm-tile{
  position:absolute;display:flex;align-items:flex-start;justify-content:space-between;gap:4px;
  background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 8px;
  text-align:left;overflow:hidden;
}
.gm-tile:hover{border-color:var(--accent)}
.gm-name{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gm-meta{font-size:11px;color:var(--ink-soft);flex-shrink:0}
.gm-storage{background:var(--surface)}
.gmap-foot{padding:8px 2px;font-size:12px;color:var(--ink-soft);text-align:center;flex-shrink:0}
```

주: 그리드 모눈은 `backgroundSize`(인라인, 셀 크기)와 위 `background-image` 조합으로 그린다.

- [ ] **Step 5: 검증**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
```
Expected: 전부 통과. (MapCanvas 등 구 컴포넌트는 아직 파일로 존재하나 page에서 미사용 — 삭제는 Task 6.)

- [ ] **Step 6: 커밋**

```bash
git add web/src/components/GridMap.tsx web/src/components/DrillDown.tsx "web/src/app/(app)/page.tsx" web/src/app/globals.css
git commit -m "feat(map): 그리드 드릴다운 맵 L0/L1 보기 + 레거시 px 셀 변환 + 검색 점프 배선"
```

---

### Task 4: L2 수납장 확대 — 칸 스택 + 물건 목록

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 3의 GridMap 구조, `childCompartments`(`@/lib/compartments`), `InlineAddForm`/`AddRow`/`ItemRow`(`./CompartmentTree`), `DrillHeader`
- Produces: `StorageView` (GridMap 내부 전용) — L2/L3+(중첩 칸) 화면

- [ ] **Step 1: GridMap.tsx — L2 교체**

import에 `childCompartments`(`@/lib/compartments`), `InlineAddForm`, `ItemRow` 추가. `GridMap`의 `return <div /> /* L2 자리표시 */`를 다음으로 교체:

```tsx
  const storage = cur.storage
  const parent = cur.kind === 'cmp' ? cur.cmp : null
  return <StorageView p={p} storage={storage} parent={parent} onEnter={enter} onBack={back} />
```

파일 하단에 추가:

```tsx
// L2+: 수납장/칸 확대 — 하위 칸 세로 스택(자동, 좌표 없음) + 물건 목록
function StorageView({ p, storage, parent, onEnter, onBack }: {
  p: GridMapProps; storage: Storage; parent: Compartment | null
  onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const children = childCompartments(compartments, parent?.id ?? null)
  const validIds = new Set(compartments.map((c) => c.id))
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = parent
    ? allItems.filter((it) => it.compartment_id === parent.id)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const countIn = (cmpId: string) => {
    const ids = new Set([cmpId, ...descendants(compartments, cmpId)])
    return allItems.filter((it) => it.compartment_id != null && ids.has(it.compartment_id)).length
  }
  const head = parent
    ? {
        name: parent.name,
        onRename: (n: string) => p.onCompartmentsChange(storage, compartments.map((c) => (c.id === parent.id ? { ...c, name: n } : c))),
        deleteTitle: '칸 삭제', deleteMessage: `'${parent.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteCompartment(storage, parent.id),
      }
    : {
        name: storage.name,
        onRename: (n: string) => p.onRenameStorage(storage, n),
        deleteTitle: '수납장 삭제', deleteMessage: `'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteStorage(storage),
      }
  return (
    <div className="gmap-page">
      <DrillHeader onBack={onBack} {...head} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: parent?.id ?? null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, parent?.id ?? null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll">
        {children.length > 0 && (
          <div className="gm-stack">
            {children.map((c) => (
              <button key={c.id} type="button" className="gm-block" onClick={() => onEnter({ kind: 'cmp', id: c.id })}>
                <span className="gm-name">{c.name}</span>
                {countIn(c.id) > 0 && <span className="gm-meta">{countIn(c.id)}</span>}
              </button>
            ))}
          </div>
        )}
        {children.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
        <div className="gm-items">
          {items.map((it) => <ItemRow key={it.id} item={it} depth={0} onDelete={p.onDeleteItem} />)}
        </div>
      </div>
    </div>
  )
}
```

`descendants`는 `@/lib/compartments`의 `descendantIds` 재사용: import에 `descendantIds` 추가하고 `countIn`을 `const ids = new Set([cmpId, ...descendantIds(compartments, cmpId)])`로. (`descendantIds`가 자기 자신을 포함하면 중복 Set이므로 무해 — 시그니처는 파일에서 확인.)
타입 import에 `Compartment`, `DecItem` 필요 시 추가.

- [ ] **Step 2: globals.css — 스택 CSS**

`.gmap-foot` 뒤에 추가:

```css
.gm-stack{display:flex;flex-direction:column;gap:8px;padding:2px 0 8px}
.gm-block{
  display:flex;align-items:center;justify-content:space-between;gap:6px;
  min-height:56px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;
  background:var(--panel);text-align:left;
}
.gm-block:hover{border-color:var(--accent)}
.gm-items{display:flex;flex-direction:column}
/* 검색 점프 하이라이트 */
@keyframes gm-focus{0%{box-shadow:0 0 0 3px var(--accent)}100%{box-shadow:0 0 0 0 transparent}}
.gm-focus .gm-stack,.gm-focus .gm-items{animation:gm-focus 1.6s ease-out}
```

- [ ] **Step 3: 검색 하이라이트 배선**

`GridMap`에 `const [focusFlash, setFocusFlash] = useState(false)` 추가. 검색 점프 useEffect에서 `setPath(...)` 후 `setFocusFlash(true)`; `StorageView` 래퍼 div className을 `` `gmap-page${focusFlash ? ' gm-focus' : ''}` ``로 하고, `StorageView`에 진입 후 1.6s 타이머로 해제:

```tsx
  useEffect(() => {
    if (!focusFlash) return
    const t = setTimeout(() => setFocusFlash(false), 1600)
    return () => clearTimeout(t)
  }, [focusFlash])
```

(`focusFlash`/`setFocusFlash`는 GridMap 소유, StorageView엔 `flash: boolean` prop으로 전달.)

- [ ] **Step 4: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): L2 수납장 확대 — 칸 세로 스택 + 물건 목록 + 검색 하이라이트"
```

---

### Task 5: 편집 모드 — 이동(셀 스냅) + 코너 핸들 리사이즈

**Files:**
- Modify: `web/src/components/GridMap.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 3의 `onRoomGeometry`/`onStorageGeometry` prop, `ROOM_MIN`(`@/lib/grid` — GridMap import에 추가)
- Produces: `EditableTile`(GridMap 내부 전용). 보기 모드 동작 무변경.

- [ ] **Step 1: GridMap.tsx — 편집 상태 + EditableTile**

`HomeCanvas`/`RoomCanvas`에 `const [editing, setEditing] = useState(false)`와 `const [selectedId, setSelectedId] = useState<string | null>(null)` 추가. 상단 추가 행을 다음 구조로 감싼다(두 캔버스 공통 — 추가 행 오른쪽에 편집 토글):

```tsx
      <div className="gmap-bar">
        {adding
          ? <InlineInput ... />
          : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
        <button type="button" className={`gmap-edit${editing ? ' on' : ''}`}
          onClick={() => { setEditing((e) => !e); setSelectedId(null) }}>
          {editing ? '완료' : '편집'}
        </button>
      </div>
```

(RoomCanvas는 label="수납장 추가". DrillHeader가 있는 RoomCanvas는 헤더 아래 이 bar가 온다.)

타일 렌더를 `EditableTile`로 교체. HomeCanvas:

```tsx
            {p.rooms.map((room) => (
              <EditableTile key={room.id} rect={{ x: room.x, y: room.y, w: room.w, h: room.h }}
                cell={cell} cols={COLS} minW={ROOM_MIN} minH={ROOM_MIN}
                editing={editing} selected={selectedId === room.id}
                className="gm-tile gm-room"
                onSelect={() => setSelectedId(room.id)}
                onOpen={() => onEnter({ kind: 'room', id: room.id })}
                onCommit={(next) => p.onRoomGeometry(room, next)}>
                <span className="gm-name">{room.name}</span>
                {/* 개수 뱃지 기존 그대로 */}
              </EditableTile>
            ))}
```

RoomCanvas 동일 패턴: `rect={storageRect(s)}`, `cols={inner.cols}`, `minW={1} minH={1}`, `onCommit={(next) => p.onStorageGeometry(s, next)}`.

파일 하단에 추가:

```tsx
// 편집 가능 타일: 보기=클릭 진입 / 편집=드래그 이동(셀 스냅)·선택 후 코너 핸들 리사이즈.
// 세로는 아래로 제한 없음(그리드가 콘텐츠 따라 늘어남 — 스펙 §2).
function EditableTile({ rect, cell, cols, minW, minH, editing, selected, className, onSelect, onOpen, onCommit, children }: {
  rect: CellRect; cell: number; cols: number; minW: number; minH: number
  editing: boolean; selected: boolean; className: string
  onSelect: () => void; onOpen: () => void; onCommit: (next: CellRect) => void
  children: React.ReactNode
}) {
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; sx: number; sy: number; cur: CellRect } | null>(null)
  const moved = useRef(false)
  const shown = drag?.cur ?? rect
  const clampMove = (r: CellRect): CellRect => ({
    ...r,
    x: Math.min(Math.max(r.x, 0), cols - r.w),
    y: Math.max(r.y, 0), // 아래는 무제한(행 자동 확장)
  })

  function start(mode: 'move' | 'resize', e: React.PointerEvent) {
    if (!editing) return
    e.stopPropagation()
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ mode, sx: e.clientX, sy: e.clientY, cur: rect })
  }
  function move(e: React.PointerEvent) {
    if (!drag) return
    const dx = Math.round((e.clientX - drag.sx) / cell)
    const dy = Math.round((e.clientY - drag.sy) / cell)
    if (dx !== 0 || dy !== 0) moved.current = true
    setDrag({
      ...drag,
      cur: drag.mode === 'move'
        ? clampMove({ ...rect, x: rect.x + dx, y: rect.y + dy })
        : {
            ...rect,
            w: Math.min(Math.max(rect.w + dx, minW), cols - rect.x),
            h: Math.max(rect.h + dy, minH),
          },
    })
  }
  function end() {
    if (!drag) return
    const c = drag.cur
    setDrag(null)
    if (c.x !== rect.x || c.y !== rect.y || c.w !== rect.w || c.h !== rect.h) onCommit(c)
  }

  return (
    <div className={`${className}${editing ? ' gm-edit' : ''}${selected ? ' gm-selected' : ''}`}
      style={{ left: shown.x * cell, top: shown.y * cell, width: shown.w * cell, height: shown.h * cell }}
      role="button" tabIndex={0}
      onPointerDown={(e) => start('move', e)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
      onClick={() => {
        if (moved.current) { moved.current = false; return }
        if (editing) onSelect(); else onOpen()
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !editing) onOpen() }}
    >
      {children}
      {editing && selected && (
        <div className="gm-grip" onPointerDown={(e) => start('resize', e)} onPointerMove={move} onPointerUp={end} />
      )}
    </div>
  )
}
```

주: `gm-tile`이 `<button>`에서 `<div role="button">`으로 바뀌므로 CSS의 `.gm-tile` 정의는 그대로 재사용(버튼 리셋 불필요). HomeCanvas/RoomCanvas의 기존 `<button className="gm-tile">` 렌더는 EditableTile로 완전 대체.
편집 중 행 확장: `rows` 계산을 `contentRows(rects, minRows) + (editing ? 3 : 0)`으로 변경(두 캔버스 모두 — RoomCanvas는 `inner.rows`를 `Math.max(inner.rows, ...스토리지 최하단) + (editing ? 3 : 0)`로, 최하단 = `contentRows(storages.map(storageRect), inner.rows)`).

- [ ] **Step 2: globals.css — 편집 CSS**

```css
.gmap-bar{display:flex;align-items:center;gap:8px}
.gmap-bar .tadd-row,.gmap-bar .tadd-form{flex:1}
.gmap-edit{flex-shrink:0;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;background:var(--panel);color:var(--ink-soft)}
.gmap-edit.on{background:var(--accent);color:#fff}
.gm-edit{touch-action:none;cursor:move}
.gm-selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.gm-grip{
  position:absolute;right:-14px;bottom:-14px;width:44px;height:44px;touch-action:none;cursor:se-resize;
  display:flex;align-items:center;justify-content:center;
}
.gm-grip::after{content:'';width:20px;height:20px;border-radius:6px;background:var(--accent);box-shadow:var(--shadow)}
```

- [ ] **Step 3: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
git add web/src/components/GridMap.tsx web/src/app/globals.css
git commit -m "feat(map): 편집 모드 — 셀 스냅 드래그 이동 + 44px 코너 핸들 리사이즈"
```

---

### Task 6: 구 캔버스 코드 삭제 + CSS 정리

**Files:**
- Delete: `web/src/components/MapCanvas.tsx`, `web/src/components/DetailPanel.tsx`, `web/src/components/RoomDetail.tsx`, `web/src/components/StorageBadge.tsx`, `web/src/lib/geometry.ts`, `web/src/lib/geometry.test.ts`
- Modify: `web/src/app/(app)/page.tsx`(잔존 참조·데드 핸들러), `web/src/lib/types.ts`(미사용 상수), `web/src/app/globals.css`(데드 셀렉터)

- [ ] **Step 1: 참조 확인 후 파일 삭제**

```bash
cd web && grep -rn "MapCanvas\|DetailPanel\|RoomDetail\|StorageBadge\|from '@/lib/geometry'\|from './geometry'" src --include="*.tsx" --include="*.ts"
```
매치가 위 삭제 대상 파일들 내부(상호 참조)뿐인지 확인 후 `git rm` 6개 파일. 다른 파일에 잔존 참조가 있으면 먼저 제거(주로 page.tsx — `handleItemsAdd` 등 트리가 쓰는 것은 유지).

- [ ] **Step 2: page.tsx 데드 코드 제거**

`selectedStorage`·`DetailPanel` 전용이던 핸들러/파생값(`onItemsAdd` 경로 중 트리(`handleTreeItemAdd`)가 안 쓰는 것, photoUrls 로딩이 DetailPanel 전용이었다면 그것도 — **단 `handleItemsAdd` 자체는 트리가 사용하므로 유지**) grep으로 확인해 고아만 제거. `ROOM_COLORS`/`STORAGE_TYPES` import가 page에 남아 있으면 제거.

- [ ] **Step 3: types.ts 정리**

`STORAGE_TYPES`·`ROOM_COLORS` 사용처 grep:
```bash
grep -rn "STORAGE_TYPES\|ROOM_COLORS" src --include="*.tsx" --include="*.ts"
```
사용처 0이면 두 상수 삭제(타입 `StorageTypeKey`는 `Storage.type`이 참조하므로 유지). 사용처가 남아 있으면(예: 온보딩) 유지하고 보고서에 기록.

- [ ] **Step 4: globals.css 데드 셀렉터 삭제**

각각 **grep으로 컴포넌트 사용처 0건 확인 후** 삭제: `.toolbar`, `.tb-title`, `.mode-btn`, `.storage-palette`, `.pal-btn`, `.hint`, `.activity`(주의: `.activity-list`는 ActivityFeed가 사용 — 유지), `.map-area`, `.map-scroll`, `.map`(및 `.map.tool-*`, `.map.empty::after`, `.map:not(...)`), `.room`, `.room-label`, `.room-grip`, `.ghost`, `.storage`(및 `.badge`/`.count`/`.st-label`/`.found`/`.selected`), `@keyframes pulse`, `.map-footer`, `.detail-panel` 전부(및 `dp-slide-*` keyframes), `.dp-*`, `.rd-*`, `.item-card`, `.item-thumb`, `.item-body`, `.item-name`, `.item-memo`, `.item-by`, `.item-del`, `.dp-empty`, `.photo-btn`, `.add-btn`, `.dp-actions`, `.dp-form`. `--grid`·`--st-label-bg` 토큰: `--grid`는 신규 `.gmap`이 사용하므로 유지, `--st-label-bg`는 사용처 0건 확인 후 삭제.

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "refactor(map): 구 px 캔버스 일괄 제거 — MapCanvas·DetailPanel·RoomDetail·StorageBadge·geometry + 데드 CSS"
```

---

### Task 7: (컨트롤러 직접) 전체 게이트 + 최종 리뷰 + 배포

1. `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` 전부 통과 확인.
2. 최종 전체 브랜치 리뷰(opus) — 교차-태스크: 레거시 변환↔동기화 경합, 편집 커밋 콜백 배선, 삭제 태스크가 산 코드를 지웠는지, 접근성(타일 키보드 진입).
3. 발견사항 수정 후 push(=Vercel 자동 배포), 원장 기록, 사용자 수동 확인 안내(모바일 390px: 상하 공백 해소·드릴·편집 이동/리사이즈, 데스크톱, 라이트/다크, 검색→L2 점프, 레거시 데이터 변환).
