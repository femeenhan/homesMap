export type UUID = string
export type Family = { id: UUID; name: string; created_by: UUID; created_at: string }
export type FamilyMember = {
  id: UUID; family_id: UUID; user_id: UUID; display_name: string
  emoji: string; color: string; role: 'owner' | 'member'; wrapped_family_key: string | null; joined_at: string
}
export type Room = {
  id: UUID; family_id: UUID; name: string; x: number; y: number; w: number; h: number
  color_index: number; updated_at: string; deleted_at: string | null
}
// 수납장 칸. 방·수납장 이름과 같은 급의 구조 라벨이라 평문(암호화 안 함). 수납장 행에 목록으로 저장.
// parent_id로 무한 중첩(트리). null/undefined = 수납장 직속 최상위 칸.
export type Compartment = { id: UUID; name: string; parent_id?: UUID | null }
export type Storage = {
  id: UUID; family_id: UUID; room_id: UUID; type: StorageTypeKey; name: string
  x: number; y: number; w?: number | null; h?: number | null; compartments: Compartment[]; updated_at: string; deleted_at: string | null
}
// 서버 저장 형태(암호블롭). 앱 메모리에서는 복호화된 DecItem 사용.
export type Item = {
  id: UUID; family_id: UUID; storage_id: UUID; compartment_id: UUID | null; enc_name: string; enc_memo: string | null
  emoji: string; photo_path: string | null; created_by: UUID
  created_at: string; updated_at: string; deleted_at: string | null
}
export type DecItem = Omit<Item, 'enc_name' | 'enc_memo'> & { name: string; memo: string }
// 물건 등록 폼 제출 단위. 배열로 다루는 이유: v1은 폼 1건이지만, 훗날 사진 한 장에서 여러 물건을
// AI로 인식해 한 번에 확인·등록하는 기능이 이 자리(같은 제출 경로)에 그대로 꽂히도록 하기 위함.
export type ItemDraft = { name: string; memo: string; compartmentId?: string | null; photoFile?: File }
export type Activity = { id: UUID; family_id: UUID; actor_id: UUID; kind: string; enc_payload: string; created_at: string }

// 기본은 'none'(직접조작: 탭=선택/열기, 드래그=이동). add-*는 1회성 생성 액션으로, 완료하면 스스로 none으로 돌아온다.
export type Tool = 'none' | 'add-room' | 'add-storage'

export type StorageTypeKey = 'drawer' | 'closet' | 'shelf' | 'fridge' | 'box' | 'shoe'
// Clay 브랜드 팔레트(피치·라벤더·민트·오커·코랄). 반투명 fill이라 라이트/다크 양쪽에서 tint로 동작,
// border는 라벨 텍스트에도 쓰이므로 두 배경 모두에서 읽히는 중간 채도.
export const ROOM_COLORS = [
  { fill: 'rgba(255,176,132,.22)', border: '#e08a52', name: '피치' },
  { fill: 'rgba(184,164,237,.22)', border: '#8f77d8', name: '라벤더' },
  { fill: 'rgba(164,212,197,.24)', border: '#5aa88f', name: '민트' },
  { fill: 'rgba(232,185,74,.22)',  border: '#c99a27', name: '오커' },
  { fill: 'rgba(255,107,90,.18)',  border: '#e0553f', name: '코랄' },
]
