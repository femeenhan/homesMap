'use client'

import { useEffect, useRef, useState } from 'react'
import type { Storage, Room, DecItem, FamilyMember, ItemDraft } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
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
  onItemsAdd: (drafts: ItemDraft[]) => Promise<void> | void
  onItemDelete: (item: DecItem) => Promise<void> | void
  onStorageDelete: (storage: Storage) => Promise<void> | void
}

/** 프로토타입 openStorage 패널 이식. page.tsx가 key={storage.id}로 렌더하므로
 *  다른 수납장을 선택하면 이 컴포넌트가 통째로 리마운트돼 사진 캐시가 자연히 초기화된다. */
export function DetailPanel({ storage, room, items, members, onClose, onItemsAdd, onItemDelete, onStorageDelete }: Props) {
  const meta = STORAGE_TYPES.find((s) => s.type === storage.type)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      await onItemsAdd([{ name: name.trim(), memo: memo.trim(), photoFile: photoFile ?? undefined }])
    } finally {
      setSubmitting(false)
      setName('')
      setMemo('')
      setPhotoFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      nameInputRef.current?.focus()
    }
  }

  return (
    <aside className="detail-panel open">
      <div className="dp-head">
        <button type="button" className="dp-close" onClick={onClose}>✕</button>
        <div className="dp-icon">{meta?.em ?? '📦'}</div>
        <div className="dp-name">{storage.name}</div>
        <div className="dp-loc">
          📍 {room?.name ?? '위치 미지정'} · {meta?.label ?? ''} · 물건 {items.length}개
        </div>
        <button type="button" className="dp-del" onClick={() => setConfirmDelete(true)}>
          이 수납장 삭제
        </button>
      </div>

      <div className="dp-items">
        {items.length === 0 ? (
          <div className="dp-empty">
            아직 등록된 물건이 없어요.<br />아래에서 첫 물건을 등록해보세요!
          </div>
        ) : (
          items.map((it) => {
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
          })
        )}
      </div>

      <div className="dp-form">
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
          placeholder="메모 — 몇 번째 칸인지 등 (선택)"
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
