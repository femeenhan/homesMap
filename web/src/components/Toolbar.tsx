import type { Activity, FamilyMember, Mode, StorageTypeKey } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import { ActivityFeed } from './ActivityFeed'

const HINTS: Record<Mode, string> = {
  select: '👆 수납장을 클릭하면 그 안의 물건을 보고 등록할 수 있어요. 위쪽 검색창에서 물건을 바로 찾아보세요.',
  room: '✏️ 맵 위에서 드래그하면 방이 그려져요. 그린 뒤 이름과 색을 정해주세요.',
  storage: '📦 아래에서 수납장 종류를 고른 뒤, 방 안쪽을 클릭해서 배치하세요.',
}

const MODE_BUTTONS: { mode: Mode; em: string; label: string }[] = [
  { mode: 'select', em: '👆', label: '둘러보기' },
  { mode: 'room', em: '✏️', label: '방 그리기' },
  { mode: 'storage', em: '📦', label: '수납장 놓기' },
]

type Props = {
  mode: Mode
  onModeChange: (mode: Mode) => void
  palType: StorageTypeKey
  onPalTypeChange: (type: StorageTypeKey) => void
  activity: Activity[]
  members: FamilyMember[]
}

export function Toolbar({ mode, onModeChange, palType, onPalTypeChange, activity, members }: Props) {
  return (
    <aside className="toolbar">
      <div>
        <div className="tb-title">만들기 도구</div>
        {MODE_BUTTONS.map((b) => (
          <button
            key={b.mode}
            type="button"
            className={`mode-btn${mode === b.mode ? ' active' : ''}`}
            onClick={() => onModeChange(b.mode)}
          >
            <span className="em">{b.em}</span>
            {b.label}
          </button>
        ))}
        <div className={`storage-palette${mode === 'storage' ? ' open' : ''}`}>
          {STORAGE_TYPES.map((s) => (
            <button
              key={s.type}
              type="button"
              className={`pal-btn${s.type === palType ? ' active' : ''}`}
              onClick={() => onPalTypeChange(s.type)}
            >
              <span className="em">{s.em}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hint">{HINTS[mode]}</div>
      <ActivityFeed activity={activity} members={members} />
    </aside>
  )
}
