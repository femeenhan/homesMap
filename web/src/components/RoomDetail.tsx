'use client'

import { useState } from 'react'
import type { Room } from '@/lib/types'
import { ROOM_COLORS } from '@/lib/types'
import { Modal } from './Modal'

type Props = {
  room: Room
  storageCount: number
  onClose: () => void
  onRename: (name: string) => void
  onColorChange: (colorIndex: number) => void
  onAddStorage: (room: Room) => void
  onDelete: (room: Room) => void
}

// 방 편집 드로어(수납장 물건 드로어와 같은 오른쪽 오버레이 표면). 이름/색/수납장 추가/삭제.
export function RoomDetail({ room, storageCount, onClose, onRename, onColorChange, onAddStorage, onDelete }: Props) {
  // page가 key={room.id}로 렌더하므로 다른 방 선택 시 리마운트돼 초기값만으로 반영된다(DetailPanel과 동일).
  const [name, setName] = useState(room.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function commitName() {
    const n = name.trim()
    if (n && n !== room.name) onRename(n)
    else setName(room.name)
  }

  return (
    <aside className="detail-panel open">
      <div className="dp-head">
        <button type="button" className="dp-close" onClick={onClose}>✕</button>
        <div className="dp-icon">🏷️</div>
        <input
          className="dp-name-input"
          type="text"
          aria-label="방 이름"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <div className="dp-loc">🏠 방 · 수납장 {storageCount}개</div>
      </div>

      <div className="rd-body">
        <div className="rd-field">
          <label>색상</label>
          <div className="color-row">
            {ROOM_COLORS.map((c, i) => (
              <button
                key={c.name}
                type="button"
                className={`color-dot${i === room.color_index ? ' active' : ''}`}
                style={{ background: c.border }}
                title={c.name}
                onClick={() => onColorChange(i)}
              />
            ))}
          </div>
        </div>
        <button type="button" className="add-btn" onClick={() => onAddStorage(room)}>
          📦 이 방에 수납장 추가
        </button>
        <button type="button" className="dp-del" onClick={() => setConfirmDelete(true)}>
          이 방 삭제
        </button>
      </div>

      {confirmDelete && (
        <Modal
          title="방 삭제"
          message={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
          okText="삭제"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete(room) }}
        />
      )}
    </aside>
  )
}
