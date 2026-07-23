'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)'
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => false

// SSR/첫 렌더는 false(데스크톱)로 시작해 마운트 후 실제 값으로 보정. 767px 이하 = 모바일.
// useEffect+setState 대신 useSyncExternalStore 사용(react-hooks/set-state-in-effect 회피, 외부 브라우저 API 구독의 정석 패턴).
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
