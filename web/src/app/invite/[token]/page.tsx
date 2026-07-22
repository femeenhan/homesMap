'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { joinFamilyWithKey } from '@/lib/keys'

type Phase = 'checking' | 'invalid' | 'loading-family' | 'family-error' | 'ready' | 'boot-error'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('checking')
  const [fdkCode, setFdkCode] = useState<string | null>(null)
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const match = location.hash.match(/^#k=(.+)$/)
        if (!match || !match[1]) {
          setPhase('invalid')
          return
        }
        const k = match[1]
        // 프래그먼트는 로그인 리다이렉트를 살아남지 못하므로 진입 즉시 스테이징
        sessionStorage.setItem('pendingInvite', JSON.stringify({ token, k }))
        setFdkCode(k)

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setPhase('loading-family')
        const { data, error } = await supabase.rpc('get_invite_family', { p_token: token })
        const row = Array.isArray(data) ? data[0] : null
        if (error || !row) {
          // 죽은 초대 — 스테이징을 지워야 (app)/page.tsx가 여기로 계속 되돌려보내지 않음
          sessionStorage.removeItem('pendingInvite')
          setPhase('family-error')
          return
        }
        setFamilyName(row.family_name)
        setPhase('ready')
      } catch {
        setPhase('boot-error')
      }
    })()
  }, [token, router])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!fdkCode) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      await joinFamilyWithKey(token, fdkCode, displayName, passphrase)
      sessionStorage.removeItem('pendingInvite')
      router.replace('/')
    } catch {
      setErrorMsg('참여에 실패했어요. 초대 링크가 만료되었을 수 있어요.')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '24px',
        gap: '12px',
        maxWidth: '360px',
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '40px' }}>🔍🏠</div>

      {phase === 'checking' && <p>확인 중…</p>}

      {phase === 'invalid' && (
        <>
          <h1 style={{ fontSize: '20px', margin: 0 }}>초대 링크가 올바르지 않아요</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>
            링크를 보낸 가족 구성원에게 새 초대 링크를 다시 받아주세요.
          </p>
        </>
      )}

      {phase === 'loading-family' && <p>가족 정보를 확인하는 중…</p>}

      {phase === 'family-error' && (
        <>
          <h1 style={{ fontSize: '20px', margin: 0 }}>초대 링크가 유효하지 않거나 만료됐어요</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>
            링크를 보낸 가족 구성원에게 새 초대 링크를 다시 받아주세요.
          </p>
        </>
      )}

      {phase === 'boot-error' && (
        <>
          <h1 style={{ fontSize: '20px', margin: 0 }}>연결에 문제가 있어요</h1>
          <p style={{ color: '#666', fontSize: '14px' }}>새로고침 해주세요.</p>
          <button
            type="button"
            onClick={() => location.reload()}
            style={{ padding: '10px', fontSize: '16px' }}
          >
            다시 시도
          </button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <h1 style={{ fontSize: '20px', margin: 0 }}>{familyName} 가족에 참여합니다</h1>

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
          >
            <input
              type="text"
              required
              aria-label="내 이름"
              placeholder="내 이름"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ padding: '10px', fontSize: '16px' }}
            />
            <input
              type="password"
              required
              minLength={8}
              aria-label="잠금 암호"
              placeholder="잠금 암호 (8자 이상)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              style={{ padding: '10px', fontSize: '16px' }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{ padding: '10px', fontSize: '16px' }}
            >
              {submitting ? '참여하는 중…' : '참여하기'}
            </button>
          </form>

          {errorMsg && <p style={{ color: '#c00', margin: 0 }}>{errorMsg}</p>}
        </>
      )}
    </div>
  )
}
