export const LOGICAL_W = 940
export const LOGICAL_H = 600
export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export function fitScale(cw: number, ch: number): number {
  return Math.min(1, cw / LOGICAL_W, ch / LOGICAL_H)
}
export function normalizeRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}
export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}
