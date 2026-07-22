import type { Storage } from '@/lib/types'
import type { Pt } from '@/lib/geometry'
import { STORAGE_TYPES } from '@/lib/types'

type Props = {
  storage: Storage
  itemCount: number
  found?: boolean
  pos?: Pt // 드래그 중 프리뷰 위치(없으면 storage 자체)
  onClick?: (storageId: string) => void
  onMoveStart?: (storage: Storage, e: React.PointerEvent) => void
}

export function StorageBadge({ storage, itemCount, found, pos, onClick, onMoveStart }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  const p = pos ?? storage
  return (
    <button
      type="button"
      className={`storage${found ? ' found' : ''}`}
      style={{ left: p.x, top: p.y }}
      // 수납장 모드에서만 드래그=이동. stopPropagation으로 지도 배치/생성 드래그와 안 겹치게.
      onPointerDown={onMoveStart ? (e) => { e.stopPropagation(); onMoveStart(storage, e) } : undefined}
      onClick={(e) => {
        // 지도(mode-aware pointerdown/click)로 버블링돼 방 그리기·수납장 배치가 오작동하지 않도록 항상 차단
        e.stopPropagation()
        onClick?.(storage.id)
      }}
    >
      <span className="badge">
        {meta?.em ?? '📦'}
        {itemCount > 0 && <span className="count">{itemCount}</span>}
      </span>
      <span className="st-label">{storage.name}</span>
    </button>
  )
}
