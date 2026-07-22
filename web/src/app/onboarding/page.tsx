'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createFamilyWithKey } from '@/lib/keys'

type Status = 'idle' | 'submitting' | 'error'

export default function OnboardingPage() {
  const router = useRouter()
  const [familyName, setFamilyName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      const { recoveryCode } = await createFamilyWithKey(familyName, displayName, passphrase)
      setRecoveryCode(recoveryCode)
    } catch {
      setStatus('error')
      setErrorMsg('가족을 만드는 데 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  async function handleCopy() {
    if (!recoveryCode) return
    try {
      await navigator.clipboard.writeText(recoveryCode)
      setCopied(true)
    } catch {
      // 복사 실패해도 코드는 화면에 그대로 보이므로 무시
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
      <h1 style={{ fontSize: '22px', margin: 0 }}>새 가족 만들기</h1>
      <p style={{ color: 'var(--ink-soft)', margin: '0 0 12px', fontSize: '14px' }}>
        초대받으셨나요? 문자나 카톡으로 받은 초대 링크를 눌러 참여해주세요.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
      >
        <input
          type="text"
          required
          aria-label="가족 이름"
          placeholder="가족 이름 (예: 우리집)"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
        />
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
          disabled={status === 'submitting'}
          style={{ padding: '10px', fontSize: '16px' }}
        >
          {status === 'submitting' ? '만드는 중…' : '가족 만들기'}
        </button>
      </form>

      {errorMsg && <p style={{ color: 'var(--danger)', margin: 0 }}>{errorMsg}</p>}

      {recoveryCode && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '360px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px' }}>복구 코드</h2>
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: '15px',
                wordBreak: 'break-all',
                background: 'var(--bg)',
                padding: '12px',
                borderRadius: '4px',
                margin: 0,
              }}
            >
              {recoveryCode}
            </p>
            <button type="button" onClick={handleCopy} style={{ padding: '10px', fontSize: '16px' }}>
              {copied ? '복사됨' : '복사'}
            </button>
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>
              이 코드를 안전한 곳에 보관하세요. 가족 전원이 잠금 암호를 잊으면 이 코드로만 복구할 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              style={{ padding: '10px', fontSize: '16px' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
