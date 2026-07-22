import type { FamilyMember } from './types'
export function buildActivityMessage(kind: string, p: Record<string, string>, member?: Pick<FamilyMember,'display_name'|'emoji'>): string {
  const who = member ? `${member.emoji} ${member.display_name}님이` : '누군가'
  switch (kind) {
    case 'item_added':    return `${who} ${p.roomName} ${p.storageName}에 '${p.itemName}' 등록`
    case 'storage_added': return `${who} ${p.roomName}에 ${p.storageName}을(를) 만들었어요`
    default:              return `${who} 활동했어요`
  }
}
