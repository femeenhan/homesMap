// 기본 로컬 모드: 서버측 로그인 게이트 없음 — page.tsx가 항상 로컬로 부팅한다.
// .app-shell: 넓은 화면(웹)에서 앱 폭을 제한한 중앙 컬럼 — 모바일-퍼스트 레이아웃 유지
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">{children}</div>
}
