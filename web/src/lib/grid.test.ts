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
