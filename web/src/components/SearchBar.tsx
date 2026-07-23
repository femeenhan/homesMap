'use client'

import { useEffect, useRef, useState } from 'react'
import { searchItems } from '@/lib/search'
import type { DecItem, Storage, Room } from '@/lib/types'
import { Icon } from './Icon'

type Props = {
  decItems: DecItem[]
  storages: Storage[]
  rooms: Room[]
  onPick: (storageId: string) => void
}

/** 프로토타입 doSearch/flashStorage 검색바 이식. 복호화된 로컬 데이터(decItems)에서만 동작 — 서버 요청 없음. */
export function SearchBar({ decItems, storages, rooms, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hits = searchItems(decItems, storages, rooms, query)
  const itemById = new Map(decItems.map((i) => [i.id, i]))

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function pick(storageId: string) {
    setOpen(false)
    inputRef.current?.blur()
    onPick(storageId)
  }

  return (
    <div className="search-wrap" ref={wrapRef}>
      <span className="icon"><Icon name="search" size={16} /></span>
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="어딨지? 물건 이름을 검색해보세요 (예: 손톱깎이)"
        autoComplete="off"
        aria-label="물건 검색"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(e.target.value.trim().length > 0) }}
        onFocus={() => setOpen(query.trim().length > 0)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) pick(hits[0].storageId)
          if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
        }}
      />
      {open && (
        <div className="search-results open">
          {hits.length > 0 ? (
            hits.map((h) => (
              <button key={h.itemId} type="button" className="sr-item" onClick={() => pick(h.storageId)}>
                <span className="sr-thumb"><Icon name="box" size={16} /></span>
                <span>
                  <span className="sr-name">{itemById.get(h.itemId)?.name ?? ''}</span>
                  <br />
                  <span className="sr-loc">
                    {h.pathNames.join(' › ')}
                    {h.memo ? ` · ${h.memo}` : ''}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <div className="sr-empty">
              {`'${query.trim()}' 검색 결과가 없어요`}
              <br />
              수납장을 클릭해 등록해두면 다음엔 바로 찾아요!
            </div>
          )}
        </div>
      )}
    </div>
  )
}
