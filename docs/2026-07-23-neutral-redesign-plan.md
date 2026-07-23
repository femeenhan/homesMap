# 뉴트럴 리디자인(목록 라운드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-23-neutral-redesign-design.md` 구현 — Clay 웜 크림·이모지 UI를 뉴트럴(흰/회색+블루) + 라인 SVG 아이콘으로 교체하고, 모바일(<768px) 목록을 드릴다운으로 전환.

**Architecture:** (1) `globals.css` 토큰 값 교체로 전역 재스킨, (2) 의존성 없는 `Icon.tsx` 인라인 SVG로 이모지 대체, (3) 모바일은 새 `DrillDown.tsx`(경로 스택 state + 순수함수 `resolvePath`), 데스크톱은 기존 `HomeTree` 아코디언 유지 — `useIsMobile`(matchMedia 767px)로 분기.

**Tech Stack:** Next.js 16 / React 19 / vanilla CSS(전역 토큰) / vitest. **새 의존성 추가 금지.**

## Global Constraints

- 작업 디렉터리: `web/` (모든 명령은 `web/`에서 실행)
- 새 npm 의존성 추가 금지 — 아이콘은 인라인 SVG
- 데이터 모델·`store`/`sync`·부모 콜백 시그니처 무변경
- 카피는 한국어, 기존 문구 유지(이모지만 제거)
- **맵 라운드 범위(건드리지 말 것):** `MapCanvas.tsx`·`DetailPanel.tsx`·`RoomDetail.tsx`·`StorageBadge.tsx`·`ActivityFeed.tsx`의 이모지, `types.ts`의 `STORAGE_TYPES.em`·`ROOM_COLORS`, `globals.css` `.map.empty::after`의 ✏️, `.mode-btn`/`.pal-btn` — 색은 토큰으로 자동 반영되게만 두고 코드 수정 금지
- 멤버 아바타 emoji(`member-chip .em`)는 사용자 데이터 — 유지
- 각 태스크 완료 시 커밋(메시지 아래 명시), push는 Task 4에서 한 번
- 검증 명령: `npx tsc --noEmit` / `npm run lint` / `npm test` (기존 16개 테스트 통과 유지)

---

### Task 1: 디자인 토큰 뉴트럴 교체 + CSS 재스킨

**Files:**
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: 없음
- Produces: CSS 변수 `--panel`(신규 인셋 배경). 이후 태스크의 CSS가 `var(--panel)` 사용.

- [ ] **Step 1: `:root` 토큰 블록 교체**

`globals.css` 1–38행(라이트 `:root` + 다크 `@media` 블록)을 아래로 통째 교체:

```css
:root{
  /* 뉴트럴 팔레트 (라이트) */
  --bg:#ffffff;          /* 페이지 바닥 */
  --paper:#ffffff;       /* 헤더·툴바·패널·맵 */
  --panel:#f7f7f8;       /* 인셋 — 칩·썸네일·hover 배경 */
  --surface:#ffffff;     /* 입력·모달 */
  --ink:#1f2328;
  --ink-soft:#6f7680;
  --line:#e4e4e7;        /* hairline */
  --accent:#2563eb;
  --accent-soft:#eff4ff;
  --accent-ink:#1d4ed8;  /* accent-soft 위 텍스트(활성 탭·링크) */
  --danger:#dc2626;
  --grid:rgba(60,70,90,.06);     /* 맵 모눈선 */
  --st-label-bg:rgba(255,255,255,.92);
  --hint-bg:#f7f7f8; --hint-line:#e4e4e7; --hint-ink:#6f7680;
  --green:#16a34a; --blue:#4a7fa5; --gold:#c9a227;
  --shadow:0 2px 10px rgba(0,0,0,.06);
  --radius:12px;         /* 패널·카드 */
}
/* 시스템 설정에 따라 자동 다크 전환 (JS 없이) — 무채색 다크 */
@media (prefers-color-scheme:dark){
  :root{
    --bg:#141517;
    --paper:#1a1b1e;
    --panel:#1e1f22;
    --surface:#232428;
    --ink:#e8eaed;
    --ink-soft:#9aa0a6;
    --line:#2c2e33;
    --accent:#5b8def;
    --accent-soft:#1e2836;
    --accent-ink:#93b4f5;
    --danger:#ef6a6a;
    --grid:rgba(200,210,235,.05);
    --st-label-bg:rgba(30,31,34,.92);
    --hint-bg:#1e1f22; --hint-line:#2c2e33; --hint-ink:#9aa0a6;
    --green:#4ade80;
    --shadow:0 4px 16px rgba(0,0,0,.4);
  }
}
```

- [ ] **Step 2: 인셋 배경 `--bg` → `--panel` 치환**

`background:var(--bg)`를 쓰는 곳 전부 `background:var(--panel)`로 변경, **단 `body`(43행)만 `var(--bg)` 유지**. 대상 셀렉터(전수): `.search-input`, `.sr-thumb`, `.member-chip`, `.hdr-icon-btn`, `.sheet-close`, `.invite-notice input`, `.mode-btn`, `.pal-btn`, `.activity-list li`, `.viewtabs button`, `.trow:hover`, `.trow-iconbtn:hover`, `.rowmenu-item:hover`, `.btn-ghost`, `.tadd-form button.btn-ghost`, `.titem:hover`, `.dp-close:hover`, `.item-card`, `.btn-cancel`. (`.map`의 배경은 `var(--paper)`라 해당 없음.)

- [ ] **Step 3: 보더 두께 1px 정돈**

- `.search-input` `border:2px solid` → `1px solid`
- `.mode-btn`·`.pal-btn` `border:2px solid transparent` → `1px solid transparent`
- `.storage .badge` `border:2px solid var(--line)` → `1px solid var(--line)`
- `.invite-notice input`·`.tadd-form input[type=text]`·`.dp-form input[type=text]`·`.photo-btn`·`.tadd-photo`·`.modal input[type=text]`·`.viewtabs button` `1.5px` → `1px`
- `.trow-name-input` `box-shadow:0 0 0 1.5px var(--accent)` → `0 0 0 1px var(--accent)`
- `.member-chip` `border:2px` → `1.5px` (활성 컬러 링 가시성 유지)
- `.room` `border:2.5px` → 유지(맵 라운드)

- [ ] **Step 4: 라운드 정돈**

- `.search-input` `border-radius:24px` → `10px`
- `.viewtabs button` `border-radius:var(--r-pill,9999px)` → `8px`
- `.modal` `18px` → `12px`, `.modal .btns button` `11px` → `8px`, `.modal input[type=text]` `10px` → `8px`
- `.sheet` `16px 16px 0 0` → `12px 12px 0 0`, `@media(min-width:640px)` 내 `.sheet` `16px` → `12px`
- `.add-btn` `10px` → `8px`
- `.detail-panel` 모바일 `border-radius:16px 16px 0 0` → `12px 12px 0 0`

- [ ] **Step 5: 코랄 하드코딩 rgba → 블루, 웜 그림자 → 무채색**

- `.room.glow` `rgba(255,107,90,.35)` → `rgba(37,99,235,.30)`
- `.room.selected` `rgba(255,107,90,.5)` → `rgba(37,99,235,.45)`
- `.ghost` `background:rgba(255,107,90,.08)` → `rgba(37,99,235,.08)`
- `@keyframes pulse`의 `rgba(255,107,90,…)` 3곳 → `rgba(37,99,235,…)` (알파 유지)
- `.search-results` `rgba(60,45,25,.18)` → `rgba(0,0,0,.12)`
- `.sheet-wrap` `rgba(40,30,15,.4)` → `rgba(0,0,0,.4)`; `.sheet` 그림자 `rgba(40,30,15,.3)` → `rgba(0,0,0,.25)`
- `.modal-wrap` `rgba(50,40,25,.35)` → `rgba(0,0,0,.35)`; `.modal` 그림자 `rgba(40,30,15,.3)` → `rgba(0,0,0,.25)`
- `.detail-panel` `rgba(72,58,40,.10)` → `rgba(0,0,0,.08)`; 모바일 `rgba(72,58,40,.14)` → `rgba(0,0,0,.12)`
- `.map` inset `rgba(140,115,80,.06)` → `rgba(0,0,0,.04)`
- `.toast` `background:#2a231a;color:#fff8ee` → `background:#26282c;color:#f5f6f7`

- [ ] **Step 6: 검증 — 코랄/웜 잔재 없는지 grep**

```bash
grep -n "faf5e8\|fffaf0\|fffefb\|ff6b5a\|ff7a68\|ffe7e1\|255,107,90\|72,58,40\|40,30,15\|50,40,25\|60,45,25\|140,115,80" web/src/app/globals.css
```
Expected: 매치 0건. `grep -c "var(--panel)" web/src/app/globals.css` → 19 내외.

- [ ] **Step 7: 커밋**

```bash
git add web/src/app/globals.css
git commit -m "feat(theme): 뉴트럴 토큰 교체 — 흰/회색+블루, 1px 보더, 무채색 그림자"
```

---

### Task 2: Icon.tsx + 목록·헤더·검색 이모지 전면 교체

**Files:**
- Create: `web/src/components/Icon.tsx`
- Modify: `web/src/components/TreeRow.tsx`, `web/src/components/HomeTree.tsx`, `web/src/components/CompartmentTree.tsx`, `web/src/components/Header.tsx`, `web/src/components/SearchBar.tsx`, `web/src/app/(app)/page.tsx`, `web/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1의 `--panel` 토큰
- Produces: `Icon` 컴포넌트 — `export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string })`, `export type IconName = 'folder' | 'box' | 'search' | 'plus' | 'chevron-left' | 'chevron-right' | 'more-horizontal' | 'x' | 'trash' | 'camera' | 'check' | 'clock'`. `TreeRow`의 `icon` prop 타입이 `string` → `IconName`으로 변경됨(Task 3이 의존).

- [ ] **Step 1: `Icon.tsx` 생성**

```tsx
import type { ReactNode } from 'react'

export type IconName =
  | 'folder' | 'box' | 'search' | 'plus' | 'chevron-left' | 'chevron-right'
  | 'more-horizontal' | 'x' | 'trash' | 'camera' | 'check' | 'clock'

// 라인 SVG 아이콘(lucide 패스) — 의존성 없음. stroke=currentColor 1.5px.
const PATHS: Record<IconName, ReactNode> = {
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  box: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'more-horizontal': <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
}

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 2: `TreeRow.tsx` — 캐럿·아이콘·⋯·메뉴 교체**

- import 추가: `import { Icon, type IconName } from './Icon'`
- Props의 `icon: string` → `icon: IconName`
- 캐럿 버튼(42행): 내용 `{expanded ? '▾' : '▸'}` → `<Icon name="chevron-right" size={12} />`, className `"trow-caret"` → `` `trow-caret${expanded ? ' open' : ''}` ``
- 아이콘(46행): `<span className="trow-ico">{icon}</span>` → `<span className="trow-ico"><Icon name={icon} size={16} /></span>`
- RowMenu 트리거(80행): `⋯` → `<Icon name="more-horizontal" size={16} />`
- RowMenu 항목(84–85행): `✏️ 이름 수정` → `이름 수정`, `🗑️ 삭제` → `삭제`

- [ ] **Step 3: `HomeTree.tsx` / `CompartmentTree.tsx` 아이콘 교체**

- `HomeTree.tsx`: `icon="🏠"` → `icon="folder"` (48행), `icon="📦"` → `icon="folder"` (76행)
- `CompartmentTree.tsx`:
  - import 추가: `import { Icon } from './Icon'`
  - `icon="📁"` → `icon="folder"` (209행)
  - `DeleteBtn`(22행): `🗑️` → `<Icon name="trash" size={15} />`
  - `ItemRow` 썸네일(131행): `(item.emoji || '📦')` → `<Icon name="box" size={13} />`
  - `ItemRow` 이름(133행): `{item.name}{item.photo_path && !photoUrl ? ' 📷' : ''}` → `{item.name}` 으로 되돌리고, name span 바로 뒤에 `{item.photo_path && !photoUrl && <Icon name="camera" size={12} className="titem-cam" />}` 추가
  - 종류 토글(99–100행): `📁 칸` → `칸`, `📦 물건` → `물건`
  - 사진 라벨 2곳(`InlineItemForm` 60행, `InlineAddForm` 111행): `{photo ? '✅ 사진' : '📷'}` → `{photo ? <><Icon name="check" size={13} /> 사진</> : <><Icon name="camera" size={13} /> 사진</>}`

- [ ] **Step 4: `Header.tsx` / `SearchBar.tsx` / `page.tsx` 교체**

- `Header.tsx`: import `Icon`; `<span className="mark">🔍🏠</span>` 삭제; 활동 버튼 `🕘` → `<Icon name="clock" size={20} />`; 초대 버튼 `👨‍👩‍👧 가족 초대` → `가족 초대`
- `SearchBar.tsx`: import `Icon`; `<span className="icon">🔎</span>` → `<span className="icon"><Icon name="search" size={16} /></span>`; `sr-thumb` 내용 `{itemById.get(h.itemId)?.emoji || '📦'}` → `<Icon name="box" size={16} />`; `sr-loc`의 `📍 ` 접두 제거; `sr-empty`의 ` 😅` 제거
- `page.tsx`: viewtabs `📋 목록` → `목록`, `🗺️ 도식화` → `도식화`; 게스트 배너 `🧪 테스트(게스트) 모드` → `테스트(게스트) 모드`

- [ ] **Step 5: `globals.css` — 아이콘 정렬 CSS**

트리 섹션(`.trow-caret`~) 수정/추가:

```css
.trow-caret{width:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--ink-soft);background:none;border:none;padding:0;cursor:pointer}
.trow-caret svg{transition:transform .12s}
.trow-caret.open svg{transform:rotate(90deg)}
.trow-ico{flex-shrink:0;display:flex;color:var(--ink-soft)}
.titem-thumb{color:var(--ink-soft)}   /* 기존 선언에 color만 추가 */
.titem-cam{color:var(--ink-soft);flex-shrink:0}
.sr-thumb{color:var(--ink-soft)}      /* 기존 선언에 color만 추가 */
.search-wrap .icon{display:flex;align-items:center;color:var(--ink-soft)} /* 기존 선언에 추가, font-size 제거 */
.tadd-photo{gap:4px}                  /* 기존 선언에 추가 */
```

`.logo .mark` 룰(57행)은 사용처가 사라지므로 삭제. `@media(prefers-reduced-motion:reduce)`에 `.trow-caret svg{transition:none}` 추가.

- [ ] **Step 6: 검증**

```bash
cd web && npx tsc --noEmit && npm run lint
grep -rn "🏠\|📦\|📁\|🗑️\|📷\|✅\|⋯\|▾\|▸\|🔎\|🕘\|📍\|😅\|🧪\|📋\|🗺️\|✏️" src/components/TreeRow.tsx src/components/HomeTree.tsx src/components/CompartmentTree.tsx src/components/Header.tsx src/components/SearchBar.tsx "src/app/(app)/page.tsx"
```
Expected: tsc·lint 통과, grep 매치 0건.

- [ ] **Step 7: 커밋**

```bash
git add web/src/components/Icon.tsx web/src/components/TreeRow.tsx web/src/components/HomeTree.tsx web/src/components/CompartmentTree.tsx web/src/components/Header.tsx web/src/components/SearchBar.tsx "web/src/app/(app)/page.tsx" web/src/app/globals.css
git commit -m "feat(icons): 인라인 SVG Icon 도입, 목록·헤더·검색 이모지 전면 교체"
```

---

### Task 3: 모바일 드릴다운 (resolvePath TDD + DrillDown + 분기)

**Files:**
- Create: `web/src/lib/drillPath.ts`, `web/src/lib/drillPath.test.ts`, `web/src/lib/useIsMobile.ts`, `web/src/components/DrillDown.tsx`
- Modify: `web/src/components/TreeRow.tsx`(chevron prop·RowMenu export), `web/src/components/CompartmentTree.tsx`(ItemRow export), `web/src/components/HomeTree.tsx`(Props export), `web/src/app/(app)/page.tsx`(분기), `web/src/app/globals.css`(드릴 CSS)

**Interfaces:**
- Consumes: `Icon`/`IconName`(Task 2), `TreeRow`, `InlineInput`/`InlineAddForm`/`AddRow`, `childCompartments(compartments, parentId)` (`@/lib/compartments`)
- Produces:
  - `resolvePath(path: PathSeg[], rooms: Room[], storages: Storage[]): ResolvedSeg[]` — 유효 접두사만 반환
  - `useIsMobile(): boolean`
  - `DrillDown(p: HomeTreeProps)` — `HomeTree`와 동일 props
  - `TreeRow`에 `chevron?: boolean` prop, `export function RowMenu`, `export function ItemRow`, `export type HomeTreeProps`

- [ ] **Step 1: 실패하는 테스트 작성 — `web/src/lib/drillPath.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePath, type PathSeg } from './drillPath'
import type { Compartment, Room, Storage } from './types'

const room = (id: string) => ({ id, name: id } as Room)
const cmp = (id: string, parent_id: string | null = null): Compartment => ({ id, name: id, parent_id })
const storage = (id: string, room_id: string, compartments: Compartment[] = []) =>
  ({ id, room_id, compartments } as Storage)

const rooms = [room('r1')]
const storages = [storage('s1', 'r1', [cmp('c1'), cmp('c2', 'c1')])]
const seg = (kind: PathSeg['kind'], id: string): PathSeg => ({ kind, id })

describe('resolvePath', () => {
  it('전체 유효 경로를 해석한다 (방→수납장→칸→중첩칸)', () => {
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'c1'), seg('cmp', 'c2')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1', 'c1', 'c2'])
    const last = out[3]
    expect(last.kind).toBe('cmp')
    expect(last.kind === 'cmp' ? last.storage.id : null).toBe('s1')
  })

  it('빈 경로는 빈 배열', () => {
    expect(resolvePath([], rooms, storages)).toEqual([])
  })

  it('없는 방이면 빈 배열', () => {
    expect(resolvePath([seg('room', 'gone')], rooms, storages)).toEqual([])
  })

  it('수납장이 다른 방 소속이면 방까지만', () => {
    const moved = [storage('s1', 'r2', [])]
    const out = resolvePath([seg('room', 'r1'), seg('storage', 's1')], rooms, moved)
    expect(out.map((o) => o.id)).toEqual(['r1'])
  })

  it('삭제된 칸이면 수납장까지만', () => {
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'gone')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1'])
  })

  it('부모가 달라진 중첩 칸이면 그 앞까지만', () => {
    // c2의 실제 부모는 c1인데 수납장 직속으로 접근하면 잘린다
    const out = resolvePath(
      [seg('room', 'r1'), seg('storage', 's1'), seg('cmp', 'c2')],
      rooms, storages,
    )
    expect(out.map((o) => o.id)).toEqual(['r1', 's1'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && npm test`
Expected: FAIL — `Cannot find module './drillPath'` (기존 16개는 통과).

- [ ] **Step 3: `web/src/lib/drillPath.ts` 구현**

```ts
import type { Compartment, Room, Storage } from './types'

export type PathSeg = { kind: 'room' | 'storage' | 'cmp'; id: string }
export type ResolvedSeg =
  | { kind: 'room'; id: string; room: Room }
  | { kind: 'storage'; id: string; storage: Storage }
  | { kind: 'cmp'; id: string; cmp: Compartment; storage: Storage }

// 드릴다운 경로를 현재 데이터에 대조해 유효한 접두사만 반환.
// 다른 기기 동기화로 노드가 사라지거나 옮겨져도 화면이 죽지 않고 가장 가까운 조상으로 복귀한다.
export function resolvePath(path: PathSeg[], rooms: Room[], storages: Storage[]): ResolvedSeg[] {
  const out: ResolvedSeg[] = []
  for (const seg of path) {
    const prev = out[out.length - 1]
    if (seg.kind === 'room') {
      if (prev) return out
      const room = rooms.find((r) => r.id === seg.id)
      if (!room) return out
      out.push({ kind: 'room', id: seg.id, room })
    } else if (seg.kind === 'storage') {
      if (!prev || prev.kind !== 'room') return out
      const storage = storages.find((s) => s.id === seg.id && s.room_id === prev.room.id)
      if (!storage) return out
      out.push({ kind: 'storage', id: seg.id, storage })
    } else {
      if (!prev || prev.kind === 'room') return out
      const storage = prev.storage
      const parentId = prev.kind === 'cmp' ? prev.cmp.id : null
      const cmp = (storage.compartments ?? []).find((c) => c.id === seg.id && (c.parent_id ?? null) === parentId)
      if (!cmp) return out
      out.push({ kind: 'cmp', id: seg.id, cmp, storage })
    }
  }
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npm test`
Expected: PASS — 16 + 6 = 22개.

- [ ] **Step 5: `web/src/lib/useIsMobile.ts` 생성**

```ts
'use client'

import { useEffect, useState } from 'react'

// SSR/첫 렌더는 false(데스크톱)로 시작해 마운트 후 실제 값으로 보정. 767px 이하 = 모바일.
export function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setMobile(mq.matches)
    const on = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}
```

- [ ] **Step 6: 기존 컴포넌트 export/prop 확장**

- `TreeRow.tsx`:
  - Props에 `chevron?: boolean` 추가
  - actions span 뒤(닫는 `</div>` 직전)에 추가: `{!editing && chevron && <Icon name="chevron-right" size={16} className="trow-chev" />}`
  - `function RowMenu` → `export function RowMenu`
- `CompartmentTree.tsx`: `function ItemRow` → `export function ItemRow`
- `HomeTree.tsx`: 파일 하단에 `export type HomeTreeProps = Props` 추가 (`type Props`는 그대로)

- [ ] **Step 7: `web/src/components/DrillDown.tsx` 생성**

```tsx
'use client'

import { useState } from 'react'
import type { Compartment, Storage } from '@/lib/types'
import { resolvePath, type PathSeg } from '@/lib/drillPath'
import { childCompartments } from '@/lib/compartments'
import { AddRow, InlineAddForm, InlineInput, ItemRow } from './CompartmentTree'
import { TreeRow, RowMenu } from './TreeRow'
import { Icon } from './Icon'
import type { HomeTreeProps } from './HomeTree'

// 모바일 드릴다운: 한 화면 = 한 레벨. 방 목록 → 방 → 수납장 → 칸(무한중첩) → 물건.
// 경로는 state, 렌더는 resolvePath가 검증한 유효 접두사만 사용 — 동기화로 노드가 사라져도 조상 화면으로 복귀.
export function DrillDown(p: HomeTreeProps) {
  const [path, setPath] = useState<PathSeg[]>([])
  const valid = resolvePath(path, p.rooms, p.storages)
  const cur = valid[valid.length - 1]

  const toSegs = () => valid.map((v) => ({ kind: v.kind, id: v.id }) as PathSeg)
  const enter = (seg: PathSeg) => setPath([...toSegs(), seg])
  const back = () => setPath(toSegs().slice(0, -1))

  if (!cur) return <RootScreen p={p} onEnter={enter} />
  if (cur.kind === 'room') return <RoomScreen p={p} room={cur.room} onEnter={enter} onBack={back} />
  return (
    <ContainerScreen p={p} storage={cur.storage} parent={cur.kind === 'cmp' ? cur.cmp : null}
      onEnter={enter} onBack={back} />
  )
}

// 상단 바: ‹ 뒤로 + 현재 이름(⋯로 이름수정·삭제)
function DrillHeader({ name, onBack, onRename, onDelete, deleteTitle, deleteMessage }: {
  name: string; onBack: () => void; onRename: (n: string) => void; onDelete: () => void
  deleteTitle: string; deleteMessage: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  return (
    <div className="drill-head">
      <button type="button" className="drill-back" aria-label="뒤로" onClick={onBack}>
        <Icon name="chevron-left" size={20} />
      </button>
      {editing ? (
        <input className="trow-name-input" type="text" autoFocus aria-label="이름 수정"
          value={draft} maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = draft.trim(); if (n && n !== name) onRename(n); setEditing(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="drill-title">{name}</span>
      )}
      {!editing && (
        <RowMenu onEditName={() => { setDraft(name); setEditing(true) }} onDelete={onDelete}
          deleteTitle={deleteTitle} deleteMessage={deleteMessage} />
      )}
    </div>
  )
}

function RootScreen({ p, onEnter }: { p: HomeTreeProps; onEnter: (s: PathSeg) => void }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="home-tree">
      {adding
        ? <InlineInput depth={0} placeholder="방 이름 (예: 안방, 거실)" onSubmit={(n) => { p.onAddRoom(n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="방 추가" onClick={() => setAdding(true)} />}
      {p.rooms.length === 0 && <div className="tree-empty">아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작해보세요.</div>}
      {p.rooms.map((room) => (
        <TreeRow key={room.id} depth={0} levelClass="lv-drill lv-room" icon="folder" name={room.name}
          count={p.storages.filter((s) => s.room_id === room.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'room', id: room.id })}
          onRename={(n) => p.onRenameRoom(room, n)}
          deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteRoom(room)}
        />
      ))}
    </div>
  )
}

function RoomScreen({ p, room, onEnter, onBack }: {
  p: HomeTreeProps; room: HomeTreeProps['rooms'][number]; onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const storages = p.storages.filter((s) => s.room_id === room.id)
  return (
    <div className="home-tree">
      <DrillHeader name={room.name} onBack={onBack}
        onRename={(n) => p.onRenameRoom(room, n)}
        deleteTitle="방 삭제" deleteMessage={`'${room.name}' 방과 그 안의 수납장·물건이 함께 삭제됩니다`}
        onDelete={() => p.onDeleteRoom(room)} />
      {adding
        ? <InlineInput depth={0} placeholder="수납장 이름 (예: 서랍장1)" onSubmit={(n) => { p.onAddStorage(room, n); setAdding(false) }} onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="수납장 추가" onClick={() => setAdding(true)} />}
      {storages.length === 0 && <div className="tree-empty">아직 수납장이 없어요.</div>}
      {storages.map((s) => (
        <TreeRow key={s.id} depth={0} levelClass="lv-drill lv-storage" icon="folder" name={s.name}
          count={p.decItems.filter((it) => it.storage_id === s.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'storage', id: s.id })}
          onRename={(n) => p.onRenameStorage(s, n)}
          deleteTitle="수납장 삭제" deleteMessage={`'${s.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteStorage(s)}
        />
      ))}
    </div>
  )
}

// 수납장 직속(parent=null) 또는 칸 내부(parent=칸) 화면 — 하위 칸 + 물건
function ContainerScreen({ p, storage, parent, onEnter, onBack }: {
  p: HomeTreeProps; storage: Storage; parent: Compartment | null
  onEnter: (s: PathSeg) => void; onBack: () => void
}) {
  const [adding, setAdding] = useState(false)
  const compartments = storage.compartments ?? []
  const children = childCompartments(compartments, parent?.id ?? null)
  const validIds = new Set(compartments.map((c) => c.id))
  const allItems = p.decItems.filter((it) => it.storage_id === storage.id)
  const items = parent
    ? allItems.filter((it) => it.compartment_id === parent.id)
    : allItems.filter((it) => !it.compartment_id || !validIds.has(it.compartment_id))
  const head = parent
    ? {
        name: parent.name,
        onRename: (n: string) => p.onCompartmentsChange(storage, compartments.map((c) => (c.id === parent.id ? { ...c, name: n } : c))),
        deleteTitle: '칸 삭제', deleteMessage: `'${parent.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteCompartment(storage, parent.id),
      }
    : {
        name: storage.name,
        onRename: (n: string) => p.onRenameStorage(storage, n),
        deleteTitle: '수납장 삭제', deleteMessage: `'${storage.name}' 수납장과 그 안의 물건이 함께 삭제됩니다`,
        onDelete: () => p.onDeleteStorage(storage),
      }
  return (
    <div className="home-tree">
      <DrillHeader onBack={onBack} {...head} />
      {adding
        ? <InlineAddForm depth={0}
            onAddCompartment={(n) => { p.onCompartmentsChange(storage, [...compartments, { id: crypto.randomUUID(), name: n, parent_id: parent?.id ?? null }]); setAdding(false) }}
            onAddItem={async (d) => { await p.onAddItem(storage, parent?.id ?? null, d); setAdding(false) }}
            onCancel={() => setAdding(false)} />
        : <AddRow depth={0} label="추가" onClick={() => setAdding(true)} />}
      {children.length === 0 && items.length === 0 && <div className="tree-empty">아직 비어 있어요.</div>}
      {children.map((c) => (
        <TreeRow key={c.id} depth={0} levelClass="lv-drill" icon="folder" name={c.name}
          count={allItems.filter((it) => it.compartment_id === c.id).length}
          expandable={false} expanded={false} chevron
          onToggle={() => onEnter({ kind: 'cmp', id: c.id })}
          onRename={(n) => p.onCompartmentsChange(storage, compartments.map((x) => (x.id === c.id ? { ...x, name: n } : x)))}
          deleteTitle="칸 삭제" deleteMessage={`'${c.name}' 칸과 그 안의 칸·물건이 함께 삭제됩니다`}
          onDelete={() => p.onDeleteCompartment(storage, c.id)}
        />
      ))}
      {items.map((it) => <ItemRow key={it.id} item={it} depth={0} onDelete={p.onDeleteItem} />)}
    </div>
  )
}
```

- [ ] **Step 8: `page.tsx` 분기**

- import 추가: `import { DrillDown } from '@/components/DrillDown'`, `import { useIsMobile } from '@/lib/useIsMobile'`
- `const [view, setView] = ...` 아래에 `const isMobile = useIsMobile()` 추가
- Header를 렌더하는 최종 `return` 직전(모든 `data` 접근이 안전한 지점)에:

```tsx
const treeProps = {
  rooms: data.rooms, storages: data.storages, decItems: data.decItems, members: data.members,
  onAddRoom: handleAddRoom,
  onRenameRoom: (room: Room, name: string) => handleRoomUpdateMeta(room, { name }),
  onDeleteRoom: handleRoomDelete,
  onAddStorage: handleAddStorageInList,
  onRenameStorage: handleStorageRename,
  onDeleteStorage: handleStorageDelete,
  onCompartmentsChange: handleCompartmentsChange,
  onDeleteCompartment: handleCompartmentDelete,
  onAddItem: handleTreeItemAdd,
  onDeleteItem: handleItemDelete,
}
```

(`Room` 타입이 import 안 되어 있으면 `@/lib/types`에서 추가.)

- 기존 `<HomeTree ...14개 props... />` 를 다음으로 교체:

```tsx
{isMobile ? <DrillDown {...treeProps} /> : <HomeTree {...treeProps} />}
```

- [ ] **Step 9: `globals.css` — 드릴다운 CSS 추가**

목록(트리) 섹션 끝에 추가:

```css
/* ---------- 모바일 드릴다운 ---------- */
.drill-head{display:flex;align-items:center;gap:6px;min-height:48px;padding:0 2px}
.drill-back{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;color:var(--ink-soft);flex-shrink:0}
.drill-back:active{background:var(--panel)}
.drill-title{flex:1;min-width:0;font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drill-head .trow-name-input{flex:1;font-size:17px;font-weight:600}
.trow.lv-drill{min-height:48px}
.lv-drill .trow-caret{display:none}
.trow-chev{color:var(--ink-soft);flex-shrink:0}
```

- [ ] **Step 10: 검증**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test
```
Expected: 모두 통과 (테스트 22개).

- [ ] **Step 11: 커밋**

```bash
git add web/src/lib/drillPath.ts web/src/lib/drillPath.test.ts web/src/lib/useIsMobile.ts web/src/components/DrillDown.tsx web/src/components/TreeRow.tsx web/src/components/CompartmentTree.tsx web/src/components/HomeTree.tsx "web/src/app/(app)/page.tsx" web/src/app/globals.css
git commit -m "feat(mobile): 목록 드릴다운 — 한 화면 한 레벨, resolvePath로 동기화 안전"
```

---

### Task 4: 전체 게이트 + 배포

**Files:** 없음(검증만)

**Interfaces:**
- Consumes: Task 1–3 전부
- Produces: main push → Vercel 자동 배포

- [ ] **Step 1: 전체 게이트**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: 모두 통과. 실패 시 원인 수정 후 재실행(수정은 해당 파일 커밋에 fixup).

- [ ] **Step 2: push**

```bash
git push
```
Expected: main 반영 → Vercel 자동 배포(정책: 확인 없이 push).

- [ ] **Step 3: 수동 확인 안내 (자동 브라우저 검증 금지 정책)**

사용자에게 확인 포인트 보고: 모바일 390px 드릴다운(진입/뒤로/추가/이름수정/삭제), 데스크톱 아코디언, 라이트/다크, 검색 브레드크럼.
