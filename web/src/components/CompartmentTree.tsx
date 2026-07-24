'use client'

import { useRef, useState } from 'react'
import type { Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { childCompartments } from '@/lib/compartments'
import { TreeRow } from './TreeRow'
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

// 수납장/칸 하위 추가: 칸/물건 토글 + 최소입력(이름) + 물건일 때 메모·사진 접힘
export function InlineAddForm({ depth, onAddCompartment, onAddItem, onCancel }: {
  depth: number
  onAddCompartment: (name: string) => void
  onAddItem: (draft: AddDraft) => void | Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<'cmp' | 'item'>('item')
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [details, setDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  // 토글 탭 = 입력 밖 터치라 입력이 블러됨(키보드 내려감) → 같은 제스처 안에서 재포커스
  const pickKind = (k: 'cmp' | 'item') => { setKind(k); nameRef.current?.focus() }
  return (
    <form className="tadd-form taddx" style={pad(depth)}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n || busy) return
        if (kind === 'cmp') { onAddCompartment(n); return }
        setBusy(true)
        try { await onAddItem({ name: n, memo: memo.trim(), photoFile: photo ?? undefined }) } finally { setBusy(false) }
      }}
    >
      <div className="taddx-kind">
        <button type="button" className={kind === 'cmp' ? 'on' : ''} aria-pressed={kind === 'cmp'} onClick={() => pickKind('cmp')}>칸 추가</button>
        <button type="button" className={kind === 'item' ? 'on' : ''} aria-pressed={kind === 'item'} onClick={() => pickKind('item')}>물건 추가</button>
      </div>
      <div className="taddx-row">
        <input ref={nameRef} autoFocus type="text" placeholder={kind === 'cmp' ? '칸 이름' : '물건 이름'} maxLength={kind === 'cmp' ? 20 : 30}
          value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
        <button type="submit" disabled={!name.trim() || busy}>추가</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
      </div>
      {kind === 'item' && (details ? (
        <div className="taddx-row">
          <input type="text" placeholder="메모 (선택)" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
          <label className={`tadd-photo${photo ? ' has' : ''}`}>{photo ? <><Icon name="check" size={13} /> 사진</> : <><Icon name="camera" size={13} /> 사진</>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      ) : (
        <button type="button" className="taddx-more" onClick={() => setDetails(true)}>＋ 메모·사진</button>
      ))}
    </form>
  )
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

type Handlers = {
  onCompartmentsChange: (compartments: Compartment[]) => void
  onDeleteCompartment: (id: string) => void
  onAddItem: (compartmentId: string | null, draft: AddDraft) => void | Promise<void>
  onDeleteItem: (item: DecItem) => void
}
type Props = Handlers & {
  storage: Storage
  items: DecItem[]
  members: FamilyMember[]
  photoUrls?: Record<string, string>
  baseDepth?: number // 렌더 시작 들여쓰기(목록=2, 드로어=0)
}

// 수납장 하나의 칸 트리 + 물건(직속 포함). 목록/드로어 공유. 수납장 자체 행/추가는 호출측이 담당.
export function CompartmentTree({ storage, items, members, photoUrls, baseDepth = 0, ...h }: Props) {
  const compartments = storage.compartments ?? []
  const validIds = new Set(compartments.map((c) => c.id))
  const directItems = items.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const roots = childCompartments(compartments, null)

  function addCompartment(parentId: string | null, name: string) {
    h.onCompartmentsChange([...compartments, { id: crypto.randomUUID(), name, parent_id: parentId }])
  }
  function renameCompartment(id: string, name: string) {
    h.onCompartmentsChange(compartments.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  return (
    <div className="cmp-content">
      {roots.map((c) => (
        <CompartmentNode
          key={c.id} compartment={c} compartments={compartments} items={items} members={members}
          photoUrls={photoUrls} depth={baseDepth}
          onAddCompartment={addCompartment} onRename={renameCompartment}
          onDeleteCompartment={h.onDeleteCompartment} onAddItem={h.onAddItem} onDeleteItem={h.onDeleteItem}
        />
      ))}
      {directItems.map((it) => (
        <ItemRow key={it.id} item={it} photoUrl={photoUrls?.[it.id]} depth={baseDepth} onDelete={h.onDeleteItem} />
      ))}
    </div>
  )
}

type NodeProps = {
  compartment: Compartment
  compartments: Compartment[]
  items: DecItem[]
  members: FamilyMember[]
  photoUrls?: Record<string, string>
  depth: number
  onAddCompartment: (parentId: string | null, name: string) => void
  onRename: (id: string, name: string) => void
  onDeleteCompartment: (id: string) => void
  onAddItem: (compartmentId: string | null, draft: AddDraft) => void | Promise<void>
  onDeleteItem: (item: DecItem) => void
}

function CompartmentNode(p: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const children = childCompartments(p.compartments, p.compartment.id)
  const myItems = p.items.filter((it) => it.compartment_id === p.compartment.id)
  const hasKids = children.length > 0 || myItems.length > 0

  return (
    <div className="tnode">
      <TreeRow
        depth={p.depth} icon="folder" name={p.compartment.name} count={myItems.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRename(p.compartment.id, n)}
        deleteTitle="칸 삭제" deleteMessage={`'${p.compartment.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteCompartment(p.compartment.id)}
      />
      {expanded && (
        <>
          {adding
            ? <InlineAddForm depth={p.depth + 1}
                onAddCompartment={(n) => { p.onAddCompartment(p.compartment.id, n); setAdding(false) }}
                onAddItem={async (d) => { await p.onAddItem(p.compartment.id, d); setAdding(false) }}
                onCancel={() => setAdding(false)} />
            : <AddRow depth={p.depth + 1} label="추가" onClick={() => setAdding(true)} />}
          {children.map((c) => <CompartmentNode {...p} key={c.id} compartment={c} depth={p.depth + 1} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={p.depth + 1} onDelete={p.onDeleteItem} />)}
        </>
      )}
    </div>
  )
}
