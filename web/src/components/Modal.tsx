'use client'

import { useEffect, useRef, useState } from 'react'
import { ROOM_COLORS } from '@/lib/types'

type Props = {
  title: string
  message?: string // 확인 전용 모달(예: 삭제 확인) 본문
  nameLabel?: string // 있으면 이름 입력 필드 렌더 + 필수 입력 처리
  namePlaceholder?: string
  defaultName?: string
  showColorPicker?: boolean
  okText?: string
  onCancel: () => void
  onConfirm: (result: { name: string; colorIndex: number }) => void
}

/** 프로토타입 showModal 이식. 방 만들기(이름+색), 수납장 놓기(이름), 방 삭제 확인(메시지만) 3가지 용도를 겸함. */
export function Modal({
  title,
  message,
  nameLabel,
  namePlaceholder,
  defaultName = '',
  showColorPicker,
  okText = '확인',
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState(defaultName)
  const [colorIndex, setColorIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const canConfirm = nameLabel === undefined || name.trim().length > 0

  function confirm() {
    if (!canConfirm) return
    onConfirm({ name: name.trim(), colorIndex })
  }

  return (
    <div className="modal-wrap open">
      <div className="modal">
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {nameLabel !== undefined && (
          <div className="field">
            <label>{nameLabel}</label>
            <input
              ref={inputRef}
              type="text"
              placeholder={namePlaceholder}
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm()
              }}
            />
          </div>
        )}
        {showColorPicker && (
          <div className="field">
            <label>색상</label>
            <div className="color-row">
              {ROOM_COLORS.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  className={`color-dot${i === colorIndex ? ' active' : ''}`}
                  style={{ background: c.border }}
                  title={c.name}
                  onClick={() => setColorIndex(i)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="btns">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn-ok" onClick={confirm} disabled={!canConfirm}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  )
}
