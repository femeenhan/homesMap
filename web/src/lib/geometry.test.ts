import { describe, it, expect } from 'vitest'
import { fitScale, normalizeRect, pointInRect } from './geometry'

describe('geometry', () => {
  it('fitScale: 비율 유지 축소, 최대 1', () => {
    expect(fitScale(470, 300)).toBeCloseTo(0.5)
    expect(fitScale(2000, 2000)).toBe(1)
  })
  it('normalizeRect: 좌상단+w/h 정규화', () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: 40, y: 200 })).toEqual({ x: 40, y: 80, w: 60, h: 120 })
  })
  it('pointInRect', () => {
    expect(pointInRect({ x: 50, y: 50 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(true)
    expect(pointInRect({ x: 5, y: 5 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(false)
  })
})
