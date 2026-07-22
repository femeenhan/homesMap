import type { Room } from '@/lib/types'
import { ROOM_COLORS } from '@/lib/types'

type Props = {
  room: Room
  onDelete?: (room: Room) => void
}

export function RoomShape({ room, onDelete }: Props) {
  const color = ROOM_COLORS[room.color_index % ROOM_COLORS.length]
  return (
    <div
      className="room"
      style={{
        left: room.x,
        top: room.y,
        width: room.w,
        height: room.h,
        background: color.fill,
        borderColor: color.border,
      }}
    >
      <span className="room-label" style={{ color: color.border }}>
        🏷️ {room.name}
      </span>
      {onDelete && (
        <button
          type="button"
          className="room-del"
          title="방 삭제"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(room)
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
