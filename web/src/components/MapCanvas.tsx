'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage, DecItem, Mode, StorageTypeKey } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import {
  fitScale, LOGICAL_W, LOGICAL_H, MIN_ROOM_W, MIN_ROOM_H,
  normalizeRect, pointInRect, moveRoomRect, resizeRoomRect, clampStoragePos, recomputeChildStorages,
} from '@/lib/geometry'
import type { Pt, Rect } from '@/lib/geometry'
import { RoomShape } from './RoomShape'
import { StorageBadge } from './StorageBadge'
import { Modal } from './Modal'

type Props = {
  mode: Mode
  palType: StorageTypeKey
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  onStorageClick?: (storageId: string) => void
  onRoomCreate: (rect: Rect, name: string, colorIndex: number) => void
  onStoragePlace: (room: Room, point: Pt, name: string) => void
  onRoomDelete: (room: Room) => void
  onRoomGeometry: (room: Room, next: Rect) => void
  onStorageMove: (storage: Storage, pos: Pt) => void
  onToast: (msg: string) => void
  flashStorageId?: string | null
}

type PendingModal =
  | { kind: 'room'; rect: Rect }
  | { kind: 'storage'; room: Room; point: Pt }
  | { kind: 'delete'; room: Room }

// 드래그 상태 머신: 생성/방이동/방리사이즈/수납장이동이 pointermove·pointerup 생명주기를 공유한다.
// 프리뷰(rect/pos)는 드래그 중 로컬 state로만 갱신하고, 손 뗄 때 딱 한 번 부모로 커밋한다(스토어는 드래그 중 미변경).
type Drag =
  | { kind: 'create'; start: Pt; rect: Rect }
  | { kind: 'move-room'; room: Room; grab: Pt; rect: Rect }
  | { kind: 'resize-room'; room: Room; rect: Rect }
  | { kind: 'move-storage'; storage: Storage; room: Room; grab: Pt; pos: Pt }

export function MapCanvas({
  mode,
  palType,
  rooms,
  storages,
  decItems,
  onStorageClick,
  onRoomCreate,
  onStoragePlace,
  onRoomDelete,
  onRoomGeometry,
  onStorageMove,
  onToast,
  flashStorageId,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pendingModal, setPendingModal] = useState<PendingModal | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setScale(fitScale(el.clientWidth, el.clientHeight))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 검색 결과 클릭(flashStorageId 변경) 시 해당 수납장으로 스크롤(프로토타입 flashStorage 이식).
  // glow/found 클래스는 아래 렌더에서 props로 결정되므로, 여기서는 스크롤이라는 부수효과만 담당한다.
  useEffect(() => {
    if (!flashStorageId) return
    const el = mapRef.current?.querySelector<HTMLElement>('.storage.found')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [flashStorageId])

  // 지도는 transform:scale() 로 시각적으로만 축소되므로, 화면 좌표를 940x600 논리 좌표로 되돌리려면
  // 클릭 지점과 지도 원점의 차를 scale로 나눠야 한다(프로토타입은 scale이 항상 1이라 나눗셈이 없었음).
  function mapPos(e: { clientX: number; clientY: number }): Pt {
    const rect = mapRef.current!.getBoundingClientRect()
    return { x: Math.round((e.clientX - rect.left) / scale), y: Math.round((e.clientY - rect.top) / scale) }
  }

  // 빈 캔버스에서 시작한 pointerdown만 여기 도달(방/수납장/그립은 각 요소가 stopPropagation) → 새 방 생성 드래그.
  function handleMapPointerDown(e: React.PointerEvent) {
    if (mode !== 'room') return
    const p = mapPos(e)
    setDrag({ kind: 'create', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } })
  }

  function startRoomMove(room: Room, e: React.PointerEvent) {
    const p = mapPos(e)
    setDrag({ kind: 'move-room', room, grab: { x: p.x - room.x, y: p.y - room.y }, rect: { x: room.x, y: room.y, w: room.w, h: room.h } })
  }
  function startRoomResize(room: Room, e: React.PointerEvent) {
    setDrag({ kind: 'resize-room', room, rect: resizeRoomRect(room, mapPos(e)) })
  }
  function startStorageMove(storage: Storage, e: React.PointerEvent) {
    const room = rooms.find((r) => r.id === storage.room_id)
    if (!room) return
    const p = mapPos(e)
    setDrag({ kind: 'move-storage', storage, room, grab: { x: p.x - storage.x, y: p.y - storage.y }, pos: { x: storage.x, y: storage.y } })
  }

  // 드래그 생명주기: kind가 유지되는 동안 리스너 1쌍. 프리뷰는 onMove가 갱신, 확정은 onUp이 pointerup 좌표로 재계산.
  useEffect(() => {
    if (!drag) return
    const active = drag // 이 드래그 동안 kind/room/grab/start 불변 — 널 좁힘을 중첩 클로저로 넘기기 위해 스냅샷
    function onMove(e: PointerEvent) {
      const p = mapPos(e)
      setDrag((d) => {
        if (!d) return d
        if (d.kind === 'create') return { ...d, rect: normalizeRect(d.start, p) }
        if (d.kind === 'move-room') return { ...d, rect: moveRoomRect(d.room, p, d.grab) }
        if (d.kind === 'resize-room') return { ...d, rect: resizeRoomRect(d.room, p) }
        return { ...d, pos: clampStoragePos(d.room, { x: p.x - d.grab.x, y: p.y - d.grab.y }) }
      })
    }
    function onUp(e: PointerEvent) {
      const p = mapPos(e)
      if (active.kind === 'create') {
        const rect = normalizeRect(active.start, p)
        if (rect.w < MIN_ROOM_W || rect.h < MIN_ROOM_H) {
          if (rect.w > 8 || rect.h > 8) onToast('조금 더 크게 드래그해주세요')
        } else {
          setPendingModal({ kind: 'room', rect })
        }
      } else if (active.kind === 'move-room' || active.kind === 'resize-room') {
        const next = active.kind === 'move-room' ? moveRoomRect(active.room, p, active.grab) : resizeRoomRect(active.room, p)
        if (next.x !== active.room.x || next.y !== active.room.y || next.w !== active.room.w || next.h !== active.room.h) {
          onRoomGeometry(active.room, next)
        }
      } else {
        const pos = clampStoragePos(active.room, { x: p.x - active.grab.x, y: p.y - active.grab.y })
        if (pos.x !== active.storage.x || pos.y !== active.storage.y) onStorageMove(active.storage, pos)
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.kind])

  function handleClick(e: React.MouseEvent) {
    if (mode !== 'storage') return
    const p = mapPos(e)
    const room = rooms.find((r) => pointInRect(p, r))
    if (!room) {
      onToast('방 안쪽을 클릭해서 배치해주세요')
      return
    }
    setPendingModal({ kind: 'storage', room, point: p })
  }

  const itemCountByStorage = new Map<string, number>()
  for (const item of decItems) {
    itemCountByStorage.set(item.storage_id, (itemCountByStorage.get(item.storage_id) ?? 0) + 1)
  }

  const flashRoomId = flashStorageId ? storages.find((s) => s.id === flashStorageId)?.room_id : undefined
  const palMeta = STORAGE_TYPES.find((s) => s.type === palType)!
  const mapClassName = [
    'map',
    rooms.length === 0 ? 'empty' : '',
    mode === 'room' ? 'mode-room' : '',
    mode === 'storage' ? 'mode-storage' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // 드래그 프리뷰: 이동/리사이즈 중인 방은 drag.rect로, 그 방의 자식 수납장은 커밋과 동일한 규칙으로 미리 옮겨 그린다.
  const previewRect = drag?.kind === 'move-room' || drag?.kind === 'resize-room' ? drag.rect : null
  const storageOverride = new Map<string, Pt>()
  if (previewRect && (drag?.kind === 'move-room' || drag?.kind === 'resize-room')) {
    const dx = previewRect.x - drag.room.x
    const dy = previewRect.y - drag.room.y
    const kids = storages.filter((s) => s.room_id === drag.room.id)
    for (const s of recomputeChildStorages(kids, dx, dy, previewRect)) storageOverride.set(s.id, { x: s.x, y: s.y })
  } else if (drag?.kind === 'move-storage') {
    storageOverride.set(drag.storage.id, drag.pos)
  }

  return (
    <div className="map-area">
      <div className="map-scroll" ref={scrollRef}>
        <div style={{ width: LOGICAL_W * scale, height: LOGICAL_H * scale }}>
          <div
            ref={mapRef}
            className={mapClassName}
            style={{ transform: `scale(${scale})` }}
            onPointerDown={handleMapPointerDown}
            onClick={handleClick}
          >
            {rooms.map((room) => (
              <RoomShape
                key={room.id}
                room={room}
                rect={previewRect && drag && 'room' in drag && drag.room.id === room.id ? previewRect : undefined}
                glow={room.id === flashRoomId}
                onDelete={(r) => setPendingModal({ kind: 'delete', room: r })}
                onMoveStart={mode === 'room' ? startRoomMove : undefined}
                onResizeStart={mode === 'room' ? startRoomResize : undefined}
              />
            ))}
            {storages.map((storage) => (
              <StorageBadge
                key={storage.id}
                storage={storage}
                pos={storageOverride.get(storage.id)}
                itemCount={itemCountByStorage.get(storage.id) ?? 0}
                found={storage.id === flashStorageId}
                onClick={mode === 'select' ? onStorageClick : undefined}
                onMoveStart={mode === 'storage' ? startStorageMove : undefined}
              />
            ))}
            {drag?.kind === 'create' && (
              <div
                className="ghost"
                style={{ display: 'block', left: drag.rect.x, top: drag.rect.y, width: drag.rect.w, height: drag.rect.h }}
              />
            )}
          </div>
        </div>
      </div>
      <div className="map-footer">
        <span>
          🏠 방 {rooms.length} · 📦 수납장 {storages.length} · 🧸 물건 {decItems.length}개 등록됨
        </span>
      </div>

      {pendingModal && pendingModal.kind === 'room' && (
        <Modal
          title="✏️ 새 방 만들기"
          nameLabel="방 이름"
          namePlaceholder="예: 거실, 아이방"
          showColorPicker
          okText="방 만들기"
          onCancel={() => setPendingModal(null)}
          onConfirm={({ name, colorIndex }) => {
            setPendingModal(null)
            onRoomCreate(pendingModal.rect, name, colorIndex)
          }}
        />
      )}
      {pendingModal && pendingModal.kind === 'storage' && (
        <Modal
          title={`${palMeta.em} ${pendingModal.room.name}에 ${palMeta.label} 놓기`}
          nameLabel="수납장 이름"
          namePlaceholder={`예: ${pendingModal.room.name} ${palMeta.label}`}
          defaultName={`${pendingModal.room.name} ${palMeta.label}`}
          okText="배치하기"
          onCancel={() => setPendingModal(null)}
          onConfirm={({ name }) => {
            setPendingModal(null)
            onStoragePlace(pendingModal.room, pendingModal.point, name)
          }}
        />
      )}
      {pendingModal && pendingModal.kind === 'delete' && (
        <Modal
          title="방 삭제"
          message={`'${pendingModal.room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
          okText="삭제"
          onCancel={() => setPendingModal(null)}
          onConfirm={() => {
            setPendingModal(null)
            onRoomDelete(pendingModal.room)
          }}
        />
      )}
    </div>
  )
}
