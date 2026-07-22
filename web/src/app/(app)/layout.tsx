import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GUEST_MODE } from '@/lib/guest'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 게스트(테스트) 모드에선 서버측 로그인 리다이렉트를 건너뛴다. 실제 라우팅/게스트 진입은 page.tsx boot가 판단.
  if (!GUEST_MODE) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }
  return <>{children}</>
}
