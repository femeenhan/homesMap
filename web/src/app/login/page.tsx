'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (new URLSearchParams(location.search).get('error') === 'auth') {
      setErrorMsg('로그인 링크가 만료되었거나 이미 사용되었어요. 다시 시도해주세요.')
    }
  }, [])

  async function handleEmailLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMsg('로그인 링크 전송에 실패했어요. 잠시 후 다시 시도해주세요.')
      return
    }

    setStatus('sent')
  }

  async function handleOAuthLogin(provider: 'kakao' | 'google') {
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setErrorMsg('로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
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
      <h1 style={{ fontSize: '24px', margin: 0 }}>홈즈맵</h1>
      <p style={{ color: '#666', margin: '0 0 12px' }}>우리집 물건 지도</p>

      {status === 'sent' ? (
        <p>메일로 로그인 링크를 보냈어요. 확인해주세요.</p>
      ) : (
        <form
          onSubmit={handleEmailLogin}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
        >
          <input
            type="email"
            required
            aria-label="이메일 주소"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            style={{ padding: '10px', fontSize: '16px' }}
          >
            {status === 'sending' ? '전송 중…' : '이메일로 로그인'}
          </button>
        </form>
      )}

      {errorMsg && <p style={{ color: '#c00', margin: 0 }}>{errorMsg}</p>}

      <div style={{ width: '100%', borderTop: '1px solid #ddd', margin: '12px 0' }} />

      <button
        type="button"
        onClick={() => handleOAuthLogin('kakao')}
        style={{ width: '100%', padding: '10px', fontSize: '16px', background: '#FEE500' }}
      >
        카카오로 로그인
      </button>
      <button
        type="button"
        onClick={() => handleOAuthLogin('google')}
        style={{ width: '100%', padding: '10px', fontSize: '16px' }}
      >
        구글로 로그인
      </button>
    </div>
  )
}
