'use client'

import { useEffect, useRef, useState } from 'react'
import type { Storage, Room, DecItem, FamilyMember, ItemDraft, Compartment } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import { groupItemsByCompartment } from '@/lib/compartments'
import { decryptBytes } from '@/lib/crypto'
import { keys } from '@/lib/keys'
import { createClient } from '@/lib/supabase/client'
import { Modal } from './Modal'

type Props = {
  storage: Storage
  room: Room | undefined
  items: DecItem[]
  members: FamilyMember[]
  onClose: () => void
  onRename: (name: string) => void
  onCompartmentsChange: (compartments: Compartment[]) => void
  onItemsAdd: (drafts: ItemDraft[]) => Promise<void> | void
  onItemDelete: (item: DecItem) => Promise<void> | void
  onStorageDelete: (storage: Storage) => Promise<void> | void
}

// 칸 헤더 — 로컬 rename 상태를 자체 보유(부모 map에서 key={compartment.id}로 마운트되므로 다른 칸과 격리)
function CompartmentHead({ compartment, count, onRename, onDelete, onAddHere }: {
  compartment: Compartment; count: number
  onRename: (name: string) => void; onDelete: () => void; onAddHere: () => void
}) {
  const [name, setName] = useState(compartment.name)
  return (
    <div className="cmp-head">
      <input
        className="cmp-name"
        type="text"
        aria-label="칸 이름"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { const n = name.trim(); if (n && n !== compartment.name) onRename(n); else setName(compartment.name) }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
      <span className="cmp-count">{count}</span>
      <button type="button" className="cmp-add-here" title="여기에 물건 추가" onClick={onAddHere}>＋</button>
      <button type="button" className="cmp-del" title="칸 삭제" onClick={onDelete}>🗑️</button>
    </div>
  )
}

/** 프로토타입 openStorage 패널 이식. page.tsx가 key={storage.id}로 렌더하므로
 *  다른 수납장을 선택하면 이 컴포넌트가 통째로 리마운트돼 사진 캐시가 자연히 초기화된다. */
export function DetailPanel({ storage, room, items, members, onClose, onRename, onCompartmentsChange, onItemsAdd, onItemDelete, onStorageDelete }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  // 수납장 이름 편집(page가 key={storage.id}로 리마운트하므로 초기값만으로 다른 수납장 전환이 반영됨)
  const [storageName, setStorageName] = useState(storage.name)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedCompartmentId, setSelectedCompartmentId] = useState('') // '' = 칸 없음
  const [newCompartmentName, setNewCompartmentName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // 사진 지연 로드 캐시: item id -> objectURL(성공) / photoErrors에 실패 표시(이모지로 폴백)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [photoErrors, setPhotoErrors] = useState<Record<string, true>>({})
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    const fdk = keys.getFDK()
    if (!fdk) return
    let cancelled = false
    const supabase = createClient()
    const toLoad = items.filter((it) => it.photo_path && !photoUrls[it.id] && !photoErrors[it.id])
    for (const it of toLoad) {
      ;(async () => {
        try {
          const { data, error } = await supabase.storage.from('item-photos').createSignedUrl(it.photo_path!, 60 * 60)
          if (error || !data) throw error ?? new Error('signed url 없음')
          const res = await fetch(data.signedUrl)
          const buf = await res.arrayBuffer()
          const plain = await decryptBytes(fdk, buf)
          const url = URL.createObjectURL(new Blob([plain]))
          if (cancelled) { URL.revokeObjectURL(url); return }
          objectUrlsRef.current.push(url)
          setPhotoUrls((m) => ({ ...m, [it.id]: url }))
        } catch {
          if (!cancelled) setPhotoErrors((m) => ({ ...m, [it.id]: true }))
        }
      })()
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // 언마운트(패널 닫힘 또는 다른 수납장 선택으로 key 변경) 시 만든 objectURL 전부 해제
  useEffect(() => () => { objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)) }, [])

  // 패널이 열린 채로 물건이 삭제되면(언마운트 전) 그 항목의 objectURL/캐시를 즉시 정리
  function handleItemDelete(item: DecItem) {
    const url = photoUrls[item.id]
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== url)
      setPhotoUrls((m) => { const rest = { ...m }; delete rest[item.id]; return rest })
    }
    if (photoErrors[item.id]) {
      setPhotoErrors((m) => { const rest = { ...m }; delete rest[item.id]; return rest })
    }
    onItemDelete(item)
  }

  const canSubmit = name.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onItemsAdd([{ name: name.trim(), memo: memo.trim(), compartmentId: selectedCompartmentId || null, photoFile: photoFile ?? undefined }])
    } finally {
      setSubmitting(false)
      setName('')
      setMemo('')
      setPhotoFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      nameInputRef.current?.focus()
      // selectedCompartmentId는 유지 — 같은 칸에 연달아 등록하기 편하게
    }
  }

  // 칸 편집: 추가·이름수정·삭제 전부 전체 목록 교체로 부모에 위임
  const compartments = storage.compartments ?? []
  function addCompartment(raw: string) {
    const n = raw.trim()
    if (!n) return
    onCompartmentsChange([...compartments, { id: crypto.randomUUID(), name: n }])
  }
  function renameCompartment(id: string, newName: string) {
    onCompartmentsChange(compartments.map((c) => (c.id === id ? { ...c, name: newName } : c)))
  }
  function removeCompartment(id: string) {
    onCompartmentsChange(compartments.filter((c) => c.id !== id))
    if (selectedCompartmentId === id) setSelectedCompartmentId('')
  }
  const availablePresets = (meta?.presets ?? []).filter((p) => !compartments.some((c) => c.name === p))
  const groups = groupItemsByCompartment(items, compartments)

  function renderItem(it: DecItem) {
    const by = members.find((m) => m.user_id === it.created_by)
    return (
      <div className="item-card" key={it.id}>
        <div className="item-thumb">
          {photoUrls[it.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: objectURL, next/image의 최적화 대상이 아님
            <img src={photoUrls[it.id]} alt="" />
          ) : (
            it.emoji || '📦'
          )}
        </div>
        <div className="item-body">
          <div className="item-name">{it.name}</div>
          {it.memo && <div className="item-memo">{it.memo}</div>}
          <div className="item-by">{by ? `${by.emoji} ${by.display_name} ` : ''}등록</div>
        </div>
        <button type="button" className="item-del" title="삭제" onClick={() => handleItemDelete(it)}>
          🗑️
        </button>
      </div>
    )
  }

  return (
    <aside className="detail-panel open">
      <div className="dp-head">
        <button type="button" className="dp-close" onClick={onClose}>✕</button>
        <div className="dp-icon">{meta?.em ?? '📦'}</div>
        <input
          className="dp-name-input"
          type="text"
          aria-label="수납장 이름"
          value={storageName}
          maxLength={20}
          onChange={(e) => setStorageName(e.target.value)}
          onBlur={() => { const n = storageName.trim(); if (n && n !== storage.name) onRename(n); else setStorageName(storage.name) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <div className="dp-loc">
          📍 {room?.name ?? '위치 미지정'} · {meta?.label ?? ''} · 물건 {items.length}개
        </div>
        <button type="button" className="dp-del" onClick={() => setConfirmDelete(true)}>
          이 수납장 삭제
        </button>
      </div>

      <div className="dp-items">
        {/* 칸 추가: 종류 프리셋 원탭 + 직접 입력 */}
        <div className="cmp-add">
          {availablePresets.map((p) => (
            <button key={p} type="button" className="cmp-chip" onClick={() => addCompartment(p)}>＋ {p}</button>
          ))}
          <form
            className="cmp-add-form"
            onSubmit={(e) => { e.preventDefault(); addCompartment(newCompartmentName); setNewCompartmentName('') }}
          >
            <input
              type="text"
              placeholder="칸 직접 추가"
              maxLength={20}
              value={newCompartmentName}
              onChange={(e) => setNewCompartmentName(e.target.value)}
            />
            <button type="submit" disabled={!newCompartmentName.trim()}>추가</button>
          </form>
        </div>

        {groups.length === 0 ? (
          <div className="dp-empty">
            아직 등록된 물건이 없어요.<br />칸을 만들거나 아래에서 첫 물건을 등록해보세요!
          </div>
        ) : (
          groups.map((g) => (
            <div className="cmp-group" key={g.compartment?.id ?? '__unfiled'}>
              {g.compartment ? (
                <CompartmentHead
                  compartment={g.compartment}
                  count={g.items.length}
                  onRename={(n) => renameCompartment(g.compartment!.id, n)}
                  onDelete={() => removeCompartment(g.compartment!.id)}
                  onAddHere={() => { setSelectedCompartmentId(g.compartment!.id); nameInputRef.current?.focus() }}
                />
              ) : (
                <div className="cmp-head">
                  <span className="cmp-name-static">미분류</span>
                  <span className="cmp-count">{g.items.length}</span>
                </div>
              )}
              {g.items.length === 0 ? <div className="cmp-empty">비어 있음</div> : g.items.map(renderItem)}
            </div>
          ))
        )}
      </div>

      <div className="dp-form">
        {compartments.length > 0 && (
          <select
            className="cmp-select"
            aria-label="칸 선택"
            value={selectedCompartmentId}
            onChange={(e) => setSelectedCompartmentId(e.target.value)}
          >
            <option value="">칸 없음</option>
            {compartments.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <input
          ref={nameInputRef}
          type="text"
          placeholder="물건 이름 (예: 손톱깎이)"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        />
        <input
          type="text"
          placeholder="메모 (선택)"
          maxLength={40}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <div className="row">
          <button
            type="button"
            className={`photo-btn${photoFile ? ' has' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {photoFile ? '✅ 사진 첨부됨' : '📷 사진 추가 (선택)'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="add-btn" disabled={!canSubmit} onClick={handleSubmit}>
          ＋ 물건 등록
        </button>
      </div>

      {confirmDelete && (
        <Modal
          title="수납장 삭제"
          message={`'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
          okText="삭제"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onStorageDelete(storage) }}
        />
      )}
    </aside>
  )
}
