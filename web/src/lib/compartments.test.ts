import { describe, it, expect } from 'vitest'
import { groupItemsByCompartment } from './compartments'

const cmps = [{ id: 'a', name: '윗서랍' }, { id: 'b', name: '아래서랍' }]
const item = (id: string, compartment_id: string | null) => ({ id, compartment_id })

describe('groupItemsByCompartment', () => {
  it('칸 순서 유지 + 빈 칸도 그룹으로', () => {
    const g = groupItemsByCompartment([item('1', 'b'), item('2', 'a')], cmps)
    expect(g.map((x) => x.compartment?.id)).toEqual(['a', 'b']) // 칸 배열 순서
    expect(g[0].items.map((i) => i.id)).toEqual(['2'])
    expect(g[1].items.map((i) => i.id)).toEqual(['1'])
  })
  it('칸 없음/삭제된 칸 물건은 미분류로 폴백', () => {
    const g = groupItemsByCompartment([item('1', null), item('2', 'zzz'), item('3', 'a')], cmps)
    const unfiled = g.find((x) => x.compartment === null)
    expect(unfiled?.items.map((i) => i.id)).toEqual(['1', '2'])
    expect(g[0].items.map((i) => i.id)).toEqual(['3'])
  })
  it('미분류 물건이 없으면 미분류 그룹 없음', () => {
    const g = groupItemsByCompartment([item('1', 'a')], cmps)
    expect(g.some((x) => x.compartment === null)).toBe(false)
  })
})
