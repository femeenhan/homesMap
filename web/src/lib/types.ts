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
export type Storage = {
  id: UUID; family_id: UUID; room_id: UUID; type: StorageTypeKey; name: string
  x: number; y: number; updated_at: string; deleted_at: string | null
}
// 서버 저장 형태(암호블롭). 앱 메모리에서는 복호화된 DecItem 사용.
export type Item = {
  id: UUID; family_id: UUID; storage_id: UUID; enc_name: string; enc_memo: string | null
  emoji: string; photo_path: string | null; created_by: UUID
  created_at: string; updated_at: string; deleted_at: string | null
}
export type DecItem = Omit<Item, 'enc_name' | 'enc_memo'> & { name: string; memo: string }
// 물건 등록 폼 제출 단위. 배열로 다루는 이유: v1은 폼 1건이지만, 훗날 사진 한 장에서 여러 물건을
// AI로 인식해 한 번에 확인·등록하는 기능이 이 자리(같은 제출 경로)에 그대로 꽂히도록 하기 위함.
export type ItemDraft = { name: string; memo: string; photoFile?: File }
export type Activity = { id: UUID; family_id: UUID; actor_id: UUID; kind: string; enc_payload: string; created_at: string }

export type Mode = 'select' | 'room' | 'storage'

export type StorageTypeKey = 'drawer' | 'closet' | 'shelf' | 'fridge' | 'box' | 'shoe'
export const STORAGE_TYPES: { type: StorageTypeKey; em: string; label: string }[] = [
  { type: 'drawer', em: '🗄️', label: '서랍장' }, { type: 'closet', em: '🚪', label: '옷장' },
  { type: 'shelf',  em: '📚', label: '선반' },   { type: 'fridge', em: '🧊', label: '냉장고' },
  { type: 'box',    em: '📦', label: '수납박스' }, { type: 'shoe',  em: '👟', label: '신발장' },
]
export const ROOM_COLORS = [
  { fill: 'rgba(122,168,116,.16)', border: '#7aa874', name: '초록' },
  { fill: 'rgba(107,142,181,.16)', border: '#6b8eb5', name: '파랑' },
  { fill: 'rgba(224,158,84,.18)',  border: '#d99a50', name: '주황' },
  { fill: 'rgba(186,124,168,.16)', border: '#ba7ca8', name: '분홍' },
  { fill: 'rgba(153,143,101,.18)', border: '#a79a63', name: '카키' },
]
