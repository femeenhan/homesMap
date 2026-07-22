import { createClient } from '@/lib/supabase/client'
import { store } from './store'
import { generateFDK, wrapFDK, unwrapFDK, importFDKCode, exportFDKCode } from './crypto'

let sessionFDK: CryptoKey | null = null           // 메모리에만. 새로고침 시 unlock 필요
export const keys = {
  getFDK: () => sessionFDK,
  hasFDK: () => sessionFDK !== null,
  setFDK: (k: CryptoKey) => { sessionFDK = k },
}

/** 새 가족: FDK 생성 → owner 멤버 행에 래핑 저장 → 복구코드(원본 FDK) 반환(1회 표시용) */
export async function createFamilyWithKey(familyName: string, displayName: string, passphrase: string): Promise<{ familyId: string; recoveryCode: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const fdk = await generateFDK()
  const wrapped = await wrapFDK(fdk, passphrase)
  const { data: fam, error } = await supabase.from('families').insert({ name: familyName, created_by: user.id }).select('id').single()
  if (error || !fam) throw error ?? new Error('가족 생성 실패')
  const { error: mErr } = await supabase.from('family_members')
    .insert({ family_id: fam.id, user_id: user.id, display_name: displayName, role: 'owner', wrapped_family_key: wrapped })
  if (mErr) throw mErr
  await store.setMeta('wrappedKey', wrapped)      // 오프라인 잠금해제용 로컬 캐시(래핑=암호화 상태라 안전)
  keys.setFDK(fdk)
  return { familyId: fam.id, recoveryCode: await exportFDKCode(fdk) }
}

/** 초대 참여: 프래그먼트의 FDK코드 복원 → 내 패스프레이즈로 래핑 → 토큰 검증 RPC로 멤버 등록 */
export async function joinFamilyWithKey(token: string, fdkCode: string, displayName: string, passphrase: string): Promise<string> {
  const supabase = createClient()
  const fdk = await importFDKCode(fdkCode)
  const wrapped = await wrapFDK(fdk, passphrase)
  const { data: familyId, error } = await supabase.rpc('join_family', { p_token: token, p_display_name: displayName, p_wrapped_key: wrapped })
  if (error || !familyId) throw error ?? new Error('유효하지 않거나 만료된 초대')
  await store.setMeta('wrappedKey', wrapped)
  keys.setFDK(fdk)
  return familyId as string
}

/** 잠금해제: 로컬 캐시 우선(오프라인 가능) → 없으면 서버에서 래핑 키 조회 후 캐시 */
export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  let wrapped: string | null = (await store.getMeta('wrappedKey')) ?? null
  if (!wrapped) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('unauthenticated')
    const { data } = await supabase.from('family_members').select('wrapped_family_key').eq('user_id', user.id).limit(1).maybeSingle()
    wrapped = data?.wrapped_family_key ?? null
    if (wrapped) await store.setMeta('wrappedKey', wrapped)
  }
  if (!wrapped) throw new Error('래핑 키 없음')
  keys.setFDK(await unwrapFDK(wrapped, passphrase))  // 틀리면 throw
}

/** 복구코드(원본 FDK)로 복원 + 새 패스프레이즈로 재래핑 저장 */
export async function unlockWithRecoveryCode(code: string, newPassphrase: string): Promise<void> {
  const fdk = await importFDKCode(code.trim())
  const wrapped = await wrapFDK(fdk, newPassphrase)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) await supabase.from('family_members').update({ wrapped_family_key: wrapped }).eq('user_id', user.id)
  await store.setMeta('wrappedKey', wrapped)
  keys.setFDK(fdk)
}

/** 초대 링크 생성: token 발급 + FDK를 URL 프래그먼트로(서버 미전송) */
export async function createInviteLink(familyId: string): Promise<string> {
  const fdk = keys.getFDK()
  if (!fdk) throw new Error('locked')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('family_invites')
    .insert({ family_id: familyId, created_by: user!.id }).select('token').single()
  if (error || !data) throw error ?? new Error('초대 생성 실패')
  return `${location.origin}/invite/${data.token}#k=${await exportFDKCode(fdk)}`
}
