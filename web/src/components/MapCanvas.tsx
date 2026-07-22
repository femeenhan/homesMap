'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage, DecItem } from '@/lib/types'
import { fitScale, LOGICAL_W, LOGICAL_H } from '@/lib/geometry'
import { RoomShape } from './RoomShape'
import { StorageBadge } from './StorageBadge'

type Props = {
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  onStorageClick?: (storageId: string) => void
}

export function MapCanvas({ rooms, storages, decItems, onStorageClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setScale(fitScale(el.clientWidth, el.clientHeight))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const itemCountByStorage = new Map<string, number>()
  for (const item of decItems) {
    itemCountByStorage.set(item.storage_id, (itemCountByStorage.get(item.storage_id) ?? 0) + 1)
  }

  return (
    <div className="map-area">
      <div className="map-scroll" ref={scrollRef}>
        <div style={{ width: LOGICAL_W * scale, height: LOGICAL_H * scale }}>
          <div
            className={`map${rooms.length === 0 ? ' empty' : ''}`}
            style={{ transform: `scale(${scale})` }}
          >
            {rooms.map((room) => (
              <RoomShape key={room.id} room={room} />
            ))}
            {storages.map((storage) => (
              <StorageBadge
                key={storage.id}
                storage={storage}
                itemCount={itemCountByStorage.get(storage.id) ?? 0}
                onClick={onStorageClick}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="map-footer">
        <span>
          🏠 방 {rooms.length} · 📦 수납장 {storages.length} · 🧸 물건 {decItems.length}개 등록됨
        </span>
      </div>
    </div>
  )
}
