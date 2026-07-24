'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage, DecItem, FamilyMember, Compartment } from '@/lib/types'
import { InlineInput, AddRow, InlineItemForm, ItemRow } from './CompartmentTree'
import { TreeRow } from './TreeRow'
import { childCompartments } from '@/lib/compartments'

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
  onOpenItem?: (id: string) => void
  focusRoomId?: string | null
  onSelectRoom?: (id: string | null) => void
  focusStorageId?: string | null
  storageFlash?: boolean
  onFocusStorage?: (id: string) => void
  onCopyStorage?: (storage: Storage) => void      // ⋯ 복사 → 앱 클립보드
  canPasteStorage?: boolean                       // 클립보드에 수납장 있음 — 방 ⋯에 붙여넣기 노출
  onPasteStorage?: (room: Room) => void
  onCreateSample?: () => void
}

// 집 전체 아코디언: 방 → 수납장 → 칸(무한중첩) → 물건. 카테고리화의 본체(목록 뷰).
export function HomeTree(p: Props) {
  const [addingRoom, setAddingRoom] = useState(false)
  return (
    <div className="home-tree">
      {addingRoom
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAddingRoom(false) }} onCancel={() => setAddingRoom(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAddingRoom(true)} />}
      {p.rooms.length === 0 && (
        <div className="tree-empty">
          아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작하거나
          <button type="button" className="sample-btn" onClick={() => p.onCreateSample?.()}>예시 집으로 시작하기</button>
        </div>
      )}
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
  const containsFocus = !!p.focusStorageId && storages.some((s) => s.id === p.focusStorageId)
  // 지도·검색에서 방(또는 그 안의 수납장) 선택 시 펼침+스크롤 (동기 setState 아닌 지역 함수 래핑 — lint 규칙)
  useEffect(() => {
    if (!focused && !containsFocus) return
    const openIt = () => {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    openIt()
  }, [focused, containsFocus])
  return (
    <div className="tnode" ref={rowRef}>
      <TreeRow
        depth={0} levelClass={`lv-room${focused ? ' sel' : ''}`} icon="folder" name={room.name} count={storages.length}
        expandable={storages.length > 0}
        expanded={expanded}
        onToggle={() => { setExpanded((e) => !e); p.onSelectRoom?.(focused ? null : room.id) }}
        addActions={[{ icon: 'plus', label: '수납장 추가', onClick: () => { setAdding(true); setExpanded(true) } }]}
        onPaste={p.canPasteStorage ? () => p.onPasteStorage?.(room) : undefined}
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
  const [expanded, setExpanded] = useState(false)
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const compartments = storage.compartments ?? []
  const validIds = new Set(compartments.map((c) => c.id))
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  const direct = items.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const roots = childCompartments(compartments, null)
  const focused = p.focusStorageId === storage.id
  // 지도 타일·검색에서 이 수납장 선택 시 펼침+스크롤
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
        depth={1} levelClass={`lv-storage${focused ? ' sel' : ''}${focused && p.storageFlash ? ' flash' : ''}`}
        icon="folder" name={storage.name} count={items.length}
        expandable={compartments.length > 0 || items.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        addActions={[
          { icon: 'folder-plus', label: '칸 추가', onClick: () => { setAddingCmp(true); setExpanded(true) } },
          { icon: 'box-plus', label: '물건 추가', onClick: () => { setAddingItem(true); setExpanded(true) } },
        ]}
        onRename={(n) => p.onRenameStorage(storage, n)}
        onDuplicate={() => p.onCopyStorage?.(storage)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)}
      />
      {expanded && (
        <>
          {addingCmp && <InlineInput depth={2} placeholder="칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAddingCmp(false) }} onCancel={() => setAddingCmp(false)} />}
          {addingItem && <InlineItemForm depth={2} onSubmit={async (d) => { await p.onAddItem(storage, null, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />}
          {roots.map((c) => <CmpNode key={c.id} cmp={c} depth={2} storage={storage} compartments={compartments} {...p} />)}
          {direct.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={2} onDelete={p.onDeleteItem} onOpen={() => p.onOpenItem?.(it.id)} />)}
        </>
      )}
    </div>
  )
}

// 칸 노드(무한 중첩): 탭=펼침, ＋칸/＋물건 2버튼, ⋯ 이름수정/삭제
function CmpNode({ cmp, depth, storage, compartments, ...p }: {
  cmp: Compartment; depth: number; storage: Storage; compartments: Compartment[]
} & Props) {
  const [expanded, setExpanded] = useState(false)
  const [addingCmp, setAddingCmp] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const children = childCompartments(compartments, cmp.id)
  const myItems = p.decItems.filter((it) => it.storage_id === storage.id && it.compartment_id === cmp.id)
  return (
    <div className="tnode">
      <TreeRow
        depth={depth} icon="folder" name={cmp.name} count={myItems.length}
        expandable={children.length > 0 || myItems.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        addActions={[
          { icon: 'folder-plus', label: '칸 추가', onClick: () => { setAddingCmp(true); setExpanded(true) } },
          { icon: 'box-plus', label: '물건 추가', onClick: () => { setAddingItem(true); setExpanded(true) } },
        ]}
        onRename={(n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === cmp.id ? { ...x, name: n } : x)))}
        deleteTitle="칸 삭제" deleteMessage={`'${cmp.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteCompartment(storage, cmp.id)}
      />
      {expanded && (
        <>
          {addingCmp && <InlineInput depth={depth + 1} placeholder="칸 이름" onSubmit={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: cmp.id }]); setAddingCmp(false) }} onCancel={() => setAddingCmp(false)} />}
          {addingItem && <InlineItemForm depth={depth + 1} onSubmit={async (d) => { await p.onAddItem(storage, cmp.id, d); setAddingItem(false) }} onCancel={() => setAddingItem(false)} />}
          {children.map((c) => <CmpNode key={c.id} cmp={c} depth={depth + 1} storage={storage} compartments={compartments} {...p} />)}
          {myItems.map((it) => <ItemRow key={it.id} item={it} photoUrl={p.photoUrls?.[it.id]} depth={depth + 1} onDelete={p.onDeleteItem} onOpen={() => p.onOpenItem?.(it.id)} />)}
        </>
      )}
    </div>
  )
}

export type HomeTreeProps = Props
