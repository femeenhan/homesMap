// 기본 로컬 모드: 로그인 없이 이 기기 로컬 전용으로 동작한다(개인용 기본값).
// 서버 동기화(push/pull) 없음 — sync.ts가 guestSession으로 차단. 데이터는 IndexedDB에만.
// 로그인·가족 공유는 확장기능으로 보류 — 복원 시 이 모드 위에 계정 전환/업로드 플로우를 얹는다.

export const GUEST_FAMILY_ID = 'guest-local'
export const GUEST_USER_ID = 'guest'
// 고정 32바이트 AES 키(결정적) — 재로딩해도 게스트가 만든 로컬 데이터를 복호화할 수 있게.
export const GUEST_FDK_CODE = 'aG9tZXNtYXAtZ3Vlc3QtdGVzdC1maXhlZC1rZXktMzI'

let active = false
export const guestSession = {
  activate: () => { active = true },
  isActive: () => active,
}
