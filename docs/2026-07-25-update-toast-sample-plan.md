# 업데이트 토스트 + 예시 집 스타터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① 새 배포 감지 시 "탭해서 적용" 배너(캐시 삭제+리로드로 즉시 반영), ② 빈 상태에서 `예시 집으로 시작하기` 버튼(방 3·수납장 4·칸·물건 4 템플릿, 지도 배치 포함).

**Architecture:** 빌드에 커밋 SHA를 새기고(`NEXT_PUBLIC_BUILD_ID`) 정적 `/version` 라우트와 비교(포커스 시에만, SW 우회). 적용=전체 캐시 삭제+reload. 템플릿은 기존 putLocal 경로로 일괄 생성 후 `loadLocalData` 리로드.

**Tech Stack:** Next.js 16. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업, push는 최종 태스크에서만. UI 이모지 금지(데이터 필드 `emoji:'📦'`는 기존 생성 경로와 동일 — 허용).
- 업데이트 체크는 **포커스 복귀 시에만**(주기 폴링 금지 — 로컬-퍼스트). dev(`BUILD_ID==='dev'`)에서는 비활성.
- 템플릿은 방 0개일 때만 생성 가능(가드). 저장은 기존 putLocal dirty 패턴 + `push().catch(() => {})`.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`.

---

### Task 1: 구현

**Files:**
- Create: `web/src/app/version/route.ts`
- Modify: `web/next.config.ts`, `web/public/sw.js`, `web/src/app/(app)/page.tsx`, `web/src/components/HomeTree.tsx`, `web/src/app/globals.css`

- [ ] **Step 1: 버전 표식**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // 배포 식별자 — 업데이트 배너가 서버 /version과 비교. 로컬 dev는 'dev'로 비활성.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
```

`web/src/app/version/route.ts`(빌드 시 정적 생성 — 배포마다 새 값):

```ts
export const dynamic = 'force-static'

export function GET() {
  return Response.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' })
}
```

`web/public/sw.js` fetch 핸들러의 `/auth//api/` bypass 줄 다음에 추가:

```js
  if (url.pathname === '/version') return // 업데이트 체크는 항상 네트워크(캐시 우회)
```

- [ ] **Step 2: page.tsx — 감지 + 적용 + 배너**

상태·이펙트(기존 searchFlash 이펙트 인근):

```tsx
  const [updateReady, setUpdateReady] = useState(false)

  // 새 배포 감지 — 포커스 복귀 시에만 /version 조회(주기 폴링 없음, 로컬-퍼스트). dev는 비활성.
  useEffect(() => {
    const build = process.env.NEXT_PUBLIC_BUILD_ID
    if (!build || build === 'dev') return
    let stop = false
    const check = () => {
      fetch('/version', { cache: 'no-store' })
        .then((r) => r.json())
        .then((v: { build?: string }) => { if (!stop && v.build && v.build !== build) setUpdateReady(true) })
        .catch(() => {})
    }
    check()
    window.addEventListener('focus', check)
    return () => { stop = true; window.removeEventListener('focus', check) }
  }, [])

  // 적용: 셸 캐시 전부 비우고 리로드 → 다음 로드가 네트워크에서 새 버전을 받는다
  async function applyUpdate() {
    try { await Promise.all((await caches.keys()).map((k) => caches.delete(k))) } catch {}
    location.reload()
  }
```

JSX(토스트 앞):

```tsx
      {updateReady && (
        <button type="button" className="update-toast" onClick={() => void applyUpdate()}>
          새 버전이 있어요 — 탭해서 적용
        </button>
      )}
```

- [ ] **Step 3: 예시 집 템플릿**

`HomeTreeProps`에 `onCreateSample?: () => void`. HomeTree 빈 상태 교체:

```tsx
      {p.rooms.length === 0 && (
        <div className="tree-empty">
          아직 방이 없어요. 위 &lsquo;방 추가&rsquo;로 시작하거나
          <button type="button" className="sample-btn" onClick={() => p.onCreateSample?.()}>예시 집으로 시작하기</button>
        </div>
      )}
```

page.tsx에 핸들러(treeProps에 `onCreateSample: handleCreateSample` 추가):

```tsx
  // 예시 집: 빈 상태 전용 스타터 — 구조(칸 중첩)·지도 배치·검색(손톱깎이)을 한 번에 보여준다
  async function handleCreateSample() {
    if (!data || data.rooms.length > 0) return
    const fdk = keys.getFDK()
    if (!fdk) return
    const now = new Date().toISOString()
    const base = { family_id: data.familyId, updated_at: now, deleted_at: null }
    const rid = { 안방: crypto.randomUUID(), 거실: crypto.randomUUID(), 주방: crypto.randomUUID() }
    const rooms: Room[] = [
      { id: rid.안방, name: '안방', x: 0, y: 0, w: 5, h: 4, color_index: 0, ...base },
      { id: rid.거실, name: '거실', x: 5, y: 0, w: 7, h: 4, color_index: 0, ...base },
      { id: rid.주방, name: '주방', x: 0, y: 4, w: 5, h: 3, color_index: 0, ...base },
    ]
    const cmp = (name: string): Compartment => ({ id: crypto.randomUUID(), name, parent_id: null })
    const 옷장칸 = [cmp('윗칸'), cmp('아랫칸')]
    const 서랍장칸 = [cmp('첫째칸'), cmp('둘째칸')]
    const 냉장고칸 = [cmp('냉장실'), cmp('냉동실')]
    const sid = { 옷장: crypto.randomUUID(), 서랍장: crypto.randomUUID(), 책장: crypto.randomUUID(), 냉장고: crypto.randomUUID() }
    const storages: Storage[] = [
      { id: sid.옷장, room_id: rid.안방, type: 'box', name: '옷장', x: 0, y: 0, w: 4, h: 3, compartments: 옷장칸, ...base },
      { id: sid.서랍장, room_id: rid.안방, type: 'box', name: '서랍장', x: 8, y: 0, w: 4, h: 4, compartments: 서랍장칸, ...base },
      { id: sid.책장, room_id: rid.거실, type: 'box', name: '책장', x: 0, y: 0, w: 3, h: 5, compartments: [], ...base },
      { id: sid.냉장고, room_id: rid.주방, type: 'box', name: '냉장고', x: 9, y: 0, w: 3, h: 6, compartments: 냉장고칸, ...base },
    ]
    const mkItem = async (name: string, memo: string, storage_id: string, compartment_id: string | null): Promise<Item> => ({
      id: crypto.randomUUID(), family_id: data.familyId, storage_id, compartment_id,
      enc_name: await encryptField(fdk, name), enc_memo: memo ? await encryptField(fdk, memo) : null,
      emoji: '📦', photo_path: null, created_by: data.userId, created_at: now, updated_at: now, deleted_at: null,
    })
    const items = [
      await mkItem('겨울이불', '압축팩에 보관', sid.옷장, 옷장칸[0].id),
      await mkItem('여권', '가족 모두', sid.서랍장, 서랍장칸[0].id),
      await mkItem('손톱깎이', '', sid.서랍장, 서랍장칸[1].id),
      await mkItem('건전지 AA', '', sid.책장, null),
    ]
    await Promise.all([
      ...rooms.map((r) => store.putLocal('rooms', r, { dirty: true })),
      ...storages.map((s) => store.putLocal('storages', s, { dirty: true })),
      ...items.map((it) => store.putLocal('items', it, { dirty: true })),
    ])
    await loadLocalData(data.familyId, data.userId, false)
    showToast('예시 집을 만들었어요 — 마음대로 고치거나 지워도 돼요')
    push().catch(() => {})
  }
```

- [ ] **Step 4: globals.css**

```css
.update-toast{
  position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:300;
  background:var(--accent);color:#fff;padding:10px 18px;border-radius:20px;
  font-size:13px;font-weight:700;box-shadow:var(--shadow);
}
.sample-btn{display:block;margin:10px auto 0;padding:9px 16px;border-radius:8px;background:var(--accent-soft);color:var(--accent-ink);font-size:13px;font-weight:700}
```

- [ ] **Step 5: 검증 + 커밋**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
git add -A
git commit -m "feat(ux): 업데이트 즉시 적용 배너(/version 비교) + 빈 상태 예시 집 스타터"
```

---

### Task 2: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

최종 리뷰(opus) 중점: /version이 정말 배포마다 값이 바뀌는지(정적 생성+env), SW 우회의 구/신 SW 공존 동작, applyUpdate가 사진 blob(IndexedDB)을 건드리지 않는지(Cache API만), 템플릿 가드·지도 배치 좌표가 그리드 안인지. 통과 시 push·원장·메모리.
