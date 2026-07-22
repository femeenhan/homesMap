import { describe, it, expect } from 'vitest'
import { childCompartments, descendantIds } from './compartments'

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
})
