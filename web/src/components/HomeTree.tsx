'use client'

import { useState } from 'react'
import type { Room, Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { CompartmentTree, DeleteBtn, InlineInput, InlineItemForm } from './CompartmentTree'
import { TreeRow } from './TreeRow'

type AddDraft = { name: string; memo: string; photoFile?: File }
const pad = (d: number) => ({ paddingLeft: d * 16 + 6 })

type Props = {
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  members: FamilyMember[]
  onAddRoom: (name: string) => void
  onRenameRoom: (room: Room, name: string) => void
  onDeleteRoom: (room: Room) => void
  onAddStorage: (room: Room, name: string) => void
  onRenameStorage: (storage: Storage, name: string) => void
  onDeleteStorage: (storage: Storage) => void
  onCompartmentsChange: (storage: Storage, compartments: Compartment[]) => void
  onDeleteCompartment: (storage: Storage, id: string) => void
  onAddItem: (storage: Storage, compartmentId: string | null, draft: AddDraft) => void | Promise<void>
  onDeleteItem: (item: DecItem) => void
}

// 집 전체 아코디언: 방 → 수납장 → 칸(무한중첩) → 물건. 카테고리화의 본체(목록 뷰).
export function HomeTree(p: Props) {
  const [addingRoom, setAddingRoom] = useState(false)
  return (
    <div className="home-tree">
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 아래 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => <TreeRoom key={room.id} room={room} {...p} />)}
      {addingRoom ? (
        <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAddingRoom(false) }} onCancel={() => setAddingRoom(false)} />
      ) : (
        <div className="tree-add-root"><button type="button" onClick={() => setAddingRoom(true)}>＋ 방 추가</button></div>
      )}
    </div>
  )
}

function TreeRoom({ room, ...p }: { room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="tnode">
      <TreeRow
        depth={0} levelClass="lv-room" icon="🏠" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameRoom(room, n)}
        addOptions={[{ label: '＋ 수납장', onSelect: () => { setExpanded(true); setAdding(true) } }]}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)}
      />
      {expanded && (
        <>
          {adding && <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
    </div>
  )
}

function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(storage.name)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const compartments = storage.compartments ?? []
  const hasKids = compartments.length > 0 || items.length > 0
  const toggle = () => setExpanded((e) => !e)
  const startAdd = (m: 'cmp' | 'item') => { setExpanded(true); setAdding(m) }
  return (
    <div className="tnode">
      <div className="trow lv-storage" style={pad(1)}>
        <button type="button" className="trow-caret" onClick={toggle}>{hasKids ? (expanded ? '▼' : '▶') : ''}</button>
        <span className="trow-ico" onClick={toggle}>📦</span>
        <input className="trow-name" type="text" aria-label="수납장 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== storage.name) p.onRenameStorage(storage, n); else setName(storage.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        {items.length > 0 && <span className="trow-meta">{items.length}</span>}
        <span className="trow-actions">
          <button type="button" className="trow-act" onClick={() => startAdd('cmp')}>＋칸</button>
          <button type="button" className="trow-act" onClick={() => startAdd('item')}>＋물건</button>
          <DeleteBtn title="수납장 삭제(물건 포함)" onConfirm={() => p.onDeleteStorage(storage)} />
        </span>
      </div>
      {expanded && (
        <>
          {adding === 'cmp' && <InlineInput depth={2} placeholder="새 칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding('none') }} onCancel={() => setAdding('none')} />}
          {adding === 'item' && <InlineItemForm depth={2} onSubmit={async (d) => { await p.onAddItem(storage, null, d); setAdding('none') }} onCancel={() => setAdding('none')} />}
          <CompartmentTree
            storage={storage} items={items} members={p.members} baseDepth={2}
            onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
            onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
            onAddItem={(cid, d) => p.onAddItem(storage, cid, d)}
            onDeleteItem={p.onDeleteItem}
          />
        </>
      )}
    </div>
  )
}
