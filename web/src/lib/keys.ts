import { createClient } from '@/lib/supabase/client'
import { store } from './store'
import { generateFDK, wrapFDK, unwrapFDK, importFDKCode, exportFDKCode, decryptField } from './crypto'
import type { Item, Activity } from './types'

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
  await store.setMeta('familyId', fam.id)         // 오프라인 부팅용 신원 캐시(비밀 아님)
  await store.setMeta('userId', user.id)
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
  await store.setMeta('familyId', familyId as string)  // 오프라인 부팅용 신원 캐시(비밀 아님)
  const { data: { user } } = await supabase.auth.getUser()
  if (user) await store.setMeta('userId', user.id)
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
    const { data } = await supabase.from('family_members').select('wrapped_family_key').eq('user_id', user.id)
      .order('joined_at', { ascending: true }).limit(1).maybeSingle()
    wrapped = data?.wrapped_family_key ?? null
    if (wrapped) await store.setMeta('wrappedKey', wrapped)
  }
  if (!wrapped) throw new Error('래핑 키 없음')
  keys.setFDK(await unwrapFDK(wrapped, passphrase))  // 틀리면 throw
}

// 로컬 캐시 먼저(오프라인 가능) → 없으면 네트워크(RLS로 내 가족 행만 조회) — 둘 다 없으면 아직 아무것도 암호화 안 된 새 가족
async function findExistingCiphertext(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const localItem = (await store.getAll<Item>('items')).find((it) => it.enc_name)
  if (localItem) return localItem.enc_name
  const localActivity = (await store.getAll<Activity>('activity')).find((a) => a.enc_payload)
  if (localActivity) return localActivity.enc_payload
  const { data: item } = await supabase.from('items').select('enc_name').limit(1).maybeSingle()
  if (item?.enc_name) return item.enc_name
  const { data: act } = await supabase.from('activity').select('enc_payload').limit(1).maybeSingle()
  return act?.enc_payload ?? null
}

/** 복구코드(원본 FDK)로 복원 + 새 패스프레이즈로 재래핑 저장.
 *  43자 base64url 문자열은 아무거나 유효한 AES 키로 파싱되므로, 오타여도 조용히 "성공"해 서버/로컬의
 *  진짜 래핑 키를 덮어써 버릴 수 있음 — 덮어쓰기 전에 기존 암호문이 있으면 실제로 복호화해 검증한다. */
export async function unlockWithRecoveryCode(code: string, newPassphrase: string): Promise<void> {
  const fdk = await importFDKCode(code.trim())
  const supabase = createClient()

  const testBlob = await findExistingCiphertext(supabase)
  if (testBlob) {
    try {
      await decryptField(fdk, testBlob)
    } catch {
      throw new Error('복구코드가 올바르지 않아요.')
    }
  }

  const wrapped = await wrapFDK(fdk, newPassphrase)
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
