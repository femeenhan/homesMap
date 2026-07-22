import { createClient } from '@/lib/supabase/client'
import { mergeRows } from './merge'
import { store } from './store'
import type { Room, Storage, Item } from './types'

type SyncRow = Room | Storage | Item

/** 전량 pull: 가족 데이터가 수백 행 수준이라 증분 워터마크 대신 전체를 받아 LWW 병합.
 *  ponytail: 증분(updated_at > lastSync)은 클라이언트 시계 스큐로 다른 기기의 push를 영영 못 받는
 *  누락 위험이 있어 채택 안 함. 수천 행 넘으면 서버 스탬프 트리거 + 증분으로 승격 */
export async function pull(familyId: string) {
  const supabase = createClient()
  for (const t of ['rooms', 'storages', 'items'] as const) {
    const { data, error } = await supabase.from(t).select('*').eq('family_id', familyId)
    if (error) throw error
    const local = await store.getAll<SyncRow>(t)
    await store.bulkPut(t, mergeRows(local, (data ?? []) as SyncRow[]))
  }
  const { data: act, error: aErr } = await supabase.from('activity').select('*')
    .eq('family_id', familyId).order('created_at', { ascending: false }).limit(50)
  if (aErr) throw aErr
  await store.bulkPut('activity', act ?? [])
  // 멤버 목록도 캐시 → 오프라인에서 헤더·활동피드에 이름 표시 가능
  const { data: members, error: mErr } = await supabase.from('family_members').select('*').eq('family_id', familyId)
  if (mErr) throw mErr
  await store.bulkPut('members', members ?? [])
}

/** 로컬 dirty 행을 서버로 upsert */
export async function push() {
  const supabase = createClient()
  for (const t of ['rooms', 'storages', 'items'] as const) {
    const dirty = await store.dirtyRows(t)
    if (!dirty.length) continue
    const { error } = await supabase.from(t).upsert(dirty)
    if (error) throw error
    await store.clearDirty(t, dirty.map(r => r.id))
  }
  // activity는 생성 시 즉시 insert(별도 dirty 큐 불필요) — Task 10·11에서 처리
}

export async function syncNow(familyId: string) { await push(); await pull(familyId) }
