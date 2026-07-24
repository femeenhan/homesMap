'use client'

import { useEffect, useRef, useState } from 'react'
import type { Room, Storage } from '@/lib/types'
import { COLS, ROOM_MIN, type CellRect, contentRows, roomInnerGrid, storageRect } from '@/lib/grid'
import { AddRow, CompartmentTree, InlineAddForm, InlineInput } from './CompartmentTree'
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

// 도식화: 2레벨 — 탑뷰(방+수납장 오버레이) / 수납장 화면(아코디언). 노드가 동기화로 사라지면 자동 탑뷰 복귀.
export function GridMap(p: GridMapProps) {
  const [storageId, setStorageId] = useState<string | null>(null)
  const [focusFlash, setFocusFlash] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editRoomId, setEditRoomId] = useState<string | null>(null)

  // 검색 점프: 해당 수납장 화면으로 직행(소모형 prop)
  useEffect(() => {
    if (!p.focusStorageId) return
    const jump = () => { setStorageId(p.focusStorageId); setFocusFlash(true) }
    jump()
    p.onConsumeFocus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusStorageId])

  useEffect(() => {
    if (!focusFlash) return
    const t = setTimeout(() => setFocusFlash(false), 1600)
    return () => clearTimeout(t)
  }, [focusFlash])

  const storage = storageId ? (p.storages.find((s) => s.id === storageId) ?? null) : null
  const editRoom = editRoomId ? (p.rooms.find((r) => r.id === editRoomId) ?? null) : null
  if (storage) return <StorageScreen p={p} storage={storage} flash={focusFlash} onBack={() => setStorageId(null)} />
  if (editRoom) return <RoomEditView p={p} room={editRoom} onBack={() => setEditRoomId(null)} />
  return <HomeCanvas p={p} editing={editing} onToggleEditing={() => setEditing((e) => !e)} onOpenStorage={setStorageId} onEditRoom={setEditRoomId} />
}

// 탑뷰: 우리집 — 방 타일 + 수납장 %-비례 오버레이
function HomeCanvas({ p, editing, onToggleEditing, onOpenStorage, onEditRoom }: {
  p: GridMapProps; editing: boolean; onToggleEditing: () => void; onOpenStorage: (id: string) => void; onEditRoom: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const cell = w / COLS
  const rects = p.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
  const rows = cell > 0 ? contentRows(rects, Math.ceil(h / cell)) + (editing ? 3 : 0) : 0
  return (
    <div className="gmap-page">
      <div className="gmap-bar">
        {adding
          ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
        <button type="button" className={`gmap-edit${editing ? ' on' : ''}`}
          onClick={() => { onToggleEditing(); setSelectedId(null) }}>
          {editing ? '완료' : '편집'}
        </button>
      </div>
      {editing && <div className="gmap-hint">방을 한 번 더 탭하면 확대해서 수납장을 편집할 수 있어요</div>}
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap" style={{ height: rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {p.rooms.length === 0 && <div className="gmap-empty">방이 없어요 — 위 ‘방 추가’로 시작해보세요</div>}
            {p.rooms.map((room) => {
              const inner = roomInnerGrid(room)
              const roomStorages = p.storages.filter((s) => s.room_id === room.id)
              return (
                <EditableTile key={room.id} rect={{ x: room.x, y: room.y, w: room.w, h: room.h }}
                  cell={cell} cols={COLS} minW={ROOM_MIN} minH={ROOM_MIN}
                  editing={editing} selected={selectedId === room.id}
                  className="gm-tile gm-room"
                  onSelect={() => { if (selectedId === room.id) onEditRoom(room.id); else setSelectedId(room.id) }}
                  onOpen={() => {}} // 보기에서 방 탭은 무동작 — 방은 레이아웃일 뿐(스펙 §1)
                  onCommit={(next) => p.onRoomGeometry(room, next)}>
                  <span className="gm-name">{room.name}</span>
                  {/* 수납장 오버레이 — 방-로컬 셀을 방 사각형에 %-비례 배치 */}
                  {roomStorages.map((s) => {
                    const r = storageRect(s)
                    const st = {
                      left: `${(r.x / inner.cols) * 100}%`, top: `${(r.y / inner.rows) * 100}%`,
                      width: `${(r.w / inner.cols) * 100}%`, height: `${(r.h / inner.rows) * 100}%`,
                    }
                    return editing ? (
                      <div key={s.id} className="gm-sto" style={st}><span>{s.name}</span></div>
                    ) : (
                      <button key={s.id} type="button" className="gm-sto" style={st}
                        onClick={(e) => { e.stopPropagation(); onOpenStorage(s.id) }}>
                        <span>{s.name}</span>
                      </button>
                    )
                  })}
                </EditableTile>
              )
            })}
          </div>
        )}
      </div>
      <div className="gmap-foot">
        방 {p.rooms.length} · 수납장 {p.storages.length} · 물건 {p.decItems.length}개
      </div>
    </div>
  )
}

// 방 확대 편집: 수납장 이동/리사이즈(방 안으로 클램프) + 방 이름수정/삭제 + 수납장 추가. ‹로 탑뷰 편집 복귀.
function RoomEditView({ p, room, onBack }: { p: GridMapProps; room: Room; onBack: () => void }) {
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
      <div className="gmap-bar">
        {adding
          ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
          : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      </div>
      <div className="gmap-scroll" ref={wrapRef}>
        {cell > 0 && (
          <div className="gmap" style={{ height: inner.rows * cell, backgroundSize: `${cell}px ${cell}px` }}>
            {storages.length === 0 && <div className="gmap-empty">수납장이 없어요 — 위 ‘수납장 추가’로 시작해보세요</div>}
            {storages.map((s) => (
              <EditableTile key={s.id} rect={storageRect(s)}
                cell={cell} cols={inner.cols} minW={1} minH={1} maxRows={inner.rows}
                editing selected={selectedId === s.id}
                className="gm-tile gm-storage"
                onSelect={() => setSelectedId(s.id)}
                onOpen={() => {}}
                onCommit={(next) => p.onStorageGeometry(s, next)}>
                <span className="gm-name">{s.name}</span>
              </EditableTile>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 수납장 화면: 헤더 + 상단 추가 + 아코디언(목록 뷰와 동일 컴포넌트) — 칸부터는 공간이 아니라 분류(스펙 §1)
function StorageScreen({ p, storage, flash, onBack }: {
  p: GridMapProps; storage: Storage; flash: boolean; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const items = p.decItems.filter((it) => it.storage_id === storage.id)
  return (
    <div className={`gmap-page${flash ? ' gm-focus' : ''}`}>
      <DrillHeader name={storage.name} onBack={onBack}
        onRename={(n) => p.onRenameStorage(storage, n)}
        deleteTitle="수납장 삭제" deleteMessage={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteStorage(storage)} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      <div className="gmap-scroll">
        <CompartmentTree storage={storage} items={items} members={p.members} photoUrls={p.photoUrls} baseDepth={0}
          onCompartmentsChange={(c) => p.onCompartmentsChange(storage, c)}
          onDeleteCompartment={(id) => p.onDeleteCompartment(storage, id)}
          onAddItem={(cid, d) => p.onAddItem(storage, cid, d)}
          onDeleteItem={p.onDeleteItem}
        />
        {compartments.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
      </div>
    </div>
  )
}

// 편집 가능 타일: 보기=클릭 진입 / 편집=드래그 이동(셀 스냅)·선택 후 코너 핸들 리사이즈.
// 세로는 탑뷰=아래 무제한(행 확장), 방 확대=maxRows로 방 안 클램프.
function EditableTile({ rect, cell, cols, minW, minH, maxRows, editing, selected, className, onSelect, onOpen, onCommit, children }: {
  rect: CellRect; cell: number; cols: number; minW: number; minH: number; maxRows?: number
  editing: boolean; selected: boolean; className: string
  onSelect: () => void; onOpen: () => void; onCommit: (next: CellRect) => void
  children: React.ReactNode
}) {
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; sx: number; sy: number; cur: CellRect } | null>(null)
  const moved = useRef(false)
  const shown = drag?.cur ?? rect
  const clampMove = (r: CellRect): CellRect => ({
    ...r,
    x: Math.min(Math.max(r.x, 0), cols - r.w),
    y: maxRows ? Math.min(Math.max(r.y, 0), maxRows - r.h) : Math.max(r.y, 0),
  })

  function start(mode: 'move' | 'resize', e: React.PointerEvent) {
    if (!editing) return
    e.stopPropagation()
    moved.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ mode, sx: e.clientX, sy: e.clientY, cur: rect })
  }
  function move(e: React.PointerEvent) {
    e.stopPropagation()
    if (!drag) return
    const dx = Math.round((e.clientX - drag.sx) / cell)
    const dy = Math.round((e.clientY - drag.sy) / cell)
    if (dx !== 0 || dy !== 0) moved.current = true
    setDrag({
      ...drag,
      cur: drag.mode === 'move'
        ? clampMove({ ...rect, x: rect.x + dx, y: rect.y + dy })
        : {
            ...rect,
            w: Math.min(Math.max(rect.w + dx, minW), cols - rect.x),
            h: maxRows ? Math.min(Math.max(rect.h + dy, minH), maxRows - rect.y) : Math.max(rect.h + dy, minH),
          },
    })
  }
  function end(e: React.PointerEvent) {
    e.stopPropagation()
    if (!drag) return
    const c = drag.cur
    setDrag(null)
    if (c.x !== rect.x || c.y !== rect.y || c.w !== rect.w || c.h !== rect.h) onCommit(c)
  }

  return (
    <div className={`${className}${editing ? ' gm-edit' : ''}${selected ? ' gm-selected' : ''}`}
      style={{ left: shown.x * cell, top: shown.y * cell, width: shown.w * cell, height: shown.h * cell }}
      role="button" tabIndex={0}
      onPointerDown={(e) => start('move', e)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
      onClick={() => {
        if (moved.current) { moved.current = false; return }
        if (editing) onSelect(); else onOpen()
      }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !editing) onOpen() }}
    >
      {children}
      {editing && selected && (
        <div className="gm-grip" onPointerDown={(e) => start('resize', e)} onPointerMove={move} onPointerUp={end} />
      )}
    </div>
  )
}
