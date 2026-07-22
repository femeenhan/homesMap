import type { Activity, FamilyMember, Tool, StorageTypeKey } from '@/lib/types'
import { STORAGE_TYPES } from '@/lib/types'
import { ActivityFeed } from './ActivityFeed'

const HINTS: Record<Tool, string> = {
  none: '👆 수납장을 탭하면 물건을 보고 등록해요. 방을 탭하면 이름·색을 바꿀 수 있어요. 위 검색창에서 물건을 바로 찾아보세요.',
  'add-room': '✏️ 맵에서 드래그해 방을 그리세요. 그리면 바로 이름을 정할 수 있어요.',
  'add-storage': '📦 종류를 고른 뒤, 방 안쪽을 탭해서 수납장을 놓으세요.',
}

// 1회성 생성 액션. 다시 누르면 취소(none). 완료하면 각 핸들러가 자동으로 none으로 되돌린다.
const ACTIONS: { tool: Exclude<Tool, 'none'>; em: string; label: string }[] = [
  { tool: 'add-room', em: '✏️', label: '방 추가' },
  { tool: 'add-storage', em: '📦', label: '수납장 추가' },
]

type Props = {
  tool: Tool
  onToolChange: (tool: Tool) => void
  palType: StorageTypeKey
  onPalTypeChange: (type: StorageTypeKey) => void
  activity: Activity[]
  members: FamilyMember[]
}

export function Toolbar({ tool, onToolChange, palType, onPalTypeChange, activity, members }: Props) {
  return (
    <aside className="toolbar">
      <div>
        <div className="tb-title">만들기 도구</div>
        {ACTIONS.map((b) => (
          <button
            key={b.tool}
            type="button"
            className={`mode-btn${tool === b.tool ? ' active' : ''}`}
            onClick={() => onToolChange(tool === b.tool ? 'none' : b.tool)}
          >
            <span className="em">{b.em}</span>
            {b.label}
          </button>
        ))}
        <div className={`storage-palette${tool === 'add-storage' ? ' open' : ''}`}>
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
      <div className="hint">{HINTS[tool]}</div>
      <ActivityFeed activity={activity} members={members} />
    </aside>
  )
}
