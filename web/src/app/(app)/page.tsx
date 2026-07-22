'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { keys } from '@/lib/keys'
import { store } from '@/lib/store'
import { syncNow, push } from '@/lib/sync'
import { decryptField, encryptField, encryptBytes } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/lib/useToast'
import { Header } from '@/components/Header'
import { Toolbar } from '@/components/Toolbar'
import { MapCanvas } from '@/components/MapCanvas'
import { DetailPanel } from '@/components/DetailPanel'
import type { Room, Storage, Item, DecItem, FamilyMember, Mode, StorageTypeKey, Activity, ItemDraft } from '@/lib/types'
import type { Pt, Rect } from '@/lib/geometry'

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
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('select')
  const [palType, setPalType] = useState<StorageTypeKey>('drawer')
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(null)
  const [flashStorageId, setFlashStorageId] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { message: toastMsg, showToast } = useToast()

  // 검색 결과 클릭: 둘러보기 모드로 전환 + 패널 열기 + 지도에 4초간 flash(프로토타입 flashStorage 이식)
  function handleSearchPick(storageId: string) {
    setMode('select')
    setSelectedStorageId(storageId)
    setFlashStorageId(storageId)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashStorageId(null), 4000)
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
          router.replace('/login')
          return
        }
        const { data: membershipRows } = await supabase.from('family_members').select('id').eq('user_id', user.id).limit(1)
        router.replace(membershipRows && membershipRows.length > 0 ? '/unlock' : '/onboarding')
      } catch {
        setError(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function boot() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: fm } = await supabase.from('family_members').select('family_id').eq('user_id', user.id).limit(1)
    const familyId = fm?.[0]?.family_id
    if (!familyId) { setError(true); return }

    let offline = false
    try {
      await syncNow(familyId)
    } catch {
      offline = true // 서버 동기화 실패 — 로컬 스토어 데이터로 그대로 진행(로컬 우선 원칙)
    }
    await loadLocalData(familyId, user.id, offline)
  }

  async function loadLocalData(familyId: string, userId: string, offline: boolean) {
    const fdk = keys.getFDK()
    if (!fdk) return
    const [rooms, storages, items, members, activity] = await Promise.all([
      store.allActive<Room>('rooms'),
      store.allActive<Storage>('storages'),
      store.allActive<Item>('items'),
      store.getAll<FamilyMember>('members'),
      store.getAll<Activity>('activity'),
    ])
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

  async function handleRoomCreate(rect: Rect, name: string, colorIndex: number) {
    if (!data) return
    const row: Room = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      name,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
      color_index: colorIndex,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('rooms', row, { dirty: true })
    setData((d) => d && { ...d, rooms: [...d.rooms, row] })
    setMode('storage')
    try {
      await push()
      showToast(`'${name}' 방이 생겼어요! 이제 수납장을 놓아보세요`)
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
  }

  async function handleStoragePlace(room: Room, point: Pt, name: string) {
    if (!data) return
    const row: Storage = {
      id: crypto.randomUUID(),
      family_id: data.familyId,
      room_id: room.id,
      type: palType,
      name,
      x: Math.round(point.x),
      y: Math.round(point.y),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }
    await store.putLocal('storages', row, { dirty: true })
    setData((d) => d && { ...d, storages: [...d.storages, row] })
    try {
      await push()
    } catch {
      showToast('오프라인 — 나중에 동기화됩니다')
    }
    // 활동 기록은 최선노력(best-effort) — 실패(오프라인 등)해도 조용히 무시, UI를 막지 않음
    void recordActivity(data.familyId, data.userId, 'storage_added', { roomName: room.name, storageName: name })
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

    setSelectedStorageId(null)
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
        <p>연결에 문제가 있어요. 새로고침 해주세요.</p>
        <button type="button" onClick={() => location.reload()} style={{ padding: '10px', fontSize: '16px' }}>
          다시 시도
        </button>
      </div>
    )
  }

  if (!data) return null

  const selectedStorage = data.storages.find((s) => s.id === selectedStorageId)
  const selectedRoom = selectedStorage ? data.rooms.find((r) => r.id === selectedStorage.room_id) : undefined
  const selectedItems = selectedStorage ? data.decItems.filter((it) => it.storage_id === selectedStorage.id) : []

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
      />
      {data.offline && <div className="offline-notice">오프라인 — 저장된 데이터로 표시 중</div>}
      {data.skippedCount > 0 && (
        <div className="offline-notice">일부 물건({data.skippedCount}개)을 해독하지 못해 표시하지 않았어요.</div>
      )}
      <div className="main">
        <Toolbar
          mode={mode}
          onModeChange={setMode}
          palType={palType}
          onPalTypeChange={setPalType}
          activity={data.activity}
          members={data.members}
        />
        <MapCanvas
          mode={mode}
          palType={palType}
          rooms={data.rooms}
          storages={data.storages}
          decItems={data.decItems}
          onStorageClick={setSelectedStorageId}
          onRoomCreate={handleRoomCreate}
          onStoragePlace={handleStoragePlace}
          onRoomDelete={handleRoomDelete}
          onToast={showToast}
          flashStorageId={flashStorageId}
        />
        {selectedStorage && (
          <DetailPanel
            key={selectedStorage.id}
            storage={selectedStorage}
            room={selectedRoom}
            items={selectedItems}
            members={data.members}
            onClose={() => setSelectedStorageId(null)}
            onItemsAdd={(drafts) => handleItemsAdd(selectedStorage, selectedRoom, drafts)}
            onItemDelete={handleItemDelete}
            onStorageDelete={handleStorageDelete}
          />
        )}
      </div>
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </>
  )
}
