export type Syncable = { id: string; updated_at: string }
/** id별로 updated_at이 큰 쪽을 채택(LWW). ponytail: 클라이언트 시계 스탬프 기준, 스큐로 구식 쓰기가 이길 수 있음은 알려진 한계 */
export function mergeRows<T extends Syncable>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map(r => [r.id, r]))
  for (const inc of incoming) {
    const cur = byId.get(inc.id)
    // 서버('+00:00')와 클라('Z')의 ISO 표기가 달라 문자열 비교는 불가 → 파싱 비교
    if (!cur || Date.parse(inc.updated_at) >= Date.parse(cur.updated_at)) byId.set(inc.id, inc)
  }
  return [...byId.values()]
}
