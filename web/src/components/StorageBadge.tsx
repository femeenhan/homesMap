import type { Storage } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'

type Props = {
  storage: Storage
  itemCount: number
  onClick?: (storageId: string) => void
}

export function StorageBadge({ storage, itemCount, onClick }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  return (
    <button
      type="button"
      className="storage"
      style={{ left: storage.x, top: storage.y }}
      onClick={onClick ? () => onClick(storage.id) : undefined}
    >
      <span className="badge">
        {meta?.em ?? '📦'}
        {itemCount > 0 && <span className="count">{itemCount}</span>}
      </span>
      <span className="st-label">{storage.name}</span>
    </button>
  )
}
