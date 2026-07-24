'use client'

import { useState } from 'react'
import { Modal } from './Modal'
import { Icon, type IconName } from './Icon'

type Props = {
  depth: number
  icon: IconName
  name: string
  count: number
  expandable: boolean
  expanded: boolean
  onToggle: () => void
  onRename: (name: string) => void
  deleteTitle: string
  deleteMessage: string
  onDelete: () => void
  levelClass?: string
  chevron?: boolean
  onAdd?: () => void // 행 인라인 ＋(이 레벨의 유일한 추가 동작이 있을 때 — 예: 방→수납장)
}

const pad = (d: number) => ({ paddingLeft: d * 14 + 6 })

// 방/수납장/칸 공용 행. 탭=펼치기, 이름수정은 ⋯메뉴로만(탭으로 편집 안 됨). 추가는 onAdd(행 인라인 ＋) 또는 화면 단위 AddRow가 담당.
export function TreeRow({
  depth, icon, name, count, expandable, expanded, onToggle,
  onRename, deleteTitle, deleteMessage, onDelete, levelClass = '', onAdd, chevron,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  function startEdit() { setDraft(name); setEditing(true) }
  function commitEdit() {
    const n = draft.trim()
    if (n && n !== name) onRename(n)
    setEditing(false)
  }

  return (
    <div className={`trow ${levelClass}`.trim()} style={pad(depth)} onClick={editing ? undefined : onToggle}>
      {expandable ? (
        <button type="button" className={`trow-caret${expanded ? ' open' : ''}`} aria-label={expanded ? '접기' : '펼치기'} aria-expanded={expanded}
          onClick={(e) => { e.stopPropagation(); onToggle() }}><Icon name="chevron-right" size={12} /></button>
      ) : (
        <span className="trow-caret" aria-hidden="true" />
      )}
      <span className="trow-ico"><Icon name={icon} size={16} /></span>
      {editing ? (
        <input
          className="trow-name-input" type="text" autoFocus aria-label="이름 수정"
          value={draft} maxLength={20}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="trow-name">{name}</span>
      )}
      {!editing && count > 0 && <span className="trow-meta">{count}</span>}
      {!editing && (
        <span className="trow-actions" onClick={(e) => e.stopPropagation()}>
          {onAdd && (
            <button type="button" className="trow-iconbtn" aria-label="추가" onClick={onAdd}>
              <Icon name="plus" size={16} />
            </button>
          )}
          <RowMenu onEditName={startEdit} onDelete={onDelete} deleteTitle={deleteTitle} deleteMessage={deleteMessage} />
        </span>
      )}
      {!editing && chevron && <Icon name="chevron-right" size={16} className="trow-chev" />}
    </div>
  )
}

// ⋯ 메뉴: 이름 수정 / 삭제. 시트(.sheet) 재사용, 삭제는 Modal 확인.
export function RowMenu({ onEditName, onDelete, deleteTitle, deleteMessage }: {
  onEditName: () => void; onDelete: () => void; deleteTitle: string; deleteMessage: string
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button type="button" className="trow-iconbtn" aria-label="메뉴" onClick={() => setOpen(true)}><Icon name="more-horizontal" size={16} /></button>
      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet rowmenu" onClick={(e) => e.stopPropagation()}>
            <div className="rowmenu-group">
              <button type="button" className="rowmenu-item" onClick={() => { setOpen(false); onEditName() }}>이름 수정</button>
              <button type="button" className="rowmenu-item danger" onClick={() => { setOpen(false); setConfirming(true) }}>삭제</button>
            </div>
            <button type="button" className="rowmenu-item cancel" onClick={() => setOpen(false)}>취소</button>
          </div>
        </div>
      )}
      {confirming && (
        <Modal title={deleteTitle} message={deleteMessage} okText="삭제"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete() }} />
      )}
    </>
  )
}

// 상단 바: ‹ 뒤로 + 현재 이름(⋯로 이름수정·삭제)
export function DrillHeader({ name, onBack, onRename, onDelete, deleteTitle, deleteMessage }: {
  name: string; onBack: () => void; onRename: (n: string) => void; onDelete: () => void
  deleteTitle: string; deleteMessage: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  return (
    <div className="drill-head">
      <button type="button" className="drill-back" aria-label="뒤로" onClick={onBack}>
        <Icon name="chevron-left" size={20} />
      </button>
      {editing ? (
        <input className="trow-name-input" type="text" autoFocus aria-label="이름 수정"
          value={draft} maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = draft.trim(); if (n && n !== name) onRename(n); setEditing(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="drill-title">{name}</span>
      )}
      {!editing && (
        <RowMenu onEditName={() => { setDraft(name); setEditing(true) }} onDelete={onDelete}
          deleteTitle={deleteTitle} deleteMessage={deleteMessage} />
      )}
    </div>
  )
}
