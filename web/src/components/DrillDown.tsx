'use client'

import { useState } from 'react'
import { resolvePath, type PathSeg } from '@/lib/drillPath'
import { AddRow, InlineInput } from './CompartmentTree'
import { TreeRow, DrillHeader } from './TreeRow'
import type { HomeTreeProps } from './HomeTree'

// 모바일 드릴다운: 한 화면 = 한 레벨. 방 목록 → 방(수납장 탭은 StoragePane으로 진입).
// 경로는 state, 렌더는 resolvePath가 검증한 유효 접두사만 사용 — 동기화로 노드가 사라져도 조상 화면으로 복귀.
export function DrillDown(p: HomeTreeProps) {
  const [path, setPath] = useState<PathSeg[]>([])
  const valid = resolvePath(path, p.rooms, p.storages)
  const cur = valid[valid.length - 1]

  const toSegs = () => valid.map((v) => ({ kind: v.kind, id: v.id }) as PathSeg)
  const enter = (seg: PathSeg) => setPath([...toSegs(), seg])
  const back = () => setPath(toSegs().slice(0, -1))

  if (!cur) return <RootScreen p={p} onEnter={enter} />
  // storage/cmp 세그는 더 이상 생성되지 않음(resolvePath가 만들 수 없음) — 타입 내로잉용 가드
  if (cur.kind !== 'room') return <RootScreen p={p} onEnter={enter} />
  return <RoomScreen p={p} room={cur.room} onBack={back} />
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

function RoomScreen({ p, room, onBack }: {
  p: HomeTreeProps; room: HomeTreeProps['rooms'][number]; onBack: () => void
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
          onToggle={() => p.onOpenStorage?.(s.id)}
          onRename={(n) => p.onRenameStorage(s, n)}
          deleteTitle="수납장 삭제" deleteMessage={`'${s.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteStorage(s)}
        />
      ))}
    </div>
  )
}
