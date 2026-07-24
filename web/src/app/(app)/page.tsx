'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keys, fetchPrimaryFamilyId } from '@/lib/keys'
import { store } from '@/lib/store'
import { syncNow, push, pull } from '@/lib/sync'
import { decryptField, encryptField, encryptBytes, importFDKCode } from '@/lib/crypto'
import { GUEST_MODE, GUEST_FAMILY_ID, GUEST_USER_ID, GUEST_FDK_CODE, guestSession } from '@/lib/guest'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/useToast'
import { Header } from '@/components/Header'
import { ActivityFeed } from '@/components/ActivityFeed'
import { GridMap } from '@/components/GridMap'
import { HomeTree } from '@/components/HomeTree'
import { DrillDown } from '@/components/DrillDown'
import { useIsMobile } from '@/lib/useIsMobile'
import type { Room, Storage, Item, DecItem, FamilyMember, Activity, ItemDraft, Compartment } from '@/lib/types'
import { descendantIds } from '@/lib/compartments'
import { COLS, ROOM_DEFAULT, STORAGE_DEFAULT, autoPlace, roomInnerGrid, storageRect, migrateLegacyGeometry, type CellRect } from '@/lib/grid'

type BootData = {
  familyId: string
  userId: string
  rooms: Room[]
  storages: Storage[]
  decItems: DecItem[]
  members: FamilyMember[]
  activity: Activity[]
  offline: boolean
  skippedCount: number
}

export default function AppHomePage() {
  const router = useRouter()
  const [data, setData] = useState<BootData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list') // 목록(카테고리 트리)이 기본, 도식화(지도)는 보조
  const isMobile = useIsMobile()
  const [showActivity, setShowActivity] = useState(false)
  const [mapFocusId, setMapFocusId] = useState<string | null>(null)
  const { message: toastMsg, showToast } = useToast()

  // 검색 결과 클릭: 도식화로 전환해 해당 수납장 확대(L2)로 점프
  function handleSearchPick(storageId: string) {
    setView('map')
    setMapFocusId(storageId)
  }

  useEffect(() => {
    (async () => {
      try {
        // 1) 초대 수락 도중 로그인하러 갔다가 돌아온 경우 — 프래그먼트를 되살려 초대 페이지로 복귀
        const pendingRaw = sessionStorage.getItem('pendingInvite')
        if (pendingRaw) {
          try {
            const { token, k } = JSON.parse(pendingRaw)
            if (token && k) {
              router.replace(`/invite/${token}#k=${k}`)
              return
            }
            sessionStorage.removeItem('pendingInvite') // token/k 없는 쓸모없는 항목 — 남겨두면 다음에도 계속 걸림
          } catch {
            sessionStorage.removeItem('pendingInvite')
          }
        }

        // 2) 이번 세션에 이미 잠금해제된 상태면 로컬 스토어를 하이드레이트하고 지도를 렌더
        if (keys.hasFDK()) {
          await boot()
          return
        }

        // 3) 세션 FDK 없음 — 로컬에 래핑 키 캐시가 있으면 오프라인으로도 잠금해제 가능
        const wrapped = await store.getMeta('wrappedKey')
        if (wrapped) {
          router.replace('/unlock')
          return
        }

        // 4) 로컬 캐시도 없음 — 온라인으로 가족 멤버십 조회 후 분기
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          // 세션도 래핑키 캐시도 없는 방문자 — 게스트 모드면 로컬 샌드박스로, 아니면 로그인으로
          if (GUEST_MODE) { await enterGuest(); return }
          router.replace('/login')
          return
        }
        const { data: membershipRows } = await supabase.from('family_members').select('id').eq('user_id', user.id).limit(1)
        router.replace(membershipRows && membershipRows.length > 0 ? '/unlock' : '/onboarding')
      } catch {
        setError('연결에 문제가 있어요. 새로고침 해주세요.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // 게스트(테스트) 진입: 고정 FDK 설정 + 로컬 신원으로 렌더. 서버 동기화·실데이터 접근 없음(로컬 샌드박스).
  async function enterGuest() {
    keys.setFDK(await importFDKCode(GUEST_FDK_CODE))
    guestSession.activate()
    await store.setMeta('familyId', GUEST_FAMILY_ID)
    await store.setMeta('userId', GUEST_USER_ID)
    await loadLocalData(GUEST_FAMILY_ID, GUEST_USER_ID, false)
  }

  // META-FIRST: 로컬 메타에 캐시된 familyId가 있으면 네트워크 없이 즉시 로컬 스토어로 렌더(오프라인 경로).
  // 캐시가 없는 "이 기기 최초 부팅"일 때만 온라인 멤버십 조회가 필요.
  async function boot() {
    const cachedFamilyId = await store.getMeta<string>('familyId')

    if (cachedFamilyId) {
      const cachedUserId = (await store.getMeta<string>('userId')) ?? ''
      try {
        await loadLocalData(cachedFamilyId, cachedUserId, false)
      } catch {
        // 네트워크가 아니라 로컬 IndexedDB 조회/복호화 자체가 실패한 경우 — 네트워크 오류 문구와 구분, 리다이렉트 없음
        setError('저장된 데이터를 불러오지 못했어요. 새로고침 해주세요.')
        return
      }
      await reconcileWithServer(cachedFamilyId)
      return
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const familyId = await fetchPrimaryFamilyId(supabase, user.id)
      if (!familyId) { setError('연결에 문제가 있어요. 새로고침 해주세요.'); return }
      await store.setMeta('familyId', familyId)
      await store.setMeta('userId', user.id)

      let offline = false
      try {
        await syncNow(familyId)
      } catch {
        offline = true // 서버 동기화 실패 — 로컬 스토어 데이터로 그대로 진행(로컬 우선 원칙)
      }
      await loadLocalData(familyId, user.id, offline)
    } catch {
      setError('연결에 문제가 있어요. 새로고침 해주세요.') // 로컬 캐시가 전혀 없는 최초 부팅에서만 사용 — 오프라인 경로(위 분기)는 이 에러 화면을 타지 않음
    }
  }

  // 캐시된 로컬 데이터로 이미 렌더한 뒤 백그라운드에서 서버와 대조.
  // - 네트워크 실패(오프라인) → 화면은 그대로, 오프라인 배지만 표시
  // - 인증된 사용자의 실제(첫 가입) 가족이 캐시와 다름(계정 전환) → 이전 가족의 평문 캐시를 지우고 전환 후 새로 받음
  // - 일치 → 평소처럼 동기화하고 다시 로드
  async function reconcileWithServer(cachedFamilyId: string) {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('오프라인 또는 미인증')
      const authoritativeFamilyId = await fetchPrimaryFamilyId(supabase, user.id)
      if (!authoritativeFamilyId) throw new Error('가족 멤버십 없음')

      if (authoritativeFamilyId !== cachedFamilyId) {
        // 계정 전환: 로컬 스토어가 다른 가족의 평문 데이터를 들고 있으므로 지우고 새 가족으로 전환
        // ponytail: 아래 pull()이 이 시점에 실패하면 화면이 잠시 이전 가족 데이터로 남을 수 있음(로컬 스토어는
        // 이미 정리된 상태) — 다음 부팅에서 자동으로 다시 맞춰짐. 재시도 큐까지는 v1 범위 밖.
        await store.clearFamilyData()
        await store.setMeta('familyId', authoritativeFamilyId)
        await store.setMeta('userId', user.id)
        await pull(authoritativeFamilyId)
        await loadLocalData(authoritativeFamilyId, user.id, false)
        return
      }

      await store.setMeta('userId', user.id) // 같은 기기를 다른 가족 구성원이 잠금해제한 경우 대비 최신화
      await syncNow(cachedFamilyId)
      await loadLocalData(cachedFamilyId, user.id, false)
    } catch {
      setData((d) => d && { ...d, offline: true })
    }
  }

  async function loadLocalData(familyId: string, userId: string, offline: boolean) {
    const fdk = keys.getFDK()
    if (!fdk) return
    const [roomsRaw, storagesRaw, items, members, activity] = await Promise.all([
      store.allActive<Room>('rooms'),
      store.allActive<Storage>('storages'),
      store.allActive<Item>('items'),
      store.getAll<FamilyMember>('members'),
      store.getAll<Activity>('activity'),
    ])
    let rooms = roomsRaw
    let storages = storagesRaw
    // 구 px 좌표(940×600 시절) 1회 셀 변환 — 변경분만 dirty 저장(스펙 §2)
    const mig = migrateLegacyGeometry(rooms, storages)
    if (mig.changedRooms.length > 0 || mig.changedStorages.length > 0) {
      const now = new Date().toISOString()
      const stampedRooms = new Map(mig.changedRooms.map((r) => [r.id, { ...r, updated_at: now }]))
      const stampedStorages = new Map(mig.changedStorages.map((s) => [s.id, { ...s, updated_at: now }]))
      rooms = mig.rooms.map((r) => stampedRooms.get(r.id) ?? r)
      storages = mig.storages.map((s) => stampedStorages.get(s.id) ?? s)
      await Promise.all([
        ...[...stampedRooms.values()].map((r) => store.putLocal('rooms', r, { dirty: true })),
        ...[...stampedStorages.values()].map((s) => store.putLocal('storages', s, { dirty: true })),
      ])
      push().catch(() => {})
    }
    // 손상된 블롭/키 불일치 등으로 한 물건의 복호화가 실패해도 나머지 지도는 정상 렌더 — 실패한 항목만 건너뜀
    const decrypted = await Promise.all(
      items.map(async (it): Promise<DecItem | null> => {
        const { enc_name, enc_memo, ...rest } = it
        try {
          return {
            ...rest,
            name: await decryptField(fdk, enc_name),
            memo: enc_memo ? await decryptField(fdk, enc_memo) : '',
          }
        } catch {
          return null
        }
      })
    )
    const decItems = decrypted.filter((d): d is DecItem => d !== null)
    const skippedCount = decrypted.length - decItems.length
    setData({ familyId, userId, rooms, storages, decItems, members, activity, offline, skippedCount })
  }

  // 앱으로 포커스가 돌아올 때 백그라운드로 재동기화(로컬 우선 — 실패해도 화면은 그대로 유지)
  const familyId = data?.familyId
  const userId = data?.userId
  useEffect(() => {
    if (!familyId || !userId) return
    const onFocus = () => {
      syncNow(familyId).then(() => loadLocalData(familyId, userId, false)).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [familyId, userId])

  // ---------- 지도 편집: 방 그리기 / 수납장 놓기 / 방 삭제(연쇄 소프트삭제) ----------
  // 셋 다 같은 패턴: 로컬에 즉시 반영(로컬 우선) → 낙관적 화면 갱신 → push() 시도(오프라인이면 토스트만)

  // 드로어에서 방 이름/색 편집
  async function handleRoomUpdateMeta(room: Room, patch: { name?: string; color_index?: number }) {
    if (!data) return
    const updated: Room = { ...room, ...patch, updated_at: new Date().toISOString() }
    await store.putLocal('rooms', updated, { dirty: true })
    setData((d) => d && { ...d, rooms: d.rooms.map((r) => (r.id === room.id ? updated : r)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // 드로어에서 수납장 이름 편집
  async function handleStorageRename(storage: Storage, name: string) {
    if (!data) return
    const updated: Storage = { ...storage, name, updated_at: new Date().toISOString() }
    await store.putLocal('storages', updated, { dirty: true })
    setData((d) => d && { ...d, storages: d.storages.map((s) => (s.id === storage.id ? updated : s)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // 칸 목록 변경(추가·이름수정 = 전체 목록 교체).
  async function handleCompartmentsChange(storage: Storage, compartments: Compartment[]) {
    if (!data) return
    const updated: Storage = { ...storage, compartments, updated_at: new Date().toISOString() }
    await store.putLocal('storages', updated, { dirty: true })
    setData((d) => d && { ...d, storages: d.storages.map((s) => (s.id === storage.id ? updated : s)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // 칸 삭제 = 하위 칸 + 그 안 물건까지 연쇄 소프트삭제(트리에서 인라인 확인 후 호출).
  async function handleCompartmentDelete(storage: Storage, id: string) {
    if (!data) return
    const now = new Date().toISOString()
    const comps = storage.compartments ?? []
    const delIds = new Set(descendantIds(comps, id))
    const remaining = comps.filter((c) => !delIds.has(c.id))
    const allItems = await store.allActive<Item>('items')
    const affected = allItems.filter((it) => it.storage_id === storage.id && it.compartment_id != null && delIds.has(it.compartment_id))
    const updatedItems = affected.map((it) => ({ ...it, deleted_at: now, updated_at: now }))
    const updatedStorage: Storage = { ...storage, compartments: remaining, updated_at: now }

    await store.putLocal('storages', updatedStorage, { dirty: true })
    await Promise.all(updatedItems.map((it) => store.putLocal('items', it, { dirty: true })))

    const delItemIds = new Set(updatedItems.map((it) => it.id))
    setData((d) => d && {
      ...d,
      storages: d.storages.map((s) => (s.id === storage.id ? updatedStorage : s)),
      decItems: d.decItems.filter((it) => !delItemIds.has(it.id)),
    })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // 목록 뷰에서 방 추가(기본 격자 위치 부여 → 도식화에서 드래그로 재배치)
  async function handleAddRoom(name: string) {
    if (!data) return
    const pos = autoPlace(
      data.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
      ROOM_DEFAULT, COLS,
    )
    const row: Room = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      name,
      x: pos.x,
      y: pos.y,
      w: ROOM_DEFAULT.w,
      h: ROOM_DEFAULT.h,
      color_index: 0,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('rooms', row, { dirty: true })
    setData((d) => d && { ...d, rooms: [...d.rooms, row] })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // 목록 뷰에서 수납장 추가(방 중앙 근처 기본 위치)
  async function handleAddStorageInList(room: Room, name: string) {
    if (!data) return
    const inner = roomInnerGrid(room)
    const sib = data.storages.filter((s) => s.room_id === room.id).map(storageRect)
    const pos = autoPlace(sib, STORAGE_DEFAULT, inner.cols)
    const row: Storage = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      room_id: room.id,
      type: 'box',
      name,
      x: pos.x,
      y: Math.min(pos.y, inner.rows - STORAGE_DEFAULT.h),
      w: null,
      h: null,
      compartments: [],
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('storages', row, { dirty: true })
    setData((d) => d && { ...d, storages: [...d.storages, row] })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
    void recordActivity(data.familyId, data.userId, 'storage_added', { roomName: room.name, storageName: name })
  }

  // 트리에서 물건 추가(선택된 칸 소속). 사진/메모는 기존 handleItemsAdd 경로 재사용.
  function handleTreeItemAdd(storage: Storage, compartmentId: string | null, draft: { name: string; memo: string; photoFile?: File }) {
    const room = data?.rooms.find((r) => r.id === storage.room_id)
    return handleItemsAdd(storage, room, [{ ...draft, compartmentId }])
  }

  // 방 이동/리사이즈 커밋(편집 모드): 셀 좌표 갱신만 — 수납장은 방-로컬 좌표라 함께 움직일 필요 없음
  async function handleRoomGeometry(room: Room, next: CellRect) {
    if (!data) return
    const updatedRoom: Room = { ...room, ...next, updated_at: new Date().toISOString() }
    await store.putLocal('rooms', updatedRoom, { dirty: true })
    setData((d) => d && { ...d, rooms: d.rooms.map((r) => (r.id === room.id ? updatedRoom : r)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  async function handleStorageGeometry(storage: Storage, next: CellRect) {
    if (!data) return
    const updated: Storage = { ...storage, ...next, updated_at: new Date().toISOString() }
    await store.putLocal('storages', updated, { dirty: true })
    setData((d) => d && { ...d, storages: d.storages.map((s) => (s.id === storage.id ? updated : s)) })
    try { await push() } catch { showToast('오프라인 — 나중에 동기화됩니다') }
  }

  // kind/payload를 일반화 — Task 10의 storage_added와 Task 11의 item_added가 이 한 경로를 공유
  async function recordActivity(familyId: string, actorId: string, kind: string, payload: Record<string, string>) {
    const fdk = keys.getFDK()
    if (!fdk) return
    try {
      const enc_payload = await encryptField(fdk, JSON.stringify(payload))
      const row: Activity = {
        id: crypto.randomUUID(),
        family_id: familyId,
        actor_id: actorId,
        kind,
        enc_payload,
        created_at: new Date().toISOString(),
      }
      // 로컬 에코 먼저(다음 pull 전에도 활동 피드가 즉시 보이도록) — dirty 큐엔 안 올림(activity는 애초에 push 대상이 아님)
      await store.putLocal('activity', row, { dirty: false })
      setData((d) => d && { ...d, activity: [row, ...d.activity] })
      // 서버에도 같은 id/created_at으로 insert — 나중에 pull()의 bulkPut이 같은 id를 덮어써 중복 없음
      await createClient().from('activity').insert(row)
    } catch {
      // 오프라인 등으로 서버 insert가 실패해도 위 로컬 에코는 이미 반영된 뒤라 그대로 유지됨 — 최선노력이라 조용히 스킵
    }
  }

  async function handleRoomDelete(room: Room) {
    if (!data) return
    const now = new Date().toISOString()
    const storageIds = data.storages.filter((s) => s.room_id === room.id).map((s) => s.id)
    // items는 암호화된 형태로만 로컬에 있음 — 복호화하지 않고 deleted_at/updated_at만 바꿔 나머지 필드 보존
    const allItems = await store.allActive<Item>('items')
    const items = allItems.filter((it) => storageIds.includes(it.storage_id))

    const updatedRoom: Room = { ...room, deleted_at: now, updated_at: now }
    const updatedStorages = data.storages
      .filter((s) => storageIds.includes(s.id))
      .map((s) => ({ ...s, deleted_at: now, updated_at: now }))
    const updatedItems = items.map((it) => ({ ...it, deleted_at: now, updated_at: now }))

    await store.putLocal('rooms', updatedRoom, { dirty: true })
    await Promise.all(updatedStorages.map((s) => store.putLocal('storages', s, { dirty: true })))
    await Promise.all(updatedItems.map((it) => store.putLocal('items', it, { dirty: true })))

    setData((d) => d && {
      ...d,
      rooms: d.rooms.filter((r) => r.id !== room.id),
      storages: d.storages.filter((s) => !storageIds.includes(s.id)),
      decItems: d.decItems.filter((it) => !storageIds.includes(it.storage_id)),
    })

    try {
      await push()
      showToast(`'${room.name}' 방과 그 안의 수납장을 삭제했어요`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  // ---------- 상세 패널: 물건 등록/삭제 + 수납장 삭제(연쇄) ----------

  // 사진 다운스케일/압축: 긴 변 최대 1280px로 canvas에 리드로우 후 JPEG 0.8 품질로 재인코딩.
  // 별도 라이브러리 없이 네이티브 canvas만 사용 — 원본을 그대로 암호화하면 업로드 용량이 커짐.
  async function downscaleImage(file: File): Promise<ArrayBuffer> {
    // EXIF 회전 태그 반영 — 없으면 폰 카메라 사진(주 입력 경로)이 옆으로 누워 저장됨
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const maxEdge = 1280
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('사진 변환 실패'))), 'image/jpeg', 0.8)
    )
    return blob.arrayBuffer()
  }

  // draft 배열을 받는 이유: v1은 폼 1건이지만, 훗날 AI가 사진 한 장에서 여러 물건을 인식해
  // 한 번에 넘기는 경로도 이 함수 하나로 처리되도록 하는 이음새(브리프 지시).
  async function handleItemsAdd(storage: Storage, room: Room | undefined, drafts: ItemDraft[]) {
    if (!data) return
    const fdk = keys.getFDK()
    if (!fdk) return
    const supabase = createClient()
    const now = new Date().toISOString()
    const newItems: DecItem[] = []
    let photoFailed = false

    for (const draft of drafts) {
      const itemId = crypto.randomUUID()
      let photo_path: string | null = null
      if (draft.photoFile) {
        try {
          const bytes = await downscaleImage(draft.photoFile)
          const encBlob = await encryptBytes(fdk, bytes)
          const path = `${data.familyId}/${itemId}/${crypto.randomUUID()}`
          const { error: upErr } = await supabase.storage.from('item-photos').upload(path, encBlob)
          if (upErr) throw upErr
          photo_path = path
        } catch {
          // 사진 업로드는 네트워크가 필요 — 실패해도 물건 자체는 사진 없이 저장(브리프 지시)
          photoFailed = true
        }
      }
      const enc_name = await encryptField(fdk, draft.name)
      const enc_memo = draft.memo ? await encryptField(fdk, draft.memo) : null
      const row: Item = {
        id: itemId,
        family_id: data.familyId,
        storage_id: storage.id,
        compartment_id: draft.compartmentId ?? null,
        enc_name,
        enc_memo,
        emoji: '📦',
        photo_path,
        created_by: data.userId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }
      await store.putLocal('items', row, { dirty: true })
      newItems.push({ ...row, name: draft.name, memo: draft.memo })
      void recordActivity(data.familyId, data.userId, 'item_added', {
        roomName: room?.name ?? '', storageName: storage.name, itemName: draft.name,
      })
    }

    setData((d) => d && { ...d, decItems: [...d.decItems, ...newItems] })

    try {
      await push()
      if (photoFailed) showToast('사진 업로드 실패 — 물건은 저장했어요')
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  async function handleItemDelete(item: DecItem) {
    if (!data) return
    const now = new Date().toISOString()
    // 암호화된 원본 행을 로컬에서 읽어 deleted_at/updated_at만 갱신(복호화 없이 나머지 필드 보존)
    const allItems = await store.allActive<Item>('items')
    const stored = allItems.find((it) => it.id === item.id)
    if (!stored) return
    const updated: Item = { ...stored, deleted_at: now, updated_at: now }
    await store.putLocal('items', updated, { dirty: true })

    setData((d) => d && { ...d, decItems: d.decItems.filter((it) => it.id !== item.id) })

    try {
      await push()
      showToast(`'${item.name}' 삭제됨`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  async function handleStorageDelete(storage: Storage) {
    if (!data) return
    const now = new Date().toISOString()
    const allItems = await store.allActive<Item>('items')
    const items = allItems.filter((it) => it.storage_id === storage.id)

    const updatedStorage: Storage = { ...storage, deleted_at: now, updated_at: now }
    const updatedItems = items.map((it) => ({ ...it, deleted_at: now, updated_at: now }))

    await store.putLocal('storages', updatedStorage, { dirty: true })
    await Promise.all(updatedItems.map((it) => store.putLocal('items', it, { dirty: true })))

    setData((d) => d && {
      ...d,
      storages: d.storages.filter((s) => s.id !== storage.id),
      decItems: d.decItems.filter((it) => it.storage_id !== storage.id),
    })

    try {
      await push()
      showToast(`'${storage.name}' 수납장을 삭제했어요`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          gap: '12px',
        }}
      >
        <p>{error}</p>
        <button type="button" onClick={() => location.reload()} style={{ padding: '10px', fontSize: '16px' }}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!data) return null

  const treeProps = {
    rooms: data.rooms, storages: data.storages, decItems: data.decItems, members: data.members,
    onAddRoom: handleAddRoom,
    onRenameRoom: (room: Room, name: string) => handleRoomUpdateMeta(room, { name }),
    onDeleteRoom: handleRoomDelete,
    onAddStorage: handleAddStorageInList,
    onRenameStorage: handleStorageRename,
    onDeleteStorage: handleStorageDelete,
    onCompartmentsChange: handleCompartmentsChange,
    onDeleteCompartment: handleCompartmentDelete,
    onAddItem: handleTreeItemAdd,
    onDeleteItem: handleItemDelete,
  }

  return (
    <>
      <Header
        familyId={data.familyId}
        members={data.members}
        decItems={data.decItems}
        storages={data.storages}
        rooms={data.rooms}
        onToast={showToast}
        onSearchPick={handleSearchPick}
        onActivityClick={() => setShowActivity(true)}
      />
      {data.offline && <div className="offline-notice">오프라인 — 저장된 데이터로 표시 중</div>}
      {data.skippedCount > 0 && (
        <div className="offline-notice">일부 물건({data.skippedCount}개)을 해독하지 못해 표시하지 않았어요.</div>
      )}
      {GUEST_MODE && data.userId === GUEST_USER_ID && (
        <div className="offline-notice">테스트(게스트) 모드 · 로그인 없이 사용 중 — 데이터는 이 기기에만 저장돼요</div>
      )}
      <div className="viewtabs">
        <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>목록</button>
        <button type="button" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>도식화</button>
      </div>
      {view === 'list' ? (
        <div className="tree-view">
          {isMobile ? <DrillDown {...treeProps} /> : <HomeTree {...treeProps} />}
        </div>
      ) : (
        <div className="main">
          <GridMap {...treeProps}
            focusStorageId={mapFocusId} onConsumeFocus={() => setMapFocusId(null)}
            onRoomGeometry={handleRoomGeometry} onStorageGeometry={handleStorageGeometry} />
        </div>
      )}
      {showActivity && (
        <div className="sheet-wrap" onClick={() => setShowActivity(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sheet-close" onClick={() => setShowActivity(false)} aria-label="닫기">✕</button>
            <div className="sheet-body">
              <ActivityFeed activity={data.activity} members={data.members} />
            </div>
          </div>
        </div>
      )}
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </>
  )
}
