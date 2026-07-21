# 홈즈맵 v1 (핵심) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족이 가입해 로그인하고, 집 지도에 방·수납장·물건을 등록하고, 검색으로 물건 위치를 찾을 수 있는 멀티테넌트 웹앱의 v1을 만든다.

**Architecture:** Next.js(App Router) 단일 앱에서 Supabase(Auth·Postgres+RLS·Storage)를 직접 호출한다. 별도 백엔드 서버 없음. 가족 단위 격리는 모든 테이블의 `family_id` + RLS로 처리. 프로토타입 `homesmap.html`의 렌더·드래그·검색 로직을 React/TS로 이식한다.

**Tech Stack:** Next.js(App Router, TypeScript), `@supabase/ssr`, `@supabase/supabase-js`, Vitest(단위 테스트), Vercel 배포.

## Global Constraints

- 프로젝트 루트는 `web/`. Vercel Root Directory = `web/` (기존 lotto_night_sky·dday_manager 패턴 동일).
- 모든 테이블은 `family_id`를 가지며 RLS 정책 = "요청 유저가 그 가족의 `family_members`에 존재".
- v1 UI는 **유저당 활성 가족 1개**로 단순화(스키마는 다대다 지원).
- 인증 제공자: 카카오·구글·이메일 매직링크(Supabase Auth). v1 구현은 이메일 매직링크를 먼저, OAuth(카카오·구글)는 Task 4에서 설정.
- 사진은 Supabase Storage 비공개 버킷 `item-photos`, 경로 `{family_id}/{item_id}/{uuid}`.
- 논리 캔버스 좌표계 = 프로토타입과 동일한 `940×600` 픽셀 기준. 저장은 이 좌표, 화면은 컨테이너에 맞춰 scale.
- UI 카피는 한국어. 사용자 입력은 렌더 시 이스케이프(React 기본 이스케이프에 의존, `dangerouslySetInnerHTML` 금지).
- 커밋 메시지는 다음 트레일러로 끝낸다: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- v1 범위 밖(별도 계획): 소모품 재고/장보기 리스트(v2), 실시간 동기화(v3), AI 이미지 인식(future). 이 계획에서 이 기능들의 코드/컬럼은 만들지 않는다.

---

## File Structure

```
web/
├─ package.json, tsconfig.json, next.config.ts, vitest.config.ts, .env.example, .gitignore
├─ supabase/migrations/0001_init.sql        # 스키마 + RLS
├─ src/
│  ├─ middleware.ts                          # Supabase 세션 갱신
│  ├─ lib/
│  │  ├─ supabase/client.ts                  # 브라우저 클라이언트
│  │  ├─ supabase/server.ts                  # 서버 클라이언트
│  │  ├─ types.ts                            # DB Row 타입 + 상수(STORAGE_TYPES, ROOM_COLORS)
│  │  ├─ geometry.ts                         # 좌표/드래그 순수 로직 (테스트)
│  │  ├─ search.ts                           # 물건 검색 필터 순수 로직 (테스트)
│  │  └─ activity.ts                         # 활동 메시지 조립 순수 로직 (테스트)
│  ├─ data/                                  # 서버 데이터 접근 (per-테이블)
│  │  ├─ family.ts  ├─ rooms.ts  ├─ storages.ts  ├─ items.ts  └─ activity.ts
│  ├─ app/
│  │  ├─ layout.tsx, globals.css
│  │  ├─ login/page.tsx
│  │  ├─ onboarding/page.tsx                 # 가족 생성/참여
│  │  ├─ invite/[token]/page.tsx             # 초대 링크 수락
│  │  ├─ auth/callback/route.ts              # OAuth/매직링크 콜백
│  │  └─ (app)/
│  │     ├─ layout.tsx                       # 보호 레이아웃(로그인+가족 필수)
│  │     └─ page.tsx                         # 지도 앱 셸
│  └─ components/
│     ├─ Header.tsx  ├─ Toolbar.tsx  ├─ MapCanvas.tsx  ├─ RoomShape.tsx
│     ├─ StorageBadge.tsx  ├─ DetailPanel.tsx  ├─ SearchBar.tsx  └─ ActivityFeed.tsx
└─ tests/  (vitest는 src 옆 *.test.ts 사용)
```

각 파일은 한 가지 책임만 갖는다. 순수 로직(`geometry`/`search`/`activity`)은 React·Supabase와 분리해 테스트 가능하게 유지한다.

---

## Task 1: 프로젝트 스캐폴드 + 테스트 러너

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/vitest.config.ts`, `web/.env.example`, `web/.gitignore`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/src/lib/geometry.ts`, `web/src/lib/geometry.test.ts`

**Interfaces:**
- Produces: 실행 가능한 Next.js 앱(`npm run dev`), 통과하는 Vitest(`npm test`), `geometry.ts`의 `fitScale()`·`normalizeRect()`.

- [ ] **Step 1: Next.js 앱 생성**

Run:
```bash
cd web  # 디렉토리 없으면: mkdir -p web && cd web
npx create-next-app@latest . --typescript --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm
```
Expected: `web/src/app/` 생성, `npm run dev` 가능.

- [ ] **Step 2: 의존성 추가**

Run:
```bash
npm i @supabase/supabase-js @supabase/ssr
npm i -D vitest
```

- [ ] **Step 3: Vitest 설정 + npm script**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```
`package.json`의 `"scripts"`에 추가: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: 첫 순수 로직 실패 테스트 작성**

Create `web/src/lib/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fitScale, normalizeRect, LOGICAL_W, LOGICAL_H } from './geometry'

describe('fitScale', () => {
  it('컨테이너에 논리 캔버스를 꽉 맞추되 비율 유지(축소)', () => {
    expect(fitScale(470, 300)).toBeCloseTo(0.5) // 940->470 이 제한
  })
  it('컨테이너가 크면 1을 넘지 않는다', () => {
    expect(fitScale(2000, 2000)).toBe(1)
  })
})
describe('normalizeRect', () => {
  it('드래그 시작/끝을 좌상단+너비/높이로 정규화', () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: 40, y: 200 }))
      .toEqual({ x: 40, y: 80, w: 60, h: 120 })
  })
})
```

- [ ] **Step 5: 실패 확인**

Run: `npm test`
Expected: FAIL — "Cannot find module './geometry'".

- [ ] **Step 6: 최소 구현**

Create `web/src/lib/geometry.ts`:
```ts
export const LOGICAL_W = 940
export const LOGICAL_H = 600

export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

/** 컨테이너 크기에 논리 캔버스를 비율 유지하며 맞추는 배율(최대 1, 확대 안 함) */
export function fitScale(containerW: number, containerH: number): number {
  return Math.min(1, containerW / LOGICAL_W, containerH / LOGICAL_H)
}

/** 드래그 두 점을 좌상단 기준 사각형으로 정규화 */
export function normalizeRect(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/** 점이 방(사각형) 안에 있는지 */
export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}
```

- [ ] **Step 7: 통과 확인**

Run: `npm test`
Expected: PASS (2 passed).

- [ ] **Step 8: 커밋**

```bash
git add web
git commit -m "chore: scaffold Next.js app with vitest and geometry helpers"
```

---

## Task 2: Supabase 클라이언트 + 미들웨어

**Files:**
- Create: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, `web/src/middleware.ts`
- Modify: `web/.env.example`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (env).
- Produces: `createClient()`(브라우저), `createServerClient()`(서버 컴포넌트/액션용), 세션 자동 갱신 미들웨어.

- [ ] **Step 1: env 템플릿**

Create `web/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
> 구현자 메모: 실제 값은 Supabase 프로젝트(Task 3에서 생성) Settings→API에서 복사해 `web/.env.local`에 넣는다. `.env.local`은 `.gitignore`에 있어야 한다(create-next-app 기본 포함 확인).

- [ ] **Step 2: 브라우저 클라이언트**

Create `web/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: 서버 클라이언트**

Create `web/src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* Server Component에서 호출 시 무시(미들웨어가 갱신) */ }
        },
      },
    }
  )
}
```

- [ ] **Step 4: 세션 갱신 미들웨어**

Create `web/src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  await supabase.auth.getUser()
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

- [ ] **Step 5: 타입체크 통과 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add web/src web/.env.example
git commit -m "feat: add supabase browser/server clients and session middleware"
```

> 구현자 메모: `@supabase/ssr`의 쿠키 API는 버전에 따라 시그니처가 바뀔 수 있으니, 설치 후 context7(`@supabase/ssr`)로 현재 `getAll/setAll` 규약을 확인한다.

---

## Task 3: 데이터베이스 스키마 + RLS

**Files:**
- Create: `web/supabase/migrations/0001_init.sql`, `web/src/lib/types.ts`

**Interfaces:**
- Produces: `families`, `family_members`, `family_invites`, `rooms`, `storages`, `items`, `activity` 테이블 + RLS; `web/src/lib/types.ts`의 Row 타입과 `STORAGE_TYPES`·`ROOM_COLORS` 상수.

- [ ] **Step 1: 마이그레이션 SQL 작성**

Create `web/supabase/migrations/0001_init.sql`:
```sql
-- 확장
create extension if not exists pgcrypto;

-- 가족
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- 가족 구성원 (유저 <-> 가족 다대다)
create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  emoji text not null default '🧑',
  color text not null default '#4a7fa5',
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

-- 초대 링크
create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16),'hex'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- 방
create table rooms (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  x int not null, y int not null, w int not null, h int not null,
  color_index int not null default 0,
  created_at timestamptz not null default now()
);

-- 수납장
create table storages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null,
  name text not null,
  x int not null, y int not null,
  created_at timestamptz not null default now()
);

-- 물건
create table items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  storage_id uuid not null references storages(id) on delete cascade,
  name text not null,
  memo text not null default '',
  emoji text not null default '📦',
  photo_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- 활동 로그
create table activity (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index on rooms(family_id);
create index on storages(family_id);
create index on items(family_id);
create index on items(storage_id);
create index on activity(family_id, created_at desc);

-- 멤버십 판정 헬퍼 (RLS에서 재사용, SECURITY DEFINER로 재귀 정책 회피)
create or replace function is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from family_members where family_id = fid and user_id = auth.uid()
  );
$$;

-- RLS 활성화
alter table families        enable row level security;
alter table family_members  enable row level security;
alter table family_invites  enable row level security;
alter table rooms           enable row level security;
alter table storages        enable row level security;
alter table items           enable row level security;
alter table activity        enable row level security;

-- families: 내가 멤버인 가족만 조회/수정, 생성은 본인이 created_by
create policy fam_select on families for select using (is_family_member(id));
create policy fam_insert on families for insert with check (created_by = auth.uid());
create policy fam_update on families for update using (is_family_member(id));

-- family_members: 내가 속한 가족의 멤버 목록 조회, 본인 행 삽입(가족 참여) 허용
create policy fm_select on family_members for select using (is_family_member(family_id));
create policy fm_insert on family_members for insert with check (user_id = auth.uid());
create policy fm_delete on family_members for delete using (user_id = auth.uid());

-- family_invites: 같은 가족 멤버만 조회/생성 (토큰 단건 조회는 Task 5의 서버 라우트에서 service 경유)
create policy inv_all on family_invites for all
  using (is_family_member(family_id)) with check (is_family_member(family_id));

-- 나머지 도메인 테이블: 멤버 전체 권한
create policy rooms_all    on rooms    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy storages_all on storages for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy items_all    on items    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy activity_all on activity for all using (is_family_member(family_id)) with check (is_family_member(family_id));
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase 대시보드 SQL Editor에 위 파일 내용을 붙여 실행하거나, CLI 사용 시:
```bash
supabase link --project-ref <ref>
supabase db push
```
Expected: 7개 테이블 + 정책 생성, 에러 없음.

- [ ] **Step 3: RLS 격리 수동 검증**

SQL Editor에서: 서로 다른 두 유저를 만들고 각자 가족을 만든 뒤, `set request.jwt.claim.sub` 없이/있이 조회해 **다른 가족 데이터가 안 보이는지** 확인. (또는 두 브라우저 세션으로 Task 5 완료 후 재검증)
Expected: 유저 A는 유저 B의 `families`/`items`를 select 시 0행.

- [ ] **Step 4: TS 타입 + 도메인 상수**

Create `web/src/lib/types.ts`:
```ts
export type UUID = string

export type Family = { id: UUID; name: string; created_by: UUID; created_at: string }
export type FamilyMember = {
  id: UUID; family_id: UUID; user_id: UUID; display_name: string
  emoji: string; color: string; role: 'owner' | 'member'; joined_at: string
}
export type Room = {
  id: UUID; family_id: UUID; name: string
  x: number; y: number; w: number; h: number; color_index: number; created_at: string
}
export type Storage = {
  id: UUID; family_id: UUID; room_id: UUID; type: StorageTypeKey
  name: string; x: number; y: number; created_at: string
}
export type Item = {
  id: UUID; family_id: UUID; storage_id: UUID; name: string; memo: string
  emoji: string; photo_path: string | null; created_by: UUID; created_at: string
}
export type Activity = {
  id: UUID; family_id: UUID; actor_id: UUID; kind: string
  payload: Record<string, unknown>; created_at: string
}

export type StorageTypeKey = 'drawer' | 'closet' | 'shelf' | 'fridge' | 'box' | 'shoe'
export const STORAGE_TYPES: { type: StorageTypeKey; em: string; label: string }[] = [
  { type: 'drawer', em: '🗄️', label: '서랍장' },
  { type: 'closet', em: '🚪', label: '옷장' },
  { type: 'shelf',  em: '📚', label: '선반' },
  { type: 'fridge', em: '🧊', label: '냉장고' },
  { type: 'box',    em: '📦', label: '수납박스' },
  { type: 'shoe',   em: '👟', label: '신발장' },
]
export const ROOM_COLORS = [
  { fill: 'rgba(122,168,116,.16)', border: '#7aa874', name: '초록' },
  { fill: 'rgba(107,142,181,.16)', border: '#6b8eb5', name: '파랑' },
  { fill: 'rgba(224,158,84,.18)',  border: '#d99a50', name: '주황' },
  { fill: 'rgba(186,124,168,.16)', border: '#ba7ca8', name: '분홍' },
  { fill: 'rgba(153,143,101,.18)', border: '#a79a63', name: '카키' },
]
```

- [ ] **Step 5: 커밋**

```bash
git add web/supabase web/src/lib/types.ts
git commit -m "feat: add db schema, RLS policies, and domain types"
```

---

## Task 4: 인증 (로그인 + 콜백)

**Files:**
- Create: `web/src/app/login/page.tsx`, `web/src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: Supabase 클라이언트(Task 2).
- Produces: `/login`(이메일 매직링크 + 카카오/구글 버튼), `/auth/callback`(세션 교환 후 `/`로 리다이렉트).

- [ ] **Step 1: 로그인 페이지**

Create `web/src/app/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const redirectTo = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/callback` : undefined

  const sendMagicLink = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    if (!error) setSent(true)
  }
  const oauth = (provider: 'kakao' | 'google') =>
    supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui', textAlign: 'center' }}>
      <h1>🔍🏠 홈즈맵</h1>
      <p>우리집 물건 지도</p>
      {sent ? <p>메일로 로그인 링크를 보냈어요. 확인해주세요.</p> : (
        <>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일"
                 style={{ width: '100%', padding: 10, margin: '12px 0' }} />
          <button onClick={sendMagicLink} style={{ width: '100%', padding: 10 }}>이메일로 로그인</button>
        </>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => oauth('kakao')} style={{ flex: 1, padding: 10 }}>카카오</button>
        <button onClick={() => oauth('google')} style={{ flex: 1, padding: 10 }}>구글</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 콜백 라우트**

Create `web/src/app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/`)
}
```

- [ ] **Step 3: OAuth 제공자 설정 (수동)**

Supabase 대시보드 Authentication→Providers에서 카카오·구글 활성화하고, 각 콘솔에서 발급한 Client ID/Secret과 리다이렉트 URL(`https://<ref>.supabase.co/auth/v1/callback`)을 등록.
Expected: 로그인 페이지의 카카오/구글 버튼이 실제 로그인으로 이어짐.

- [ ] **Step 4: 브라우저 검증**

Run: `npm run dev` 후 `/login`에서 이메일 매직링크 발송 → 메일 링크 클릭 → `/`로 이동, 세션 유지.
Expected: 로그인 후 새로고침해도 로그인 상태 유지.

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/login web/src/app/auth
git commit -m "feat: add login page (magic link + kakao/google) and auth callback"
```

---

## Task 5: 가족 온보딩 (생성 / 초대 참여) + 보호 레이아웃

**Files:**
- Create: `web/src/data/family.ts`, `web/src/app/onboarding/page.tsx`, `web/src/app/invite/[token]/page.tsx`, `web/src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: 서버 Supabase 클라이언트, `Family`/`FamilyMember` 타입.
- Produces: `getMyFamily()`, `createFamily(name, displayName)`, `joinFamilyByToken(token, displayName)`; 로그인+가족 없으면 리다이렉트하는 `(app)/layout.tsx`.

- [ ] **Step 1: 가족 데이터 접근 작성**

Create `web/src/data/family.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import type { Family, FamilyMember } from '@/lib/types'

/** 현재 유저의 활성 가족(첫 가입 가족) + 멤버 목록. 없으면 null. */
export async function getMyFamily(): Promise<{ family: Family; members: FamilyMember[] } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: mem } = await supabase
    .from('family_members').select('family_id').eq('user_id', user.id)
    .order('joined_at', { ascending: true }).limit(1).maybeSingle()
  if (!mem) return null
  const { data: family } = await supabase.from('families').select('*').eq('id', mem.family_id).single()
  const { data: members } = await supabase.from('family_members').select('*').eq('family_id', mem.family_id)
  return family ? { family, members: members ?? [] } : null
}

/** 새 가족 생성 + 본인을 owner 멤버로 등록 */
export async function createFamily(name: string, displayName: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data: fam, error } = await supabase
    .from('families').insert({ name, created_by: user.id }).select('id').single()
  if (error || !fam) throw error ?? new Error('create failed')
  await supabase.from('family_members')
    .insert({ family_id: fam.id, user_id: user.id, display_name: displayName, role: 'owner' })
  return fam.id
}

/** 초대 토큰으로 가족 참여 */
export async function joinFamilyByToken(token: string, displayName: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data: invite } = await supabase
    .from('family_invites').select('family_id, expires_at').eq('token', token).maybeSingle()
  if (!invite) throw new Error('invalid invite')
  if (new Date(invite.expires_at) < new Date()) throw new Error('expired invite')
  await supabase.from('family_members')
    .insert({ family_id: invite.family_id, user_id: user.id, display_name: displayName, role: 'member' })
  return invite.family_id
}
```
> RLS 메모: 초대 참여 시 `family_invites` select는 아직 멤버가 아니라 정책에 막힌다. v1은 **초대 링크 페이지를 서버 액션으로 두고**, invite 단건 조회에 한해 서비스 키(server-only) 또는 `security definer` RPC를 쓴다. 가장 단순한 구현: 아래 RPC를 마이그레이션에 추가.

Add to `0001_init.sql` (재적용):
```sql
create or replace function join_family(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from family_invites
    where token = p_token and expires_at > now();
  if v_family is null then raise exception 'invalid or expired invite'; end if;
  insert into family_members(family_id, user_id, display_name, role)
    values (v_family, auth.uid(), p_display_name, 'member')
    on conflict (family_id, user_id) do nothing;
  return v_family;
end; $$;
```
그리고 `joinFamilyByToken`을 `supabase.rpc('join_family', { p_token: token, p_display_name: displayName })` 호출로 교체.

- [ ] **Step 2: 온보딩 페이지 (가족 만들기)**

Create `web/src/app/onboarding/page.tsx` — 클라이언트 폼에서 서버 액션 호출로 `createFamily` 실행 후 `/`로 이동. (가족 이름, 내 표시이름 입력)
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createFamilyAction } from './actions'

export default function Onboarding() {
  const [name, setName] = useState(''); const [me, setMe] = useState('')
  const router = useRouter()
  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>가족 만들기</h1>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="가족(집) 이름 예: 우리집" style={{width:'100%',padding:10,margin:'8px 0'}}/>
      <input value={me} onChange={e=>setMe(e.target.value)} placeholder="내 이름 예: 아빠" style={{width:'100%',padding:10,margin:'8px 0'}}/>
      <button style={{width:'100%',padding:10}} onClick={async()=>{ await createFamilyAction(name, me); router.push('/') }}>만들기</button>
    </main>
  )
}
```
Create `web/src/app/onboarding/actions.ts`:
```ts
'use server'
import { createFamily } from '@/data/family'
export async function createFamilyAction(name: string, displayName: string) {
  if (!name.trim() || !displayName.trim()) throw new Error('입력 필요')
  await createFamily(name.trim(), displayName.trim())
}
```

- [ ] **Step 3: 초대 수락 페이지**

Create `web/src/app/invite/[token]/page.tsx` — 로그인 확인 후 표시이름 입력 → `joinFamilyByToken` 호출 → `/`. (미로그인 시 `/login`으로, 로그인 후 돌아오도록 token을 쿼리로 유지) 서버 액션 `joinFamilyAction(token, displayName)`는 `data/family.ts`의 `joinFamilyByToken`을 감싼다.

- [ ] **Step 4: 보호 레이아웃**

Create `web/src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyFamily } from '@/data/family'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const fam = await getMyFamily()
  if (!fam) redirect('/onboarding')
  return <>{children}</>
}
```

- [ ] **Step 5: 브라우저 검증**

로그인 후 `/` 접근 → 가족 없으면 `/onboarding`으로, 가족 만들면 `/`로 진입. 다른 계정으로 초대 링크 접속 시 참여되고 같은 가족 데이터가 보임.
Expected: 가족 격리 + 참여 흐름 동작.

- [ ] **Step 6: 커밋**

```bash
git add web/src/data web/src/app/onboarding web/src/app/invite "web/src/app/(app)/layout.tsx" web/supabase
git commit -m "feat: family create/join onboarding, invite RPC, protected layout"
```

---

## Task 6: 도메인 데이터 접근 + 활동 메시지 로직

**Files:**
- Create: `web/src/data/rooms.ts`, `web/src/data/storages.ts`, `web/src/data/items.ts`, `web/src/data/activity.ts`, `web/src/lib/activity.ts`, `web/src/lib/activity.test.ts`, `web/src/lib/search.ts`, `web/src/lib/search.test.ts`

**Interfaces:**
- Produces:
  - `loadMap(familyId)` → `{ rooms, storages, items }`
  - `addRoom`, `deleteRoom`, `addStorage`, `deleteStorage`, `addItem`, `deleteItem`, `recentActivity`
  - `buildActivityMessage(kind, payload, member)` (순수) — 활동 한 줄 텍스트
  - `searchItems(items, storages, rooms, query)` (순수) → 위치 포함 결과 배열

- [ ] **Step 1: 검색 로직 실패 테스트**

Create `web/src/lib/search.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { searchItems } from './search'

const rooms = [{ id: 'r1', name: '거실' } as any]
const storages = [{ id: 's1', room_id: 'r1', name: 'TV장 서랍' } as any]
const items = [
  { id: 'i1', storage_id: 's1', name: '손톱깎이', memo: '왼쪽 첫 칸' } as any,
  { id: 'i2', storage_id: 's1', name: '건전지', memo: '' } as any,
]

describe('searchItems', () => {
  it('이름 부분일치로 위치와 함께 반환', () => {
    const r = searchItems(items, storages, rooms, '손톱')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ itemId: 'i1', storageId: 's1', roomName: '거실', storageName: 'TV장 서랍' })
  })
  it('메모도 검색, 빈 쿼리는 빈 배열', () => {
    expect(searchItems(items, storages, rooms, '왼쪽')).toHaveLength(1)
    expect(searchItems(items, storages, rooms, '  ')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- search`
Expected: FAIL — module not found.

- [ ] **Step 3: 검색 로직 구현**

Create `web/src/lib/search.ts`:
```ts
import type { Item, Storage, Room } from './types'

export type SearchHit = {
  itemId: string; storageId: string; roomName: string; storageName: string; memo: string
}

export function searchItems(items: Item[], storages: Storage[], rooms: Room[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const sById = new Map(storages.map(s => [s.id, s]))
  const rById = new Map(rooms.map(r => [r.id, r]))
  return items
    .filter(i => i.name.toLowerCase().includes(q) || (i.memo && i.memo.toLowerCase().includes(q)))
    .slice(0, 8)
    .map(i => {
      const s = sById.get(i.storage_id)
      const r = s ? rById.get(s.room_id) : undefined
      return {
        itemId: i.id, storageId: s?.id ?? '',
        roomName: r?.name ?? '?', storageName: s?.name ?? '?', memo: i.memo,
      }
    })
}
```

- [ ] **Step 4: 활동 메시지 실패 테스트**

Create `web/src/lib/activity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildActivityMessage } from './activity'

const member = { display_name: '엄마', emoji: '👩' } as any

describe('buildActivityMessage', () => {
  it('물건 등록 활동 문장', () => {
    const msg = buildActivityMessage('item_added', { roomName: '안방', storageName: '붙박이장', itemName: '겨울 이불' }, member)
    expect(msg).toBe("👩 엄마님이 안방 붙박이장에 '겨울 이불' 등록")
  })
  it('멤버 없으면 물음표 없이 안전하게', () => {
    const msg = buildActivityMessage('storage_added', { roomName: '주방', storageName: '상부장' }, undefined)
    expect(msg).toContain('주방에 상부장')
  })
})
```

- [ ] **Step 5: 실패 확인 → 활동 로직 구현**

Run: `npm test -- activity` → FAIL. 그다음 Create `web/src/lib/activity.ts`:
```ts
import type { FamilyMember } from './types'

type Payload = Record<string, string>

export function buildActivityMessage(kind: string, p: Payload, member?: Pick<FamilyMember,'display_name'|'emoji'>): string {
  const who = member ? `${member.emoji} ${member.display_name}님이` : '누군가'
  switch (kind) {
    case 'item_added':    return `${who} ${p.roomName} ${p.storageName}에 '${p.itemName}' 등록`
    case 'storage_added': return `${who} ${p.roomName}에 ${p.storageName}을(를) 만들었어요`
    default:              return `${who} 활동했어요`
  }
}
```

- [ ] **Step 6: 통과 확인**

Run: `npm test`
Expected: geometry/search/activity 모두 PASS.

- [ ] **Step 7: 데이터 접근 함수 작성**

Create `web/src/data/rooms.ts`, `storages.ts`, `items.ts`, `activity.ts`. 예시 `web/src/data/items.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import type { Item } from '@/lib/types'

export async function addItem(input: {
  family_id: string; storage_id: string; name: string; memo?: string; photo_path?: string | null
}): Promise<Item> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('items')
    .insert({ ...input, memo: input.memo ?? '', created_by: user!.id }).select('*').single()
  if (error) throw error
  return data
}
export async function deleteItem(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw error
}
```
`rooms.ts`(addRoom/deleteRoom), `storages.ts`(addStorage/deleteStorage), `activity.ts`(logActivity/recentActivity, `recentActivity`는 `limit(50)`)도 동일 패턴으로. `loadMap(familyId)`은 `rooms.ts`에 두고 세 테이블을 병렬 조회해 반환.

- [ ] **Step 8: 커밋**

```bash
git add web/src/lib/search.ts web/src/lib/search.test.ts web/src/lib/activity.ts web/src/lib/activity.test.ts web/src/data
git commit -m "feat: domain data access + tested search/activity logic"
```

---

## Task 7: 지도 렌더 (읽기 전용) — DB 데이터 표시

**Files:**
- Create: `web/src/app/(app)/page.tsx`, `web/src/components/MapCanvas.tsx`, `web/src/components/RoomShape.tsx`, `web/src/components/StorageBadge.tsx`, `web/src/components/Header.tsx`, `web/src/app/globals.css`(프로토타입 CSS 이식)

**Interfaces:**
- Consumes: `loadMap`, `getMyFamily`, `geometry.fitScale`, 상수.
- Produces: 로그인+가족 상태에서 DB의 방·수납장을 논리 캔버스에 반응형으로 렌더. 수납장 클릭 시 콜백(다음 태스크에서 패널 연결).

- [ ] **Step 1: 프로토타입 CSS 이식**

`homesmap.html`의 `<style>` 블록을 `web/src/app/globals.css`로 옮긴다(색 토큰, `.room`, `.storage`, `.map` 등). React className과 매칭.

- [ ] **Step 2: 페이지 셸(서버 컴포넌트)에서 데이터 로드**

Create `web/src/app/(app)/page.tsx`:
```tsx
import { getMyFamily } from '@/data/family'
import { loadMap } from '@/data/rooms'
import MapCanvas from '@/components/MapCanvas'
import Header from '@/components/Header'

export default async function Page() {
  const fam = (await getMyFamily())!
  const { rooms, storages, items } = await loadMap(fam.family.id)
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header family={fam.family} members={fam.members} />
      <MapCanvas familyId={fam.family.id} rooms={rooms} storages={storages} items={items} members={fam.members} />
    </div>
  )
}
```

- [ ] **Step 3: MapCanvas — 반응형 스케일 + 렌더**

Create `web/src/components/MapCanvas.tsx`(클라이언트 컴포넌트). `LOGICAL_W/H` 크기 `#map`을 `fitScale(containerW, containerH)`로 `transform: scale()`. `rooms.map`→`<RoomShape>`, `storages.map`→`<StorageBadge onClick=...>`. `ResizeObserver`로 컨테이너 크기 추적. (이 태스크에서는 클릭 시 `console.log`만, 편집/패널은 Task 8·9)

- [ ] **Step 4: RoomShape / StorageBadge / Header**

프로토타입 `renderMap`의 DOM 구조를 컴포넌트로 분해. `RoomShape`: 색·라벨. `StorageBadge`: 이모지·물건수 배지·라벨. `Header`: 로고 + 검색창 자리(Task 10) + 멤버 칩(읽기 표시).

- [ ] **Step 5: 브라우저 검증**

DB에 방·수납장 몇 개를 수동 insert(또는 Task 8로 생성 후) → `/`에서 지도에 표시, 창 크기 줄이면 캔버스가 비율 유지하며 축소.
Expected: 방/수납장이 좌표대로 보이고 반응형 스케일 동작.

- [ ] **Step 6: 커밋**

```bash
git add web/src/app "web/src/app/(app)" web/src/components web/src/app/globals.css
git commit -m "feat: read-only responsive map render from db"
```

---

## Task 8: 지도 편집 — 방 그리기 · 수납장 놓기 · 삭제

**Files:**
- Modify: `web/src/components/MapCanvas.tsx`
- Create: `web/src/components/Toolbar.tsx`, `web/src/app/(app)/actions.ts`

**Interfaces:**
- Consumes: `geometry.normalizeRect`·`pointInRect`, `data/rooms.addRoom/deleteRoom`, `data/storages.addStorage/deleteStorage`.
- Produces: 서버 액션 `createRoomAction`, `createStorageAction`, `deleteRoomAction`, `deleteStorageAction`; 3-모드 툴바.

- [ ] **Step 1: 서버 액션**

Create `web/src/app/(app)/actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { addRoom, deleteRoom } from '@/data/rooms'
import { addStorage, deleteStorage } from '@/data/storages'
import { logActivity } from '@/data/activity'

export async function createRoomAction(familyId: string, r: { name: string; x: number; y: number; w: number; h: number; color_index: number }) {
  await addRoom({ family_id: familyId, ...r }); revalidatePath('/')
}
export async function createStorageAction(familyId: string, s: { room_id: string; type: string; name: string; x: number; y: number; roomName: string }) {
  const created = await addStorage({ family_id: familyId, room_id: s.room_id, type: s.type, name: s.name, x: s.x, y: s.y })
  await logActivity(familyId, 'storage_added', { roomName: s.roomName, storageName: s.name })
  revalidatePath('/'); return created
}
export async function deleteRoomAction(id: string) { await deleteRoom(id); revalidatePath('/') }
export async function deleteStorageAction(id: string) { await deleteStorage(id); revalidatePath('/') }
```

- [ ] **Step 2: 툴바 (모드 전환)**

Create `web/src/components/Toolbar.tsx` — `select`/`room`/`storage` 모드 버튼 + 수납장 종류 팔레트(`STORAGE_TYPES`). 프로토타입 `.mode-btn`·`#storagePalette` 이식. 선택 모드/종류를 부모(MapCanvas) 상태로 올림.

- [ ] **Step 3: 방 그리기 드래그(데스크톱)**

MapCanvas에 `mousedown/mousemove/mouseup` 추가. 프로토타입 로직 이식하되 좌표는 `mapPos`에서 **스케일 역보정**(clientX 차이를 현재 scale로 나눔). `normalizeRect`로 사각형 산출, `w<60||h<50`이면 무시. 유효하면 이름·색 모달 → `createRoomAction` → `router.refresh()`.

- [ ] **Step 4: 수납장 놓기(클릭)**

`select`가 아닌 `storage` 모드에서 맵 클릭 → `pointInRect`로 어느 방인지 판정(없으면 토스트). 이름 모달 → `createStorageAction`.

- [ ] **Step 5: 삭제**

방 hover 시 ✕ → `deleteRoomAction`(cascade로 하위 삭제). 수납장 삭제는 Task 9 패널에서.

- [ ] **Step 6: 브라우저 검증**

데스크톱에서 드래그로 방 생성 → 이름/색 지정 → 방 표시, 수납장 종류 골라 방 안 클릭 → 배치, 활동에 기록. 삭제 시 하위까지 사라짐.
Expected: 생성·배치·삭제 모두 DB 반영 + 새로고침 유지.

- [ ] **Step 7: 커밋**

```bash
git add web/src/components/MapCanvas.tsx web/src/components/Toolbar.tsx "web/src/app/(app)/actions.ts"
git commit -m "feat: map editing - draw room, place storage, delete"
```

---

## Task 9: 상세 패널 — 물건 등록/삭제 + 사진 업로드

**Files:**
- Create: `web/src/components/DetailPanel.tsx`
- Modify: `web/src/app/(app)/actions.ts`, `web/src/components/MapCanvas.tsx`

**Interfaces:**
- Consumes: `data/items.addItem/deleteItem`, Supabase Storage.
- Produces: 서버 액션 `addItemAction(familyId, storageId, draft[])`(draft→일괄 insert), `deleteItemAction`, `uploadItemPhoto`; 수납장 클릭 시 열리는 상세 패널.

- [ ] **Step 1: 사진 업로드 유틸 + 액션**

`web/src/app/(app)/actions.ts`에 추가:
```ts
import { addItem, deleteItem } from '@/data/items'
import { logActivity } from '@/data/activity'

export type ItemDraft = { name: string; memo: string; photo_path: string | null }

export async function addItemsAction(familyId: string, storageId: string, roomName: string, storageName: string, drafts: ItemDraft[]) {
  for (const d of drafts) {
    if (!d.name.trim()) continue
    await addItem({ family_id: familyId, storage_id: storageId, name: d.name.trim(), memo: d.memo.trim(), photo_path: d.photo_path })
    await logActivity(familyId, 'item_added', { roomName, storageName, itemName: d.name.trim() })
  }
  revalidatePath('/')
}
export async function deleteItemAction(id: string) { await deleteItem(id); revalidatePath('/') }
```
> draft 배열 형태로 받는 것이 future AI 인식(여러 물건 한 번에 확인)과 붙는 이음새. v1 UI는 항상 draft 1건을 넘긴다.

- [ ] **Step 2: 사진 업로드(클라이언트)**

DetailPanel에서 파일 선택 시 브라우저 Supabase 클라이언트로 `item-photos` 버킷에 `{familyId}/{tempId}/{uuid}` 업로드 후 경로를 draft.photo_path로. 표시용은 `createSignedUrl`. (버킷은 Supabase 대시보드에서 private로 생성 + Storage RLS: 경로 첫 세그먼트가 내 가족 id일 때만 접근)

- [ ] **Step 3: DetailPanel 컴포넌트**

프로토타입 `openStorage`의 패널 마크업(물건 카드 목록 + 등록 폼)을 React로. 물건 카드: 썸네일(photo 서명URL 또는 이모지)·이름·메모·등록자. 폼: 이름·메모·사진·등록 버튼. 등록 시 `addItemsAction([{name,memo,photo_path}])` → `router.refresh()` + 패널 유지. 삭제 버튼 → `deleteItemAction`.

- [ ] **Step 4: MapCanvas ↔ 패널 연결**

`StorageBadge` 클릭 → 선택 storageId 상태 → `DetailPanel open`. `select` 모드에서 동작.

- [ ] **Step 5: 브라우저 검증**

수납장 클릭 → 패널 열림 → 이름·메모·사진으로 물건 등록 → 지도 배지 카운트 증가, 활동에 기록. 사진 첨부한 물건은 썸네일 표시. 삭제 동작.
Expected: 물건 CRUD + 사진 저장/표시 정상.

- [ ] **Step 6: 커밋**

```bash
git add web/src/components/DetailPanel.tsx "web/src/app/(app)/actions.ts" web/src/components/MapCanvas.tsx
git commit -m "feat: detail panel - item add/delete with photo upload"
```

---

## Task 10: 검색 + 활동 피드 + 배포

**Files:**
- Create: `web/src/components/SearchBar.tsx`, `web/src/components/ActivityFeed.tsx`
- Modify: `web/src/components/Header.tsx`, `web/src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `lib/search.searchItems`, `lib/activity.buildActivityMessage`, `data/activity.recentActivity`.
- Produces: 헤더 검색창(결과 클릭 시 지도 플래시), 활동 피드 사이드; Vercel 배포.

- [ ] **Step 1: 검색바**

Create `web/src/components/SearchBar.tsx` — 입력 시 `searchItems(items, storages, rooms, q)` 호출(클라이언트, props로 받은 현재 데이터). 결과 드롭다운. 결과 클릭 → 콜백으로 상위에 `{storageId}` 전달 → 해당 수납장 패널 열고 지도에서 방 glow + 수납장 pulse(프로토타입 `flashStorage` 이식, `scrollIntoView`+클래스 토글).

- [ ] **Step 2: 활동 피드**

Create `web/src/components/ActivityFeed.tsx` — `recentActivity(familyId)`(서버, page.tsx에서 로드해 props 전달)의 각 행을 `buildActivityMessage(kind, payload, memberOf(actor_id))`로 렌더. 최근 50건, 없으면 안내 문구.

- [ ] **Step 3: 페이지에 배선**

`page.tsx`에서 `recentActivity` 로드해 `ActivityFeed`에 전달, `Header`에 검색 데이터 전달. MapCanvas에 flash 대상 storageId 연결.

- [ ] **Step 4: 전체 수동 시나리오 검증**

Run: `npm run dev`
시나리오: 로그인 → 가족 생성 → 방 그리기 → 수납장 배치 → '손톱깎이' 물건 등록 → 검색창에 '손톱' → 결과 클릭 → 지도에서 해당 위치 반짝임 + 패널 열림 → 활동 피드에 등록 기록.
Expected: 전 흐름 무결.

- [ ] **Step 5: 린트/타입/테스트 통과**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: 모두 통과.

- [ ] **Step 6: Vercel 배포**

Vercel에서 이 저장소 연결, **Root Directory = `web`**, 환경변수(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) 설정. `git push` 시 자동 배포.
Expected: 배포 URL에서 로그인~검색 전 흐름 동작.

- [ ] **Step 7: 커밋**

```bash
git add web/src/components/SearchBar.tsx web/src/components/ActivityFeed.tsx web/src/components/Header.tsx "web/src/app/(app)/page.tsx"
git commit -m "feat: item search with map flash + family activity feed"
```

---

## 다음 계획 (별도 문서)
- **v2 소모품**: `items`에 `is_consumable`/`quantity`/`low_threshold`/`shopping_url` 마이그레이션, 수량 조정 UI, 재고≤임계 → `shopping_list` 자동 등록 로직, 장보기 리스트 화면, "사러 가기" 외부 링크.
- **v3 실시간·모바일 마감**: Supabase Realtime 구독, 모바일 방 그리기(핸들 조정) UX, 성능.

---

## Self-Review

- **Spec 커버리지**: 인증(T4)·가족/초대(T5)·지도에디터(T7·T8)·물건등록(T9)·검색(T10)·활동피드(T10)·사진(T9)·반응형(T7) — 설계 v1 항목 모두 태스크 존재. 소모품/실시간/AI는 의도적으로 v1 범위 밖(별도 계획).
- **Placeholder 스캔**: "적절히 처리" 류 없음. UI 태스크의 컴포넌트 세부는 프로토타입 이식으로 근거 명시.
- **타입 일관성**: `Item.storage_id`, `Storage.room_id`, `Room.color_index`가 스키마·타입·검색·데이터접근에서 동일. `buildActivityMessage`/`searchItems` 시그니처가 테스트와 소비처에서 일치.
