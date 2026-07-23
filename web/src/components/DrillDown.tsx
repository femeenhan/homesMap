'use client'

import { useState } from 'react'
import type { Compartment, Storage } from '@/lib/types'
import { resolvePath, type PathSeg } from '@/lib/drillPath'
import { childCompartments } from '@/lib/compartments'
import { AddRow, InlineAddForm, InlineInput, ItemRow } from './CompartmentTree'
import { TreeRow, RowMenu } from './TreeRow'
import { Icon } from './Icon'
import type { HomeTreeProps } from './HomeTree'

// 모바일 드릴다운: 한 화면 = 한 레벨. 방 목록 → 방 → 수납장 → 칸(무한중첩) → 물건.
// 경로는 state, 렌더는 resolvePath가 검증한 유효 접두사만 사용 — 동기화로 노드가 사라져도 조상 화면으로 복귀.
export function DrillDown(p: HomeTreeProps) {
  const [path, setPath] = useState<PathSeg[]>([])
  const valid = resolvePath(path, p.rooms, p.storages)
  const cur = valid[valid.length - 1]

  const toSegs = () => valid.map((v) => ({ kind: v.kind, id: v.id }) as PathSeg)
  const enter = (seg: PathSeg) => setPath([...toSegs(), seg])
  const back = () => setPath(toSegs().slice(0, -1))

  if (!cur) return <RootScreen p={p} onEnter={enter} />
  if (cur.kind === 'room') return <RoomScreen p={p} room={cur.room} onEnter={enter} onBack={back} />
  return (
    <ContainerScreen p={p} storage={cur.storage} parent={cur.kind === 'cmp' ? cur.cmp : null}
      onEnter={enter} onBack={back} />
  )
}

// 상단 바: ‹ 뒤로 + 현재 이름(⋯로 이름수정·삭제)
function DrillHeader({ name, onBack, onRename, onDelete, deleteTitle, deleteMessage }: {
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

function RootScreen({ p, onEnter }: { p: HomeTreeProps; onEnter: (s: PathSeg) => void }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="home-tree">
      {adding
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => (
        <TreeRow key={room.id} depth={0} levelClass="lv-drill lv-room" icon="folder" name={room.name}
          count={p.storages.filter((s) => s.room_id === room.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'room', id: room.id })}
          onRename={(n) => p.onRenameRoom(room, n)}
          deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteRoom(room)}
        />
      ))}
    </div>
  )
}

function RoomScreen({ p, room, onEnter, onBack }: {
  p: HomeTreeProps; room: HomeTreeProps['rooms'][number]; onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="home-tree">
      <DrillHeader name={room.name} onBack={onBack}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)} />
      {adding
        ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      {storages.length === 0 && <div className="tree-empty">아직 수납장이 없어요.</div>}
      {storages.map((s) => (
        <TreeRow key={s.id} depth={0} levelClass="lv-drill lv-storage" icon="folder" name={s.name}
          count={p.decItems.filter((it) => it.storage_id === s.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'storage', id: s.id })}
          onRename={(n) => p.onRenameStorage(s, n)}
          deleteTitle="수납장 삭제" deleteMessage={`'${s.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteStorage(s)}
        />
      ))}
    </div>
  )
}

// 수납장 직속(parent=null) 또는 칸 내부(parent=칸) 화면 — 하위 칸 + 물건
function ContainerScreen({ p, storage, parent, onEnter, onBack }: {
  p: HomeTreeProps; storage: Storage; parent: Compartment | null
  onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const children = childCompartments(compartments, parent?.id ?? null)
  const validIds = new Set(compartments.map((c) => c.id))
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = parent
    ? allItems.filter((it) => it.compartment_id === parent.id)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const head = parent
    ? {
        name: parent.name,
        onRename: (n: string) => p.onCompartmentsChange(storage, compartments.map((c) => (c.id === parent.id ? { ...c, name: n } : c))),
        deleteTitle: '칸 삭제', deleteMessage: `'${parent.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteCompartment(storage, parent.id),
      }
    : {
        name: storage.name,
        onRename: (n: string) => p.onRenameStorage(storage, n),
        deleteTitle: '수납장 삭제', deleteMessage: `'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteStorage(storage),
      }
  return (
    <div className="home-tree">
      <DrillHeader onBack={onBack} {...head} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: parent?.id ?? null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, parent?.id ?? null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      {children.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
      {children.map((c) => (
        <TreeRow key={c.id} depth={0} levelClass="lv-drill" icon="folder" name={c.name}
          count={allItems.filter((it) => it.compartment_id === c.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'cmp', id: c.id })}
          onRename={(n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === c.id ? { ...x, name: n } : x)))}
          deleteTitle="칸 삭제" deleteMessage={`'${c.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteCompartment(storage, c.id)}
        />
      ))}
      {items.map((it) => <ItemRow key={it.id} item={it} depth={0} onDelete={p.onDeleteItem} />)}
    </div>
  )
}
