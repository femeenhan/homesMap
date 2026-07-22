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
