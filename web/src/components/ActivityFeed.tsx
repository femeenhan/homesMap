'use client'

import { useEffect, useState } from 'react'
import type { Activity, FamilyMember } from '@/lib/types'
import { keys } from '@/lib/keys'
import { decryptField } from '@/lib/crypto'
import { buildActivityMessage } from '@/lib/activity'

type Props = {
  activity: Activity[]
  members: FamilyMember[]
}

type Row = { id: string; message: string }

/** 프로토타입 #activityList 이식. 최근 50건을 복호화해 문장으로 표시 — 행 하나가 손상돼도 나머지는 그대로 보여준다. */
export function ActivityFeed({ activity, members }: Props) {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const fdk = keys.getFDK()
      if (!fdk) {
        if (!cancelled) setRows([])
        return
      }
      const recent = [...activity]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 50)
      const decoded = await Promise.all(
        recent.map(async (a): Promise<Row | null> => {
          try {
            const payload = JSON.parse(await decryptField(fdk, a.enc_payload)) as Record<string, string>
            const member = members.find((m) => m.user_id === a.actor_id)
            return { id: a.id, message: buildActivityMessage(a.kind, payload, member) }
          } catch {
            return null // 손상된 블롭/키 불일치 — 이 행만 건너뜀
          }
        })
      )
      if (!cancelled) setRows(decoded.filter((r): r is Row => r !== null))
    })()

    return () => { cancelled = true }
  }, [activity, members])

  return (
    <div className="activity">
      <div className="tb-title">👨‍👩‍👧 가족 활동</div>
      <ul className="activity-list">
        {rows.length > 0 ? (
          rows.map((r) => <li key={r.id}>{r.message}</li>)
        ) : (
          <li>아직 활동이 없어요. 가족이 물건을 등록하면 여기에 표시됩니다.</li>
        )}
      </ul>
    </div>
  )
}
