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
