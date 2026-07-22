import { describe, it, expect } from 'vitest'
import {
  fitScale, normalizeRect, pointInRect, clamp,
  moveRoomRect, resizeRoomRect, clampStoragePos, recomputeChildStorages,
} from './geometry'

describe('geometry', () => {
  it('fitScale: 비율 유지, MAX_SCALE까지 확대', () => {
    expect(fitScale(470, 300)).toBeCloseTo(0.5)
    expect(fitScale(9400, 6000)).toBe(1.8) // 컨테이너가 충분히 크면 상한(MAX_SCALE)까지
  })
  it('normalizeRect: 좌상단+w/h 정규화', () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: 40, y: 200 })).toEqual({ x: 40, y: 80, w: 60, h: 120 })
  })
  it('pointInRect', () => {
    expect(pointInRect({ x: 50, y: 50 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(true)
    expect(pointInRect({ x: 5, y: 5 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(false)
  })
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
  it('moveRoomRect: grab 보정 + 캔버스 경계 클램프', () => {
    const room = { x: 100, y: 100, w: 200, h: 150 }
    expect(moveRoomRect(room, { x: 160, y: 180 }, { x: 40, y: 30 })).toEqual({ x: 120, y: 150, w: 200, h: 150 })
    // 오른쪽/아래로 밀어도 방이 940x600 밖으로 못 나감
    expect(moveRoomRect(room, { x: 9999, y: 9999 }, { x: 0, y: 0 })).toEqual({ x: 740, y: 450, w: 200, h: 150 })
  })
  it('resizeRoomRect: 좌상단 고정, 최소크기 클램프', () => {
    const room = { x: 100, y: 100, w: 200, h: 150 }
    expect(resizeRoomRect(room, { x: 400, y: 300 })).toEqual({ x: 100, y: 100, w: 300, h: 200 })
    expect(resizeRoomRect(room, { x: 100, y: 100 })).toEqual({ x: 100, y: 100, w: 60, h: 50 }) // MIN
  })
  it('clampStoragePos: 방 사각형 안으로', () => {
    const room = { x: 50, y: 50, w: 100, h: 100 }
    expect(clampStoragePos(room, { x: 90, y: 90 })).toEqual({ x: 90, y: 90 })
    expect(clampStoragePos(room, { x: 999, y: 10 })).toEqual({ x: 150, y: 50 })
  })
  it('recomputeChildStorages: 이동은 평행이동, 리사이즈 축소는 밖만 클램프', () => {
    const kids = [{ x: 100, y: 100 }, { x: 300, y: 250 }]
    // 이동: dx=20, dy=30
    expect(recomputeChildStorages(kids, 20, 30, { x: 60, y: 60, w: 400, h: 400 }))
      .toEqual([{ x: 120, y: 130 }, { x: 320, y: 280 }])
    // 리사이즈 축소(dx=dy=0): 50..150 사각형 밖의 (300,250)만 (150,150)으로
    expect(recomputeChildStorages(kids, 0, 0, { x: 50, y: 50, w: 100, h: 100 }))
      .toEqual([{ x: 100, y: 100 }, { x: 150, y: 150 }])
  })
})
