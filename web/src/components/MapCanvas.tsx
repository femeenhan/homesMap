'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage, DecItem, Mode, StorageTypeKey } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import { fitScale, LOGICAL_W, LOGICAL_H, normalizeRect, pointInRect } from '@/lib/geometry'
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
  onToast: (msg: string) => void
  flashStorageId?: string | null
}

type PendingModal =
  | { kind: 'room'; rect: Rect }
  | { kind: 'storage'; room: Room; point: Pt }
  | { kind: 'delete'; room: Room }

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
  onToast,
  flashStorageId,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [dragStart, setDragStart] = useState<Pt | null>(null)
  const [dragRect, setDragRect] = useState<Rect | null>(null)
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

  function handleMouseDown(e: React.MouseEvent) {
    if (mode !== 'room') return
    const p = mapPos(e)
    setDragStart(p)
    setDragRect({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  useEffect(() => {
    if (!dragStart) return
    const start = dragStart
    function onMove(e: MouseEvent) {
      setDragRect(normalizeRect(start, mapPos(e)))
    }
    function onUp(e: MouseEvent) {
      const rect = normalizeRect(start, mapPos(e))
      setDragStart(null)
      setDragRect(null)
      if (rect.w < 60 || rect.h < 50) {
        if (rect.w > 8 || rect.h > 8) onToast('조금 더 크게 드래그해주세요')
        return
      }
      setPendingModal({ kind: 'room', rect })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart])

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

  return (
    <div className="map-area">
      <div className="map-scroll" ref={scrollRef}>
        <div style={{ width: LOGICAL_W * scale, height: LOGICAL_H * scale }}>
          <div
            ref={mapRef}
            className={mapClassName}
            style={{ transform: `scale(${scale})` }}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
          >
            {rooms.map((room) => (
              <RoomShape
                key={room.id}
                room={room}
                glow={room.id === flashRoomId}
                onDelete={(r) => setPendingModal({ kind: 'delete', room: r })}
              />
            ))}
            {storages.map((storage) => (
              <StorageBadge
                key={storage.id}
                storage={storage}
                itemCount={itemCountByStorage.get(storage.id) ?? 0}
                found={storage.id === flashStorageId}
                onClick={mode === 'select' ? onStorageClick : undefined}
              />
            ))}
            {dragRect && (
              <div
                className="ghost"
                style={{ display: 'block', left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
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
