import type { Room } from '@/lib/types'
import type { Rect } from '@/lib/geometry'
import { ROOM_COLORS } from '@/lib/types'

type Props = {
  room: Room
  rect?: Rect // 드래그 중 프리뷰 지오메트리(없으면 room 자체)
  glow?: boolean
  onDelete?: (room: Room) => void
  onMoveStart?: (room: Room, e: React.PointerEvent) => void
  onResizeStart?: (room: Room, e: React.PointerEvent) => void
}

export function RoomShape({ room, rect, glow, onDelete, onMoveStart, onResizeStart }: Props) {
  const color = ROOM_COLORS[room.color_index % ROOM_COLORS.length]
  const g = rect ?? room
  return (
    <div
      className={`room${glow ? ' glow' : ''}`}
      style={{
        left: g.x,
        top: g.y,
        width: g.w,
        height: g.h,
        background: color.fill,
        borderColor: color.border,
      }}
      // 방 모드에서만 본체 드래그=이동. stopPropagation으로 지도의 새 방 생성 드래그가 안 겹치게.
      onPointerDown={onMoveStart ? (e) => { e.stopPropagation(); onMoveStart(room, e) } : undefined}
    >
      <span className="room-label" style={{ color: color.border }}>
        🏷️ {room.name}
      </span>
      {onDelete && (
        <button
          type="button"
          className="room-del"
          title="방 삭제"
          onPointerDown={(e) => e.stopPropagation()} // ✕ 잡기가 이동 드래그를 시작하지 않도록
          onClick={(e) => {
            e.stopPropagation()
            onDelete(room)
          }}
        >
          ✕
        </button>
      )}
      {onResizeStart && (
        <span
          className="room-grip"
          title="크기 조절"
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(room, e) }}
        />
      )}
    </div>
  )
}
