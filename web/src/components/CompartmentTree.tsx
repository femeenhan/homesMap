'use client'

// 공용 인라인 폼·물건 행 모음(트리 컴포넌트는 StoragePane으로 대체됨)

import { useState } from 'react'
import type { DecItem } from '@/lib/types'
import { Icon } from './Icon'

type AddDraft = { name: string; memo: string; photoFile?: File }
const pad = (d: number) => ({ paddingLeft: d * 14 + 6 }) // TreeRow와 동일 들여쓰기(스펙 §12 16→14) — 행/자식 폼·아이템 정렬 일치

// 인라인 확인 삭제. 평소엔 🗑️(hover 시 노출), 누르면 삭제/취소 2단계. 방·수납장·칸·물건 공용.
export function DeleteBtn({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <span className="del-confirm">
        <button type="button" className="del-yes" onClick={onConfirm}>삭제</button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>취소</button>
      </span>
    )
  }
  return <button type="button" className="trow-del" title={title} onClick={() => setConfirming(true)}><Icon name="trash" size={15} /></button>
}

// 이름 하나 받는 인라인 폼(칸·수납장·방 추가 공용)
export function InlineInput({ depth, placeholder, onSubmit, onCancel }: {
  depth: number; placeholder: string; onSubmit: (name: string) => void; onCancel: () => void
}) {
  const [v, setV] = useState('')
  return (
    <form className="tadd-form" style={pad(depth)} onSubmit={(e) => { e.preventDefault(); const n = v.trim(); if (n) { onSubmit(n); setV('') } }}>
      <input autoFocus type="text" placeholder={placeholder} maxLength={20} value={v}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
      <button type="submit" disabled={!v.trim()}>추가</button>
      <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
    </form>
  )
}

// 물건 추가 인라인 폼(이름/메모/사진)
export function InlineItemForm({ depth, onSubmit, onCancel }: {
  depth: number; onSubmit: (d: AddDraft) => void | Promise<void>; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form className="tadd-form" style={pad(depth)}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || busy) return
        setBusy(true)
        try { await onSubmit({ name: name.trim(), memo: memo.trim(), photoFile: photo ?? undefined }) } finally { setBusy(false) }
      }}
    >
      <input autoFocus type="text" placeholder="물건 이름" maxLength={30} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
      <input type="text" placeholder="메모 (선택)" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
      <label className={`tadd-photo${photo ? ' has' : ''}`}>{photo ? <><Icon name="check" size={13} /> 사진</> : <><Icon name="camera" size={13} /> 사진</>}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      <button type="submit" disabled={!name.trim() || busy}>등록</button>
      <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
    </form>
  )
}

// 각 레벨 상단 '＋ 추가' 트리거 행(방·수납장 등 이름만 받는 곳)
export function AddRow({ depth, label, onClick }: { depth: number; label: string; onClick: () => void }) {
  return <button type="button" className="tadd-row" style={pad(depth)} onClick={onClick}>＋ {label}</button>
}

export function ItemRow({ item, photoUrl, depth, onDelete }: {
  item: DecItem; photoUrl?: string; depth: number; onDelete: (i: DecItem) => void
}) {
  return (
    <div className="titem" style={pad(depth)}>
      <span className="titem-thumb">
        {photoUrl
          // eslint-disable-next-line @next/next/no-img-element -- blob: objectURL
          ? <img src={photoUrl} alt="" />
          : <Icon name="box" size={13} />}
      </span>
      <span className="titem-name">{item.name}</span>
      {item.photo_path && !photoUrl && <Icon name="camera" size={12} className="titem-cam" />}
      {item.memo && <span className="titem-memo">{item.memo}</span>}
      <DeleteBtn title="물건 삭제" onConfirm={() => onDelete(item)} />
    </div>
  )
}
