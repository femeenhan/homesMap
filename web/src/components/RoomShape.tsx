import type { Room } from '@/lib/types'
import { ROOM_COLORS } from '@/lib/types'

export function RoomShape({ room }: { room: Room }) {
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
    </div>
  )
}
