'use client'

import { useState } from 'react'
import type { Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { childCompartments } from '@/lib/compartments'

// 인라인 확인 삭제(연쇄삭제 방지턱). 🗑️ → "삭제/취소" 2단계. 방·수납장·칸 공용.
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
  return <button type="button" className="cmp-del" title={title} onClick={() => setConfirming(true)}>🗑️</button>
}

type AddDraft = { name: string; memo: string; photoFile?: File }

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
  photoUrls?: Record<string, string> // 있으면 썸네일 표시(도식화 드로어), 없으면 이모지(목록 뷰)
}

// 수납장 하나의 칸 트리 + 물건. 목록 뷰(HomeTree)와 도식화 드로어(DetailPanel)가 공유.
export function CompartmentTree({ storage, items, members, photoUrls, ...h }: Props) {
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
    <div className="cmp-tree">
      {roots.map((c) => (
        <CompartmentNode
          key={c.id}
          compartment={c}
          compartments={compartments}
          items={items}
          members={members}
          photoUrls={photoUrls}
          depth={0}
          onAddCompartment={addCompartment}
          onRename={renameCompartment}
          onDeleteCompartment={h.onDeleteCompartment}
          onAddItem={h.onAddItem}
          onDeleteItem={h.onDeleteItem}
        />
      ))}
      {directItems.map((it) => (
        <ItemRow key={it.id} item={it} members={members} photoUrl={photoUrls?.[it.id]} depth={0} onDelete={h.onDeleteItem} />
      ))}
      <NodeAddBar
        depth={0}
        onAddCompartment={(name) => addCompartment(null, name)}
        onAddItem={(draft) => h.onAddItem(null, draft)}
      />
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
  const [name, setName] = useState(p.compartment.name)
  const children = childCompartments(p.compartments, p.compartment.id)
  const myItems = p.items.filter((it) => it.compartment_id === p.compartment.id)

  return (
    <div className="cmp-node">
      <div className="cmp-row" style={{ paddingLeft: p.depth * 14 }}>
        <button type="button" className="cmp-twist" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? '접기' : '펼치기'}>
          {expanded ? '▾' : '▸'}
        </button>
        <input
          className="cmp-name"
          type="text"
          aria-label="칸 이름"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== p.compartment.name) p.onRename(p.compartment.id, n); else setName(p.compartment.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <span className="cmp-count">{myItems.length}{children.length ? `·${children.length}칸` : ''}</span>
        <DeleteBtn title="칸 삭제(하위 칸·물건 포함)" onConfirm={() => p.onDeleteCompartment(p.compartment.id)} />
      </div>
      {expanded && (
        <>
          {children.map((c) => (
            <CompartmentNode {...p} key={c.id} compartment={c} depth={p.depth + 1} />
          ))}
          {myItems.map((it) => (
            <ItemRow key={it.id} item={it} members={p.members} photoUrl={p.photoUrls?.[it.id]} depth={p.depth + 1} onDelete={p.onDeleteItem} />
          ))}
          <NodeAddBar
            depth={p.depth + 1}
            onAddCompartment={(n) => p.onAddCompartment(p.compartment.id, n)}
            onAddItem={(draft) => p.onAddItem(p.compartment.id, draft)}
          />
        </>
      )}
    </div>
  )
}

function ItemRow({ item, members, photoUrl, depth, onDelete }: {
  item: DecItem; members: FamilyMember[]; photoUrl?: string; depth: number; onDelete: (item: DecItem) => void
}) {
  const by = members.find((m) => m.user_id === item.created_by)
  return (
    <div className="tree-item" style={{ paddingLeft: depth * 14 + 20 }}>
      <span className="tree-item-thumb">
        {photoUrl
          // eslint-disable-next-line @next/next/no-img-element -- blob: objectURL
          ? <img src={photoUrl} alt="" />
          : (item.emoji || '📦')}
      </span>
      <span className="tree-item-body">
        <span className="tree-item-name">{item.name}{item.photo_path && !photoUrl ? ' 📷' : ''}</span>
        {item.memo && <span className="tree-item-memo">{item.memo}</span>}
        {by && <span className="tree-item-by">{by.emoji} {by.display_name}</span>}
      </span>
      <button type="button" className="item-del" title="삭제" onClick={() => onDelete(item)}>🗑️</button>
    </div>
  )
}

function NodeAddBar({ depth, onAddCompartment, onAddItem }: {
  depth: number
  onAddCompartment: (name: string) => void
  onAddItem: (draft: AddDraft) => void | Promise<void>
}) {
  const [mode, setMode] = useState<'none' | 'cmp' | 'item'>('none')
  const [cmpName, setCmpName] = useState('')
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() { setMode('none'); setCmpName(''); setName(''); setMemo(''); setPhotoFile(null) }

  if (mode === 'none') {
    return (
      <div className="node-add" style={{ paddingLeft: depth * 14 + 20 }}>
        <button type="button" onClick={() => setMode('cmp')}>＋ 칸</button>
        <button type="button" onClick={() => setMode('item')}>＋ 물건</button>
      </div>
    )
  }

  if (mode === 'cmp') {
    return (
      <form
        className="node-add-form"
        style={{ paddingLeft: depth * 14 + 20 }}
        onSubmit={(e) => { e.preventDefault(); const n = cmpName.trim(); if (n) onAddCompartment(n); reset() }}
      >
        <input autoFocus type="text" placeholder="새 칸 이름" maxLength={20} value={cmpName} onChange={(e) => setCmpName(e.target.value)} />
        <button type="submit" disabled={!cmpName.trim()}>추가</button>
        <button type="button" className="btn-ghost" onClick={reset}>취소</button>
      </form>
    )
  }

  return (
    <form
      className="node-add-form item"
      style={{ paddingLeft: depth * 14 + 20 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || submitting) return
        setSubmitting(true)
        try { await onAddItem({ name: name.trim(), memo: memo.trim(), photoFile: photoFile ?? undefined }) } finally { reset() }
      }}
    >
      <input autoFocus type="text" placeholder="물건 이름" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="text" placeholder="메모 (선택)" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
      <label className={`node-photo${photoFile ? ' has' : ''}`}>
        {photoFile ? '✅ 사진' : '📷 사진'}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
      </label>
      <button type="submit" disabled={!name.trim() || submitting}>등록</button>
      <button type="button" className="btn-ghost" onClick={reset}>취소</button>
    </form>
  )
}
