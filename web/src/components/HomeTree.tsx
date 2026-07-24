'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { InlineInput, AddRow } from './CompartmentTree'
import { TreeRow } from './TreeRow'

type AddDraft = { name: string; memo: string; photoFile?: File }

type Props = {
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  members: FamilyMember[]
  photoUrls?: Record<string, string>
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
  onOpenStorage?: (id: string) => void
  focusRoomId?: string | null
  onSelectRoom?: (id: string | null) => void
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
  const rowRef = useRef<HTMLDivElement>(null)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  const focused = p.focusRoomId === room.id
  // 지도에서 방 선택 시 펼침+스크롤 (동기 setState 아닌 지역 함수 래핑 — lint 규칙)
  useEffect(() => {
    if (!focused) return
    const openIt = () => {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    openIt()
  }, [focused])
  return (
    <div className="tnode" ref={rowRef}>
      <TreeRow
        depth={0} levelClass={`lv-room${focused ? ' sel' : ''}`} icon="folder" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded}
        onToggle={() => { setExpanded((e) => !e); p.onSelectRoom?.(focused ? null : room.id) }}
        addActions={[{ icon: 'plus', label: '수납장 추가', onClick: () => { setAdding(true); setExpanded(true) } }]}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)}
      />
      {expanded && (
        <>
          {adding && (
            <InlineInput depth={1} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
          )}
          {storages.map((s) => <TreeStorage key={s.id} storage={s} {...p} />)}
        </>
      )}
    </div>
  )
}

function TreeStorage({ storage, ...p }: { storage: Storage } & Props) {
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  return (
    <TreeRow
      depth={1} levelClass="lv-storage" icon="folder" name={storage.name} count={items.length}
      expandable={false} expanded={false} chevron
      onToggle={() => p.onOpenStorage?.(storage.id)}
      onRename={(n) => p.onRenameStorage(storage, n)}
      deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
      onDelete={() => p.onDeleteStorage(storage)}
    />
  )
}

export type HomeTreeProps = Props
