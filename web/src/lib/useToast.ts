'use client'

import { useRef, useState } from 'react'

/** 2.4초 후 자동 소멸하는 토스트. 화면당 1회 생성해 여러 컴포넌트가 공유(showToast를 prop으로 전달) —
 *  각자 따로 들면 토스트 div가 여러 개 겹쳐 뜬다. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setMessage(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2400)
  }

  return { message, showToast }
}
