import type { Compartment } from './types'

export type ItemGroup<T> = { compartment: Compartment | null; items: T[] } // compartment=null → 미분류

// 물건을 소속 칸별로 묶는다. 칸 순서(compartments 배열)를 유지하고, 빈 칸도 그룹으로 낸다.
// compartment_id가 없거나 목록에 없는(삭제된 칸) 물건은 마지막 '미분류' 그룹으로 폴백 — 물건 재기록 없이 처리.
export function groupItemsByCompartment<T extends { compartment_id: string | null }>(
  items: T[],
  compartments: Compartment[],
): ItemGroup<T>[] {
  const valid = new Set(compartments.map((c) => c.id))
  const byId = new Map<string, T[]>()
  const unfiled: T[] = []
  for (const it of items) {
    if (it.compartment_id && valid.has(it.compartment_id)) {
      const arr = byId.get(it.compartment_id)
      if (arr) arr.push(it)
      else byId.set(it.compartment_id, [it])
    } else {
      unfiled.push(it)
    }
  }
  const groups: ItemGroup<T>[] = compartments.map((c) => ({ compartment: c, items: byId.get(c.id) ?? [] }))
  if (unfiled.length) groups.push({ compartment: null, items: unfiled })
  return groups
}
