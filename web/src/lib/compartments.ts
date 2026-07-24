import type { Compartment } from './types'

const parentOf = (c: Compartment) => c.parent_id ?? null

// 직속 자식 칸(순서 유지)
export function childCompartments(compartments: Compartment[], parentId: string | null): Compartment[] {
  return compartments.filter((c) => parentOf(c) === parentId)
}

// 자기 자신 + 모든 후손 칸 id (연쇄 삭제용)
export function descendantIds(compartments: Compartment[], id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    for (const c of compartments) if (parentOf(c) === cur) stack.push(c.id)
  }
  return out
}

// 수납장 복사용: 칸 트리 전체를 새 id로 복제. parent_id는 새 id로 재매핑(없는 부모 참조는 null 정리).
export function duplicateCompartments(comps: Compartment[]): Compartment[] {
  const idMap = new Map(comps.map((c) => [c.id, crypto.randomUUID()]))
  return comps.map((c) => ({
    ...c,
    id: idMap.get(c.id)!,
    parent_id: c.parent_id ? (idMap.get(c.parent_id) ?? null) : null,
  }))
}

// 루트→...→자기 칸 경로(검색 브레드크럼용). 순환 방지.
export function compartmentPath(compartments: Compartment[], id: string | null): Compartment[] {
  if (!id) return []
  const byId = new Map(compartments.map((c) => [c.id, c]))
  const chain: Compartment[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
  return chain
}
