'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { unlockWithPassphrase, unlockWithRecoveryCode } from '@/lib/keys'

export default function UnlockPage() {
  const router = useRouter()
  const [passphrase, setPassphrase] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)
  const [recoveryErrorMsg, setRecoveryErrorMsg] = useState('')

  async function handleUnlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      await unlockWithPassphrase(passphrase)
      router.push('/')
    } catch {
      setErrorMsg('암호가 올바르지 않아요')
      setSubmitting(false)
    }
  }

  async function handleRecover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setRecoverySubmitting(true)
    setRecoveryErrorMsg('')
    try {
      await unlockWithRecoveryCode(recoveryCode, newPassphrase)
      router.push('/')
    } catch {
      setRecoveryErrorMsg('복구코드가 올바르지 않아요')
      setRecoverySubmitting(false)
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
      <h1 style={{ fontSize: '22px', margin: 0 }}>잠금해제</h1>

      <form
        onSubmit={handleUnlock}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
      >
        <input
          type="password"
          required
          aria-label="잠금 암호"
          placeholder="잠금 암호"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          style={{ padding: '10px', fontSize: '16px' }}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{ padding: '10px', fontSize: '16px' }}
        >
          {submitting ? '여는 중…' : '잠금해제'}
        </button>
      </form>

      {errorMsg && (
        <>
          <p style={{ color: 'var(--danger)', margin: 0 }}>{errorMsg}</p>

          <p style={{ color: 'var(--ink-soft)', fontSize: '13px', margin: 0 }}>
            다른 가족 구성원에게 새 초대 링크를 받아 다시 참여할 수도 있어요.
          </p>

          <button
            type="button"
            onClick={() => setShowRecovery((v) => !v)}
            style={{ padding: '8px', fontSize: '14px', background: 'transparent', border: '1px solid var(--line)' }}
          >
            복구코드로 열기
          </button>

          {showRecovery && (
            <form
              onSubmit={handleRecover}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
            >
              <input
                type="text"
                required
                aria-label="복구 코드"
                placeholder="복구 코드"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                style={{ padding: '10px', fontSize: '16px' }}
              />
              <input
                type="password"
                required
                minLength={8}
                aria-label="새 잠금 암호"
                placeholder="새 잠금 암호 (8자 이상)"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                style={{ padding: '10px', fontSize: '16px' }}
              />
              <button
                type="submit"
                disabled={recoverySubmitting}
                style={{ padding: '10px', fontSize: '16px' }}
              >
                {recoverySubmitting ? '복구하는 중…' : '복구코드로 잠금해제'}
              </button>
              {recoveryErrorMsg && <p style={{ color: 'var(--danger)', margin: 0 }}>{recoveryErrorMsg}</p>}
            </form>
          )}
        </>
      )}
    </div>
  )
}
