'use client'

import { useState } from 'react'
import type { Compartment, Storage } from '@/lib/types'
import { childCompartments } from '@/lib/compartments'
import { TreeRow, DrillHeader } from './TreeRow'
import { AddRow, InlineInput, InlineItemForm, ItemRow } from './CompartmentTree'
import { Icon } from './Icon'
import type { HomeTreeProps } from './HomeTree'

// 수납장 내용 2-pane: 좌=칸 트리 / 우=선택 칸 직속 물건. 목록·도식화 공용(스펙 §1).
export function StoragePane({ p, storage, flash, onBack }: {
  p: HomeTreeProps; storage: Storage; flash?: boolean; onBack: () => void
}) {
  const [selCmpId, setSelCmpId] = useState<string | null>(null) // null = 수납장 루트
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const compartments = storage.compartments ?? []
  const validIds = new Set(compartments.map((c) => c.id))
  const sel = selCmpId && validIds.has(selCmpId) ? selCmpId : null // 선택 칸 소실 시 루트 복귀
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = sel
    ? allItems.filter((it) => it.compartment_id === sel)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const directCount = (cmpId: string | null) => (
    cmpId
      ? allItems.filter((it) => it.compartment_id === cmpId).length
      : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id)).length
  )
  const selName = sel ? (compartments.find((c) => c.id === sel)?.name ?? storage.name) : storage.name
  return (
    <div className={`gmap-page${flash ? ' gm-focus' : ''}`}>
      <DrillHeader name={storage.name} onBack={onBack}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)} />
      <div className="sp-panes">
        <div className="sp-left">
          {addingCmp
            ? <InlineInput depth={0} placeholder="칸 이름" onSubmit={(n) => {
                p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: sel }])
                setAddingCmp(false)
              }} onCancel={() => setAddingCmp(false)} />
            : <AddRow depth={0} label="칸" onClick={() => setAddingCmp(true)} />}
          <button type="button" className={`trow sp-root${sel === null ? ' sel' : ''}`} onClick={() => setSelCmpId(null)}>
            <span className="trow-ico"><Icon name="folder" size={16} /></span>
            <span className="trow-name">{storage.name}</span>
            {directCount(null) > 0 && <span className="trow-meta">{directCount(null)}</span>}
          </button>
          {childCompartments(compartments, null).map((c) => (
            <SpCmpNode key={c.id} cmp={c} depth={1} compartments={compartments}
              sel={sel} onSelect={setSelCmpId} directCount={directCount}
              onRename={(id, n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === id ? { ...x, name: n } : x)))}
              onDelete={(id) => p.onDeleteCompartment(storage, id)} />
          ))}
        </div>
        <div className="sp-right">
          <div className="sp-right-head">{selName}</div>
          {addingItem
            ? <InlineItemForm depth={0} onSubmit={async (d) => { await p.onAddItem(storage, sel, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />
            : <AddRow depth={0} label="물건" onClick={() => setAddingItem(true)} />}
          <div className="sp-items">
            {items.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={0} onDelete={p.onDeleteItem} />)}
            {items.length === 0 && <div className="tree-empty">아직 물건이 없어요</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// 좌측 칸 트리 노드: 탭=선택+펼침, ⋯=이름수정/삭제(TreeRow 재사용)
function SpCmpNode({ cmp, depth, compartments, sel, onSelect, directCount, onRename, onDelete }: {
  cmp: Compartment; depth: number; compartments: Compartment[]
  sel: string | null; onSelect: (id: string) => void; directCount: (id: string | null) => number
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const children = childCompartments(compartments, cmp.id)
  return (
    <div className="tnode">
      <TreeRow depth={depth - 1} levelClass={sel === cmp.id ? 'sel' : ''} icon="folder" name={cmp.name}
        count={directCount(cmp.id)}
        expandable={children.length > 0} expanded={expanded}
        onToggle={() => { onSelect(cmp.id); setExpanded((e) => !e) }}
        onRename={(n) => onRename(cmp.id, n)}
        deleteTitle="칸 삭제" deleteMessage={`'${cmp.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => onDelete(cmp.id)}
      />
      {expanded && children.map((c) => (
        <SpCmpNode key={c.id} cmp={c} depth={depth + 1} compartments={compartments}
          sel={sel} onSelect={onSelect} directCount={directCount} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  )
}
