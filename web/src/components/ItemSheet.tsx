'use client'

import { useState } from 'react'
import type { DecItem, Room, Storage } from '@/lib/types'
import { Icon } from './Icon'
import { Modal } from './Modal'

// 물건 상세 시트: 사진 크게 + 이름·메모 blur 저장 + 사진 변경/삭제 + 위치 브레드크럼 + 삭제
export function ItemSheet({ item, photoUrl, rooms, storages, onUpdate, onDelete, onClose }: {
  item: DecItem; photoUrl?: string; rooms: Room[]; storages: Storage[]
  onUpdate: (patch: { name?: string; memo?: string; photoFile?: File | null }) => void | Promise<void>
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(item.name)
  const [memo, setMemo] = useState(item.memo)
  const [confirming, setConfirming] = useState(false)

  // 위치 브레드크럼: 방 › 수납장 › 칸 체인(칸은 parent 역추적)
  const storage = storages.find((s) => s.id === item.storage_id)
  const room = storage ? rooms.find((r) => r.id === storage.room_id) : undefined
  const path: string[] = []
  if (room) path.push(room.name)
  if (storage) {
    path.push(storage.name)
    const comps = storage.compartments ?? []
    const chain: string[] = []
    let cur = comps.find((c) => c.id === item.compartment_id)
    while (cur) {
      chain.unshift(cur.name)
      const pid = cur.parent_id
      cur = pid ? comps.find((c) => c.id === pid) : undefined
    }
    path.push(...chain)
  }

  return (
    <>
      <div className="sheet-wrap" onClick={onClose}>
        <div className="sheet item-sheet" onClick={(e) => e.stopPropagation()}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: objectURL
            <img className="is-photo" src={photoUrl} alt={item.name} />
          ) : (
            <div className="is-photo-empty"><Icon name="camera" size={22} /> 사진 없음</div>
          )}
          <div className="is-body">
            <div className="is-photo-actions">
              <label className="is-btn">
                {photoUrl ? '사진 변경' : '사진 추가'}
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onUpdate({ photoFile: f }) }} />
              </label>
              {photoUrl && <button type="button" className="is-btn" onClick={() => void onUpdate({ photoFile: null })}>사진 삭제</button>}
            </div>
            <label className="is-field">이름
              <input type="text" value={name} maxLength={30}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { const n = name.trim(); if (n && n !== item.name) void onUpdate({ name: n }); else setName(item.name) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </label>
            <label className="is-field">메모
              <input type="text" value={memo} maxLength={40} placeholder="메모 (선택)"
                onChange={(e) => setMemo(e.target.value)}
                onBlur={() => { const m = memo.trim(); if (m !== item.memo) void onUpdate({ memo: m }) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </label>
            {path.length > 0 && <div className="is-loc">{path.join(' › ')}</div>}
            <button type="button" className="is-del" onClick={() => setConfirming(true)}>물건 삭제</button>
          </div>
          <button type="button" className="rowmenu-item cancel is-close" onClick={onClose}>닫기</button>
        </div>
      </div>
      {confirming && (
        <Modal title="물건 삭제" message={`'${item.name}'을(를) 삭제하시겠습니까?`} okText="삭제"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete() }} />
      )}
    </>
  )
}
