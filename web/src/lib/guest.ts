// 테스트용 게스트 모드: 로그인 없이 앱을 쓸 수 있게 한다.
// 안전장치 — 게스트는 "이 기기 로컬 전용 샌드박스"다. 서버 동기화(push/pull) 없음, 실데이터 접근 없음
// (Supabase RLS가 미인증 요청을 차단, 게스트 FDK는 실가족 키와 달라 실데이터 복호화 불가).
// 실사용자(세션/래핑키 캐시 보유)는 영향 없음 — 게스트는 "인증 세션도 래핑키 캐시도 없는" 방문자에게만 발동.
//
// ⚠️ 끄는 법: GUEST_MODE = false 로 바꾸면 로그인 게이트가 그대로 복원된다.
export const GUEST_MODE = true

export const GUEST_FAMILY_ID = 'guest-local'
export const GUEST_USER_ID = 'guest'
// 고정 32바이트 AES 키(결정적) — 재로딩해도 게스트가 만든 로컬 데이터를 복호화할 수 있게.
export const GUEST_FDK_CODE = 'aG9tZXNtYXAtZ3Vlc3QtdGVzdC1maXhlZC1rZXktMzI'

let active = false
export const guestSession = {
  activate: () => { active = true },
  isActive: () => active,
}
