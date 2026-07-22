import type { Room } from '@/lib/types'
import type { Rect } from '@/lib/geometry'
import { ROOM_COLORS } from '@/lib/types'

type Props = {
  room: Room
  rect?: Rect // 드래그 중 프리뷰 지오메트리(없으면 room 자체)
  glow?: boolean
  selected?: boolean
  onSelect?: (room: Room) => void
  onMoveStart?: (room: Room, e: React.PointerEvent) => void
  onResizeStart?: (room: Room, e: React.PointerEvent) => void
}

export function RoomShape({ room, rect, glow, selected, onSelect, onMoveStart, onResizeStart }: Props) {
  const color = ROOM_COLORS[room.color_index % ROOM_COLORS.length]
  const g = rect ?? room
  return (
    <div
      className={`room${glow ? ' glow' : ''}${selected ? ' selected' : ''}`}
      style={{
        left: g.x,
        top: g.y,
        width: g.w,
        height: g.h,
        background: color.fill,
        borderColor: color.border,
      }}
      // 기본 상태에서만 본체 드래그=이동, 탭=선택(방 드로어 열기). stopPropagation으로 지도의 배경 탭/생성 드래그와 안 겹치게.
      onPointerDown={onMoveStart ? (e) => { e.stopPropagation(); onMoveStart(room, e) } : undefined}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(room) } : undefined}
    >
      <span className="room-label" style={{ color: color.border }}>
        🏷️ {room.name}
      </span>
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
