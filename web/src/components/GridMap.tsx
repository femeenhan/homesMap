'use client'

import { useEffect, useRef, useState } from 'react'
import type { Compartment, Room, Storage } from '@/lib/types'
import { COLS, type CellRect, contentRows, roomInnerGrid, storageRect } from '@/lib/grid'
import { resolvePath, type PathSeg } from '@/lib/drillPath'
import { childCompartments, descendantIds } from '@/lib/compartments'
import { AddRow, InlineAddForm, InlineInput, ItemRow } from './CompartmentTree'
import { DrillHeader } from './DrillDown'
import type { HomeTreeProps } from './HomeTree'

export type GridMapProps = HomeTreeProps & {
  focusStorageId: string | null
  onConsumeFocus: () => void
  onRoomGeometry: (room: Room, next: CellRect) => void
  onStorageGeometry: (storage: Storage, next: CellRect) => void
}

// 컨테이너 크기 관찰(셀 크기 = 폭/12, 최소 행 = 높이/셀)
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

// 도식화: 사각형 드릴다운 맵. 경로 상태는 목록 드릴다운과 동일한 resolvePath로 검증.
export function GridMap(p: GridMapProps) {
  const [path, setPath] = useState<PathSeg[]>([])
  const [focusFlash, setFocusFlash] = useState(false)
  const valid = resolvePath(path, p.rooms, p.storages)
  const cur = valid[valid.length - 1]
  const toSegs = () => valid.map((v) => ({ kind: v.kind, id: v.id }) as PathSeg)
  const enter = (seg: PathSeg) => setPath([...toSegs(), seg])
  const back = () => setPath(toSegs().slice(0, -1))

  // 검색 점프: 해당 수납장 L2로 즉시 이동(소모형 prop)
  useEffect(() => {
    if (!p.focusStorageId) return
    const jump = () => {
      const s = p.storages.find((x) => x.id === p.focusStorageId)
      if (s) setPath([{ kind: 'room', id: s.room_id }, { kind: 'storage', id: s.id }])
      setFocusFlash(true)
    }
    jump()
    p.onConsumeFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusStorageId])

  useEffect(() => {
    if (!focusFlash) return
    const t = setTimeout(() => setFocusFlash(false), 1600)
    return () => clearTimeout(t)
  }, [focusFlash])

  if (!cur) return <HomeCanvas p={p} onEnter={enter} />
  if (cur.kind === 'room') return <RoomCanvas p={p} room={cur.room} onEnter={enter} onBack={back} />
  const storage = cur.storage
  const parent = cur.kind === 'cmp' ? cur.cmp : null
  return <StorageView p={p} storage={storage} parent={parent} onEnter={enter} onBack={back} flash={focusFlash} />
}

const px = (r: CellRect, cell: number) => ({
  left: r.x * cell, top: r.y * cell, width: r.w * cell, height: r.h * cell,
})

// L0: 우리집 — 방 타일
function HomeCanvas({ p, onEnter }: { p: GridMapProps; onEnter: (s: PathSeg) => void }) {
  const [adding, setAdding] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const cell = w / COLS
  const rects = p.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
  const rows = cell > 0 ? contentRows(rects, Math.ceil(h / cell)) : 0
  return (
    <div className="gmap-page">
      {adding
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap" style={{ height: rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {p.rooms.length === 0 && <div className="gmap-empty">방이 없어요 — 위 ‘방 추가’로 시작해보세요</div>}
            {p.rooms.map((room) => (
              <button key={room.id} type="button" className="gm-tile gm-room" style={px(room, cell)}
                onClick={() => onEnter({ kind: 'room', id: room.id })}>
                <span className="gm-name">{room.name}</span>
                {p.storages.filter((s) => s.room_id === room.id).length > 0 && (
                  <span className="gm-meta">{p.storages.filter((s) => s.room_id === room.id).length}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="gmap-foot">
        방 {p.rooms.length} · 수납장 {p.storages.length} · 물건 {p.decItems.length}개
      </div>
    </div>
  )
}

// L1: 방 확대 — 수납장 타일 (방 비율의 내부 그리드)
function RoomCanvas({ p, room, onEnter, onBack }: {
  p: GridMapProps; room: Room; onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w } = useSize(wrapRef)
  const inner = roomInnerGrid(room)
  const cell = w / inner.cols
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="gmap-page">
      <DrillHeader name={room.name} onBack={onBack}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)} />
      {adding
        ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap gm-roomview" style={{ height: inner.rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {storages.length === 0 && <div className="gmap-empty">수납장이 없어요 — 위 ‘수납장 추가’로 시작해보세요</div>}
            {storages.map((s) => (
              <button key={s.id} type="button" className="gm-tile gm-storage" style={px(storageRect(s), cell)}
                onClick={() => onEnter({ kind: 'storage', id: s.id })}>
                <span className="gm-name">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// L2+: 수납장/칸 확대 — 하위 칸 세로 스택(자동, 좌표 없음) + 물건 목록
function StorageView({ p, storage, parent, onEnter, onBack, flash }: {
  p: GridMapProps; storage: Storage; parent: Compartment | null
  onEnter: (s: PathSeg) => void; onBack: () => void; flash: boolean
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const children = childCompartments(compartments, parent?.id ?? null)
  const validIds = new Set(compartments.map((c) => c.id))
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = parent
    ? allItems.filter((it) => it.compartment_id === parent.id)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const countIn = (cmpId: string) => {
    const ids = new Set([cmpId, ...descendantIds(compartments, cmpId)])
    return allItems.filter((it) => it.compartment_id != null && ids.has(it.compartment_id)).length
  }
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
    <div className={`gmap-page${flash ? ' gm-focus' : ''}`}>
      <DrillHeader onBack={onBack} {...head} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: parent?.id ?? null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, parent?.id ?? null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll">
        {children.length > 0 && (
          <div className="gm-stack">
            {children.map((c) => (
              <button key={c.id} type="button" className="gm-block" onClick={() => onEnter({ kind: 'cmp', id: c.id })}>
                <span className="gm-name">{c.name}</span>
                {countIn(c.id) > 0 && <span className="gm-meta">{countIn(c.id)}</span>}
              </button>
            ))}
          </div>
        )}
        {children.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
        <div className="gm-items">
          {items.map((it) => <ItemRow key={it.id} item={it} depth={0} onDelete={p.onDeleteItem} />)}
        </div>
      </div>
    </div>
  )
}
