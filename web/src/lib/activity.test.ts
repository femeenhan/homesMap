import { describe, it, expect } from 'vitest'
import { buildActivityMessage } from './activity'

describe('buildActivityMessage', () => {
  const member = { display_name: '엄마', emoji: '👩' }

  it('item_added 문장', () => {
    const msg = buildActivityMessage('item_added', { roomName: '거실', storageName: '서랍장', itemName: '손톱깎이' }, member)
    expect(msg).toBe("👩 엄마님이 거실 서랍장에 '손톱깎이' 등록")
  })

  it('storage_added 문장', () => {
    const msg = buildActivityMessage('storage_added', { roomName: '거실', storageName: '서랍장' }, member)
    expect(msg).toBe('👩 엄마님이 거실에 서랍장을(를) 만들었어요')
  })

  it('멤버 없을 때 안전(누군가로 대체)', () => {
    const msg = buildActivityMessage('item_added', { roomName: '거실', storageName: '서랍장', itemName: '손톱깎이' })
    expect(msg).toBe("누군가 거실 서랍장에 '손톱깎이' 등록")
  })
})
