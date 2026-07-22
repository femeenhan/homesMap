'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keys } from '@/lib/keys'
import { store } from '@/lib/store'
import { syncNow } from '@/lib/sync'
import { decryptField } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { MapCanvas } from '@/components/MapCanvas'
import type { Room, Storage, Item, DecItem, FamilyMember } from '@/lib/types'

type BootData = {
  familyId: string
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
    await loadLocalData(familyId, offline)
  }

  async function loadLocalData(familyId: string, offline: boolean) {
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
    setData({ familyId, rooms, storages, decItems, members, offline, skippedCount })
  }

  // 앱으로 포커스가 돌아올 때 백그라운드로 재동기화(로컬 우선 — 실패해도 화면은 그대로 유지)
  const familyId = data?.familyId
  useEffect(() => {
    if (!familyId) return
    const onFocus = () => {
      syncNow(familyId).then(() => loadLocalData(familyId, false)).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [familyId])

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
      <Header familyId={data.familyId} members={data.members} />
      {data.offline && <div className="offline-notice">오프라인 — 저장된 데이터로 표시 중</div>}
      {data.skippedCount > 0 && (
        <div className="offline-notice">일부 물건({data.skippedCount}개)을 해독하지 못해 표시하지 않았어요.</div>
      )}
      <div className="main">
        <MapCanvas rooms={data.rooms} storages={data.storages} decItems={data.decItems} />
      </div>
    </>
  )
}
