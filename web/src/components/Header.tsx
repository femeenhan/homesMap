'use client'

import { useState } from 'react'
import { createInviteLink } from '@/lib/keys'
import type { DecItem, FamilyMember, Room, Storage } from '@/lib/types'
import { SearchBar } from './SearchBar'

type Props = {
  familyId: string
  members: FamilyMember[]
  decItems: DecItem[]
  storages: Storage[]
  rooms: Room[]
  onToast: (msg: string) => void
  onSearchPick: (storageId: string) => void
}

export function Header({ familyId, members, decItems, storages, rooms, onToast, onSearchPick }: Props) {
  const [fallbackLink, setFallbackLink] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  async function handleInvite() {
    setInviting(true)
    setFallbackLink(null)
    try {
      const link = await createInviteLink(familyId)
      try {
        await navigator.clipboard.writeText(link)
        onToast('초대 링크를 복사했어요. 가족에게만 공유하세요!')
      } catch {
        setFallbackLink(link)
      }
    } catch {
      onToast('초대 링크를 만들지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <>
      <header>
        <div className="logo">
          <span className="mark">🔍🏠</span>
          <h1>홈즈맵</h1>
          <span className="en">HOMES MAP</span>
        </div>
        <SearchBar decItems={decItems} storages={storages} rooms={rooms} onPick={onSearchPick} />
        <div className="members">
          <span className="label">사용 중:</span>
          {members.map((m) => (
            <span key={m.id} className="member-chip">
              <span className="em">{m.emoji}</span>
              {m.display_name}
            </span>
          ))}
        </div>
        <button type="button" className="invite-btn" onClick={handleInvite} disabled={inviting}>
          👨‍👩‍👧 가족 초대
        </button>
      </header>
      {fallbackLink && (
        <div className="invite-notice" role="status">
          클립보드 복사에 실패했어요. 아래 링크를 직접 복사해주세요.
          <input
            value={fallbackLink}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" onClick={() => setFallbackLink(null)} style={{ marginTop: 6 }}>
            닫기
          </button>
        </div>
      )}
    </>
  )
}
