'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keys } from '@/lib/keys'
import { store } from '@/lib/store'
import { createClient } from '@/lib/supabase/client'

export default function AppHomePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
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

      // 2) 이번 세션에 이미 잠금해제된 상태면 바로 앱 화면
      if (keys.hasFDK()) {
        setReady(true)
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
      const { data } = await supabase.from('family_members').select('id').eq('user_id', user.id).limit(1)
      router.replace(data && data.length > 0 ? '/unlock' : '/onboarding')
    })()
  }, [router])

  if (!ready) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
      }}
    >
      <p>지도 준비 중</p>
    </div>
  )
}
