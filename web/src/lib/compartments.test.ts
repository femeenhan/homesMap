import { describe, it, expect } from 'vitest'
import { childCompartments, descendantIds, compartmentPath, duplicateCompartments } from './compartments'
import type { Compartment } from './types'

// 서랍장 > 위/아래, 아래 > 아래-앞/아래-뒤
const cmps = [
  { id: 'top', name: '위' },
  { id: 'bot', name: '아래' },
  { id: 'bf', name: '아래-앞', parent_id: 'bot' },
  { id: 'bb', name: '아래-뒤', parent_id: 'bot' },
]

describe('compartments tree', () => {
  it('childCompartments: 직속 자식만, 순서 유지', () => {
    expect(childCompartments(cmps, null).map((c) => c.id)).toEqual(['top', 'bot'])
    expect(childCompartments(cmps, 'bot').map((c) => c.id)).toEqual(['bf', 'bb'])
    expect(childCompartments(cmps, 'top')).toEqual([])
  })
  it('descendantIds: 자기 + 모든 후손', () => {
    expect(descendantIds(cmps, 'bot').sort()).toEqual(['bb', 'bf', 'bot'])
    expect(descendantIds(cmps, 'top')).toEqual(['top'])
  })
  it('compartmentPath: 루트→자기 경로(순환 안전)', () => {
    expect(compartmentPath(cmps, 'bf').map((c) => c.name)).toEqual(['아래', '아래-앞'])
    expect(compartmentPath(cmps, 'top').map((c) => c.name)).toEqual(['위'])
    expect(compartmentPath(cmps, null)).toEqual([])
  })
})

describe('duplicateCompartments', () => {
  const c = (id: string, parent_id: string | null = null): Compartment => ({ id, name: id, parent_id })
  it('전부 새 id를 받고 중첩 부모 관계가 보존된다', () => {
    const src = [c('a'), c('b', 'a'), c('c', 'b'), c('d')]
    const out = duplicateCompartments(src)
    expect(out).toHaveLength(4)
    const srcIds = new Set(src.map((x) => x.id))
    for (const x of out) expect(srcIds.has(x.id)).toBe(false)
    const byName = (n: string) => out.find((x) => x.name === n)!
    expect(byName('b').parent_id).toBe(byName('a').id)
    expect(byName('c').parent_id).toBe(byName('b').id)
    expect(byName('d').parent_id).toBeNull()
  })
  it('없는 부모 참조는 null로 정리된다', () => {
    const out = duplicateCompartments([c('x', 'ghost')])
    expect(out[0].parent_id).toBeNull()
  })
})
