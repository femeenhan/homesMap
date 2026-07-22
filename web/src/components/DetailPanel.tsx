'use client'

import { useEffect, useRef, useState } from 'react'
import type { Storage, Room, DecItem, FamilyMember, ItemDraft, Compartment } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import { decryptBytes } from '@/lib/crypto'
import { keys } from '@/lib/keys'
import { createClient } from '@/lib/supabase/client'
import { Modal } from './Modal'
import { CompartmentTree, InlineInput, InlineItemForm } from './CompartmentTree'

type Props = {
  storage: Storage
  room: Room | undefined
  items: DecItem[]
  members: FamilyMember[]
  onClose: () => void
  onRename: (name: string) => void
  onCompartmentsChange: (compartments: Compartment[]) => void
  onDeleteCompartment: (id: string) => void
  onItemsAdd: (drafts: ItemDraft[]) => Promise<void> | void
  onItemDelete: (item: DecItem) => Promise<void> | void
  onStorageDelete: (storage: Storage) => Promise<void> | void
}

/** 도식화 뷰에서 수납장 클릭 시 열리는 드로어. 헤더(이름·삭제) + 공유 칸 트리(썸네일 포함).
 *  page.tsx가 key={storage.id}로 렌더하므로 다른 수납장 선택 시 리마운트돼 사진 캐시가 초기화된다. */
export function DetailPanel({ storage, room, items, members, onClose, onRename, onCompartmentsChange, onDeleteCompartment, onItemsAdd, onItemDelete, onStorageDelete }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  const [storageName, setStorageName] = useState(storage.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [adding, setAdding] = useState<'none' | 'cmp' | 'item'>('none')

  // 사진 지연 로드 캐시: item id -> objectURL(성공) / photoErrors(실패는 이모지 폴백)
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

  // 언마운트 시 만든 objectURL 전부 해제
  useEffect(() => () => { objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)) }, [])

  // 물건 삭제 시 그 항목의 objectURL/캐시 즉시 정리 후 위임
  function handleItemDelete(item: DecItem) {
    const url = photoUrls[item.id]
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== url)
      setPhotoUrls((m) => { const rest = { ...m }; delete rest[item.id]; return rest })
    }
    if (photoErrors[item.id]) setPhotoErrors((m) => { const rest = { ...m }; delete rest[item.id]; return rest })
    onItemDelete(item)
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
          📍 {room?.name ?? '위치 미지정'} · 물건 {items.length}개
        </div>
        <button type="button" className="dp-del" onClick={() => setConfirmDelete(true)}>
          이 수납장 삭제
        </button>
      </div>

      <div className="dp-items">
        <div className="dp-actions">
          <button type="button" className="trow-act" onClick={() => setAdding('cmp')}>＋ 칸</button>
          <button type="button" className="trow-act" onClick={() => setAdding('item')}>＋ 물건</button>
        </div>
        {adding === 'cmp' && (
          <InlineInput depth={0} placeholder="새 칸 이름"
            onSubmit={(n) => { onCompartmentsChange([...(storage.compartments ?? []), { id: crypto.randomUUID(), name: n, parent_id: null }]); setAdding('none') }}
            onCancel={() => setAdding('none')} />
        )}
        {adding === 'item' && (
          <InlineItemForm depth={0}
            onSubmit={async (d) => { await onItemsAdd([{ ...d, compartmentId: null }]); setAdding('none') }}
            onCancel={() => setAdding('none')} />
        )}
        <CompartmentTree
          storage={storage}
          items={items}
          members={members}
          photoUrls={photoUrls}
          baseDepth={0}
          onCompartmentsChange={onCompartmentsChange}
          onDeleteCompartment={onDeleteCompartment}
          onAddItem={(compartmentId, draft) => onItemsAdd([{ ...draft, compartmentId }])}
          onDeleteItem={handleItemDelete}
        />
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
