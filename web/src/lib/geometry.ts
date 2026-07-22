export const LOGICAL_W = 940
export const LOGICAL_H = 600
export const MIN_ROOM_W = 60 // 방 생성/리사이즈 최소 크기(생성 드래그 임계값과 동일)
export const MIN_ROOM_H = 50
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
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// 방 본체를 드래그해 이동: grab(누른 지점의 방 원점 대비 오프셋)을 빼서 점프 없이 따라오게 하고 캔버스 안으로 클램프.
export function moveRoomRect(room: Rect, p: Pt, grab: Pt): Rect {
  return {
    x: clamp(Math.round(p.x - grab.x), 0, LOGICAL_W - room.w),
    y: clamp(Math.round(p.y - grab.y), 0, LOGICAL_H - room.h),
    w: room.w,
    h: room.h,
  }
}
// 우하단 잡기로 리사이즈: 좌상단 고정, 최소크기~캔버스 경계로 클램프.
export function resizeRoomRect(room: Rect, p: Pt): Rect {
  return {
    x: room.x,
    y: room.y,
    w: clamp(Math.round(p.x - room.x), MIN_ROOM_W, LOGICAL_W - room.x),
    h: clamp(Math.round(p.y - room.y), MIN_ROOM_H, LOGICAL_H - room.y),
  }
}
// 수납장 중심을 소속 방 사각형 안으로 클램프.
export function clampStoragePos(room: Rect, center: Pt): Pt {
  return {
    x: clamp(Math.round(center.x), room.x, room.x + room.w),
    y: clamp(Math.round(center.y), room.y, room.y + room.h),
  }
}
// 방 지오메트리 변경 시 자식 수납장 재계산: dx,dy 평행이동 후 새 방 사각형 안으로 클램프.
// - 이동(크기 동일): dx,dy 만큼 방과 함께 따라옴
// - 리사이즈(좌상단 고정 dx=dy=0): 제자리 + 축소로 밖에 남은 것만 경계 안으로
export function recomputeChildStorages<T extends Pt>(storages: T[], dx: number, dy: number, next: Rect): T[] {
  return storages.map((s) => ({
    ...s,
    x: clamp(s.x + dx, next.x, next.x + next.w),
    y: clamp(s.y + dy, next.y, next.y + next.h),
  }))
}
