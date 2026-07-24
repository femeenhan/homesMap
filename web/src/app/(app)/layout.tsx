// 기본 로컬 모드: 서버측 로그인 게이트 없음 — page.tsx가 항상 로컬로 부팅한다.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
