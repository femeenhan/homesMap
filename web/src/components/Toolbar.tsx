import type { Activity, FamilyMember, Tool } from '@/lib/types'
import { ActivityFeed } from './ActivityFeed'

const HINTS: Record<Tool, string> = {
  none: '👆 수납장을 탭하면 물건을 보고 등록해요. 방을 탭하면 이름·색을 바꿀 수 있어요.',
  'add-room': '✏️ 맵에서 드래그해 방을 그리세요.',
  'add-storage': '📦 방 안쪽을 탭해서 수납장을 놓으세요.',
}

// 1회성 생성 액션(도식화 뷰). 다시 누르면 취소(none). 완료하면 각 핸들러가 자동으로 none으로 되돌린다.
const ACTIONS: { tool: Exclude<Tool, 'none'>; em: string; label: string }[] = [
  { tool: 'add-room', em: '✏️', label: '방 추가' },
  { tool: 'add-storage', em: '📦', label: '수납장 추가' },
]

type Props = {
  tool: Tool
  onToolChange: (tool: Tool) => void
  activity: Activity[]
  members: FamilyMember[]
}

export function Toolbar({ tool, onToolChange, activity, members }: Props) {
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
      </div>
      <div className="hint">{HINTS[tool]}</div>
      <ActivityFeed activity={activity} members={members} />
    </aside>
  )
}
