'use client'

import { useState } from 'react'
import type { Room, Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { CompartmentTree, InlineInput, AddRow, InlineAddForm } from './CompartmentTree'
import { TreeRow } from './TreeRow'

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
  const [addingRoom, setAddingRoom] = useState(false)
  return (
    <div className="home-tree">
      {addingRoom
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAddingRoom(false) }} onCancel={() => setAddingRoom(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAddingRoom(true)} />}
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => <TreeRoom key={room.id} room={room} {...p} />)}
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
        depth={0} levelClass="lv-room" icon="folder" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)}
      />
      {expanded && (
        <>
          {adding
            ? <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
            : <AddRow depth={1} label="수납장 추가" onClick={() => setAdding(true)} />}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} room={room} {...p} />)}
        </>
      )}
    </div>
  )
}

function TreeStorage({ storage, ...p }: { storage: Storage; room: Room } & Props) {
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const compartments = storage.compartments ?? []
  const hasKids = compartments.length > 0 || items.length > 0
  return (
    <div className="tnode">
      <TreeRow
        depth={1} levelClass="lv-storage" icon="folder" name={storage.name} count={items.length}
        expandable={hasKids}
        expanded={expanded} onToggle={() => setExpanded((e) => !e)}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)}
      />
      {expanded && (
        <>
          {adding
            ? <InlineAddForm depth={2}
                onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding(false) }}
                onAddItem={async (d) => { await p.onAddItem(storage, null, d); setAdding(false) }}
                onCancel={() => setAdding(false)} />
            : <AddRow depth={2} label="추가" onClick={() => setAdding(true)} />}
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

export type HomeTreeProps = Props
