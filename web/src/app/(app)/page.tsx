'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keys } from '@/lib/keys'
import { store } from '@/lib/store'
import { syncNow, push } from '@/lib/sync'
import { decryptField, encryptField } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/useToast'
import { Header } from '@/components/Header'
import { Toolbar } from '@/components/Toolbar'
import { MapCanvas } from '@/components/MapCanvas'
import type { Room, Storage, Item, DecItem, FamilyMember, Mode, StorageTypeKey } from '@/lib/types'
import type { Pt, Rect } from '@/lib/geometry'

type BootData = {
  familyId: string
  userId: string
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  members: FamilyMember[]
  offline: boolean
  skippedCount: number
}

export default function AppHomePage() {
  const router = useRouter()
  const [data, setData] = useState<BootData | null>(null)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('select')
  const [palType, setPalType] = useState<StorageTypeKey>('drawer')
  const { message: toastMsg, showToast } = useToast()

  useEffect(() => {
    (async () => {
      try {
        // 1) 초대 수락 도중 로그인하러 갔다가 돌아온 경우 — 프래그먼트를 되살려 초대 페이지로 복귀
        const pendingRaw = sessionStorage.getItem('pendingInvite')
        if (pendingRaw) {
          try {
            const { token, k } = JSON.parse(pendingRaw)
            if (token && k) {
              router.replace(`/invite/${token}#k=${k}`)
              return
            }
          } catch {
            sessionStorage.removeItem('pendingInvite')
          }
        }

        // 2) 이번 세션에 이미 잠금해제된 상태면 로컬 스토어를 하이드레이트하고 지도를 렌더
        if (keys.hasFDK()) {
          await boot()
          return
        }

        // 3) 세션 FDK 없음 — 로컬에 래핑 키 캐시가 있으면 오프라인으로도 잠금해제 가능
        const wrapped = await store.getMeta('wrappedKey')
        if (wrapped) {
          router.replace('/unlock')
          return
        }

        // 4) 로컬 캐시도 없음 — 온라인으로 가족 멤버십 조회 후 분기
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/login')
          return
        }
        const { data: membershipRows } = await supabase.from('family_members').select('id').eq('user_id', user.id).limit(1)
        router.replace(membershipRows && membershipRows.length > 0 ? '/unlock' : '/onboarding')
      } catch {
        setError(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function boot() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: fm } = await supabase.from('family_members').select('family_id').eq('user_id', user.id).limit(1)
    const familyId = fm?.[0]?.family_id
    if (!familyId) { setError(true); return }

    let offline = false
    try {
      await syncNow(familyId)
    } catch {
      offline = true // 서버 동기화 실패 — 로컬 스토어 데이터로 그대로 진행(로컬 우선 원칙)
    }
    await loadLocalData(familyId, user.id, offline)
  }

  async function loadLocalData(familyId: string, userId: string, offline: boolean) {
    const fdk = keys.getFDK()
    if (!fdk) return
    const [rooms, storages, items, members] = await Promise.all([
      store.allActive<Room>('rooms'),
      store.allActive<Storage>('storages'),
      store.allActive<Item>('items'),
      store.getAll<FamilyMember>('members'),
    ])
    // 손상된 블롭/키 불일치 등으로 한 물건의 복호화가 실패해도 나머지 지도는 정상 렌더 — 실패한 항목만 건너뜀
    const decrypted = await Promise.all(
      items.map(async (it): Promise<DecItem | null> => {
        const { enc_name, enc_memo, ...rest } = it
        try {
          return {
            ...rest,
            name: await decryptField(fdk, enc_name),
            memo: enc_memo ? await decryptField(fdk, enc_memo) : '',
          }
        } catch {
          return null
        }
      })
    )
    const decItems = decrypted.filter((d): d is DecItem => d !== null)
    const skippedCount = decrypted.length - decItems.length
    setData({ familyId, userId, rooms, storages, decItems, members, offline, skippedCount })
  }

  // 앱으로 포커스가 돌아올 때 백그라운드로 재동기화(로컬 우선 — 실패해도 화면은 그대로 유지)
  const familyId = data?.familyId
  const userId = data?.userId
  useEffect(() => {
    if (!familyId || !userId) return
    const onFocus = () => {
      syncNow(familyId).then(() => loadLocalData(familyId, userId, false)).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [familyId, userId])

  // ---------- 지도 편집: 방 그리기 / 수납장 놓기 / 방 삭제(연쇄 소프트삭제) ----------
  // 셋 다 같은 패턴: 로컬에 즉시 반영(로컬 우선) → 낙관적 화면 갱신 → push() 시도(오프라인이면 토스트만)

  async function handleRoomCreate(rect: Rect, name: string, colorIndex: number) {
    if (!data) return
    const row: Room = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      name,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
      color_index: colorIndex,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('rooms', row, { dirty: true })
    setData((d) => d && { ...d, rooms: [...d.rooms, row] })
    setMode('storage')
    try {
      await push()
      showToast(`'${name}' 방이 생겼어요! 이제 수납장을 놓아보세요`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  async function handleStoragePlace(room: Room, point: Pt, name: string) {
    if (!data) return
    const row: Storage = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      room_id: room.id,
      type: palType,
      name,
      x: Math.round(point.x),
      y: Math.round(point.y),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('storages', row, { dirty: true })
    setData((d) => d && { ...d, storages: [...d.storages, row] })
    try {
      await push()
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
    // 활동 기록은 최선노력(best-effort) — 실패(오프라인 등)해도 조용히 무시, UI를 막지 않음
    void recordActivity(data.familyId, data.userId, room.name, name)
  }

  async function recordActivity(familyId: string, actorId: string, roomName: string, storageName: string) {
    const fdk = keys.getFDK()
    if (!fdk) return
    try {
      const enc_payload = await encryptField(fdk, JSON.stringify({ roomName, storageName }))
      const supabase = createClient()
      await supabase.from('activity').insert({ family_id: familyId, actor_id: actorId, kind: 'storage_added', enc_payload })
    } catch {
      // 오프라인 등 — 활동 기록은 최선노력이라 조용히 스킵
    }
  }

  async function handleRoomDelete(room: Room) {
    if (!data) return
    const now = new Date().toISOString()
    const storageIds = data.storages.filter((s) => s.room_id === room.id).map((s) => s.id)
    // items는 암호화된 형태로만 로컬에 있음 — 복호화하지 않고 deleted_at/updated_at만 바꿔 나머지 필드 보존
    const allItems = await store.allActive<Item>('items')
    const items = allItems.filter((it) => storageIds.includes(it.storage_id))

    const updatedRoom: Room = { ...room, deleted_at: now, updated_at: now }
    const updatedStorages = data.storages
      .filter((s) => storageIds.includes(s.id))
      .map((s) => ({ ...s, deleted_at: now, updated_at: now }))
    const updatedItems = items.map((it) => ({ ...it, deleted_at: now, updated_at: now }))

    await store.putLocal('rooms', updatedRoom, { dirty: true })
    await Promise.all(updatedStorages.map((s) => store.putLocal('storages', s, { dirty: true })))
    await Promise.all(updatedItems.map((it) => store.putLocal('items', it, { dirty: true })))

    setData((d) => d && {
      ...d,
      rooms: d.rooms.filter((r) => r.id !== room.id),
      storages: d.storages.filter((s) => !storageIds.includes(s.id)),
      decItems: d.decItems.filter((it) => !storageIds.includes(it.storage_id)),
    })

    try {
      await push()
      showToast(`'${room.name}' 방과 그 안의 수납장을 삭제했어요`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          gap: '12px',
        }}
      >
        <p>연결에 문제가 있어요. 새로고침 해주세요.</p>
        <button type="button" onClick={() => location.reload()} style={{ padding: '10px', fontSize: '16px' }}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <>
      <Header familyId={data.familyId} members={data.members} onToast={showToast} />
      {data.offline && <div className="offline-notice">오프라인 — 저장된 데이터로 표시 중</div>}
      {data.skippedCount > 0 && (
        <div className="offline-notice">일부 물건({data.skippedCount}개)을 해독하지 못해 표시하지 않았어요.</div>
      )}
      <div className="main">
        <Toolbar mode={mode} onModeChange={setMode} palType={palType} onPalTypeChange={setPalType} />
        <MapCanvas
          mode={mode}
          palType={palType}
          rooms={data.rooms}
          storages={data.storages}
          decItems={data.decItems}
          onRoomCreate={handleRoomCreate}
          onStoragePlace={handleStoragePlace}
          onRoomDelete={handleRoomDelete}
          onToast={showToast}
        />
      </div>
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </>
  )
}
