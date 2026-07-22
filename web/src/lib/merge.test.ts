import { describe, it, expect } from 'vitest'
import { mergeRows } from './merge'

type R = { id: string; updated_at: string; v: number }
describe('mergeRows (LWW)', () => {
  it('updated_at 최신이 승, 신규는 추가', () => {
    const local: R[] = [{ id: 'a', updated_at: '2026-01-01', v: 1 }]
    const incoming: R[] = [
      { id: 'a', updated_at: '2026-02-01', v: 2 }, // 최신 → 교체
      { id: 'b', updated_at: '2026-01-01', v: 9 }, // 신규 → 추가
    ]
    const m = mergeRows(local, incoming)
    expect(m.find(r => r.id === 'a')!.v).toBe(2)
    expect(m.find(r => r.id === 'b')!.v).toBe(9)
  })
  it('로컬이 더 최신이면 유지', () => {
    const local: R[] = [{ id: 'a', updated_at: '2026-03-01', v: 5 }]
    const incoming: R[] = [{ id: 'a', updated_at: '2026-02-01', v: 2 }]
    expect(mergeRows(local, incoming).find(r => r.id === 'a')!.v).toBe(5)
  })
})
