import type { Storage } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'

type Props = {
  storage: Storage
  itemCount: number
  found?: boolean
  onClick?: (storageId: string) => void
}

export function StorageBadge({ storage, itemCount, found, onClick }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  return (
    <button
      type="button"
      className={`storage${found ? ' found' : ''}`}
      style={{ left: storage.x, top: storage.y }}
      onClick={(e) => {
        // 지도(mode-aware mousedown/click)로 버블링돼 방 그리기·수납장 배치가 오작동하지 않도록 항상 차단
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
