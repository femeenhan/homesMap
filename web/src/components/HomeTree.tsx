'use client'

import { useState } from 'react'
import type { Room, Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { CompartmentTree, DeleteBtn } from './CompartmentTree'

type AddDraft = { name: string; memo: string; photoFile?: File }

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
  return (
    <div className="home-tree">
      {p.rooms.length === 0 && (
        <div className="tree-empty">아직 방이 없어요. 아래에서 첫 방을 추가해보세요.</div>
      )}
      {p.rooms.map((room) => (
        <TreeRoom key={room.id} room={room} {...p} />
      ))}
      <InlineNameAdd label="＋ 방 추가" placeholder="방 이름 (예: 안방, 거실)" onAdd={p.onAddRoom} depth={0} />
    </div>
  )
}

function TreeRoom({ room, ...p }: { room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(room.name)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="tree-room">
      <div className="tree-row room">
        <button type="button" className="cmp-twist" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? '접기' : '펼치기'}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className="tree-emoji">🏠</span>
        <input
          className="tree-name" type="text" aria-label="방 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== room.name) p.onRenameRoom(room, n); else setName(room.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <span className="cmp-count">{storages.length}칸</span>
        <DeleteBtn title="방 삭제(안의 수납장·물건 포함)" onConfirm={() => p.onDeleteRoom(room)} />
      </div>
      {expanded && (
        <>
          {storages.map((storage) => (
            <TreeStorage key={storage.id} storage={storage} room={room} {...p} />
          ))}
          <InlineNameAdd label="＋ 수납장 추가" placeholder="수납장 이름 (예: 서랍장1)" onAdd={(n) => p.onAddStorage(room, n)} depth={1} />
        </>
      )}
    </div>
  )
}

function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState(storage.name)
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  return (
    <div className="tree-storage">
      <div className="tree-row storage" style={{ paddingLeft: 14 }}>
        <button type="button" className="cmp-twist" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? '접기' : '펼치기'}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className="tree-emoji">📦</span>
        <input
          className="tree-name" type="text" aria-label="수납장 이름" value={name} maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== storage.name) p.onRenameStorage(storage, n); else setName(storage.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <span className="cmp-count">{items.length}</span>
        <DeleteBtn title="수납장 삭제(안의 물건 포함)" onConfirm={() => p.onDeleteStorage(storage)} />
      </div>
      {expanded && (
        <div style={{ paddingLeft: 14 }}>
          <CompartmentTree
            storage={storage}
            items={items}
            members={p.members}
            onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
            onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
            onAddItem={(compartmentId, draft) => p.onAddItem(storage, compartmentId, draft)}
            onDeleteItem={p.onDeleteItem}
          />
        </div>
      )}
    </div>
  )
}

function InlineNameAdd({ label, placeholder, onAdd, depth }: {
  label: string; placeholder: string; onAdd: (name: string) => void; depth: number
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!open) {
    return (
      <div className="node-add" style={{ paddingLeft: depth * 14 + 20 }}>
        <button type="button" onClick={() => setOpen(true)}>{label}</button>
      </div>
    )
  }
  return (
    <form
      className="node-add-form"
      style={{ paddingLeft: depth * 14 + 20 }}
      onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) onAdd(n); setName(''); setOpen(false) }}
    >
      <input autoFocus type="text" placeholder={placeholder} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={!name.trim()}>추가</button>
      <button type="button" className="btn-ghost" onClick={() => { setName(''); setOpen(false) }}>취소</button>
    </form>
  )
}
