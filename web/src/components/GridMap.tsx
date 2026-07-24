'use client'

import { useEffect, useRef, useState } from 'react'
import type { Compartment, Room, Storage } from '@/lib/types'
import { COLS, ROOM_MIN, type CellRect, contentRows, roomInnerGrid, storageRect } from '@/lib/grid'
import { childCompartments } from '@/lib/compartments'
import { AddRow, InlineInput, InlineItemForm, ItemRow } from './CompartmentTree'
import { DrillHeader } from './DrillDown'
import { Icon } from './Icon'
import type { HomeTreeProps } from './HomeTree'
import { TreeRow } from './TreeRow'

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
      {editing && <div className="gmap-hint">수납장은 바로 드래그해서 옮기고, 방을 한 번 더 탭하면 확대 편집할 수 있어요</div>}
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
                  
                  onCommit={(next) => p.onRoomGeometry(room, next)}>
                  <span className="gm-name">{room.name}</span>
                  {/* 수납장 오버레이 — 방-로컬 셀을 방 사각형에 %-비례 배치 */}
                  {roomStorages.map((s) => {
                    const r = storageRect(s)
                    if (editing) {
                      const cw = (room.w * cell) / inner.cols   // 방-로컬 가로 셀(px)
                      const chh = (room.h * cell) / inner.rows  // 방-로컬 세로 셀(px)
                      return (
                        <EditableTile key={s.id} rect={r}
                          cell={cw} cellH={chh} cols={inner.cols} minW={1} minH={1} maxRows={inner.rows}
                          editing selected={selectedId === s.id}
                          className="gm-sto"
                          onSelect={() => setSelectedId(s.id)}
                          onCommit={(next) => p.onStorageGeometry(s, next)}>
                          <span>{s.name}</span>
                        </EditableTile>
                      )
                    }
                    const st = {
                      left: `${(r.x / inner.cols) * 100}%`, top: `${(r.y / inner.rows) * 100}%`,
                      width: `${(r.w / inner.cols) * 100}%`, height: `${(r.h / inner.rows) * 100}%`,
                    }
                    return (
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

// 수납장 화면: 좌=칸 트리(구조) / 우=선택 칸의 직속 물건 — 아래로만 길어지는 아코디언 대신 가로 공간 활용(스펙 §1)
function StorageScreen({ p, storage, flash, onBack }: {
  p: GridMapProps; storage: Storage; flash: boolean; onBack: () => void
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

// 편집 가능 타일: 편집=드래그 이동(셀 스냅)·선택 후 코너 핸들 리사이즈.
// 보기 모드에선 정적 컨테이너(내부 수납장 버튼이 인터랙션 담당 — 탑뷰 방 탭은 무동작).
// 세로는 탑뷰=아래 무제한(행 확장), 방 확대=maxRows로 방 안 클램프.
function EditableTile({ rect, cell, cellH, cols, minW, minH, maxRows, editing, selected, className, onSelect, onCommit, children }: {
  rect: CellRect; cell: number; cellH?: number; cols: number; minW: number; minH: number; maxRows?: number
  editing: boolean; selected: boolean; className: string
  onSelect: () => void; onCommit: (next: CellRect) => void
  children: React.ReactNode
}) {
  const ch = cellH ?? cell
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
    const dy = Math.round((e.clientY - drag.sy) / ch)
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
      style={{ left: shown.x * cell, top: shown.y * ch, width: shown.w * cell, height: shown.h * ch }}
      role={editing ? 'button' : undefined} tabIndex={editing ? 0 : undefined}
      onPointerDown={(e) => start('move', e)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
      onClick={(e) => {
        e.stopPropagation()
        if (moved.current) { moved.current = false; return }
        if (editing) onSelect()
      }}
    >
      {children}
      {editing && selected && (
        <div className="gm-grip" onPointerDown={(e) => start('resize', e)} onPointerMove={move} onPointerUp={end} />
      )}
    </div>
  )
}
