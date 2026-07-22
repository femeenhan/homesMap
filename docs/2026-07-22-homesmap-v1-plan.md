# 홈즈맵 v1 (핵심) 구현 계획 — 로컬-퍼스트 PWA + E2E 암호화

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족이 가입해 집 지도에 방·수납장·물건을 등록하고 검색으로 찾는 앱을, 로컬-퍼스트 PWA로 만들되 물건 이름·메모·사진은 종단간(E2E) 암호화한다.

**Architecture:** 기기의 IndexedDB가 1차 데이터 소스(즉시·오프라인). Supabase는 인증 + 암호블롭 동기화 저장소 + 사진 저장. 물건 이름/메모/사진과 활동 payload는 가족키(FDK)로 AES-GCM 암호화 — 서버는 복호화 키가 없다. 동기화는 `updated_at` 기반 last-write-wins.

**Tech Stack:** Next.js(App Router, 주로 클라이언트), `@supabase/ssr`·`@supabase/supabase-js`, Web Crypto API(암호화, 의존성 0), 자체 IndexedDB 래퍼, Vitest, Vercel.

## Global Constraints

- 루트는 `web/`, Vercel Root Directory = `web/`.
- **로컬-퍼스트**: UI는 IndexedDB에서만 읽는다. 서버 직접 조회로 렌더하지 않는다.
- **암호화 대상**: `items.enc_name`·`items.enc_memo`·사진·`activity.enc_payload`. **평문 유지**: 방·수납장 이름/좌표/종류, 이모지, 관계, 수량류(v2).
- **KDF = PBKDF2**(WebCrypto 내장, 반복 600,000, SHA-256). 새 암호 라이브러리 의존 금지.
- **키 관리**: 가족당 랜덤 FDK(AES-GCM 256). 기기 유지 = 패스프레이즈로 래핑해 `family_members.wrapped_family_key` 저장. 새 멤버 공유 = 초대 링크 **URL 프래그먼트**(`#k=`, 서버 미전송). 복구 = 생성 시 복구코드(원본 FDK) 1회 표시, **서버 보조 복구 없음**.
- **동기화**: 모든 동기화 테이블에 `updated_at`·`deleted_at`. 쓰기 시 클라이언트가 `updated_at` 스탬프(LWW 기준). 삭제는 소프트.
- RLS는 E2E와 다층 방어로 병행(모든 테이블 `family_id` 스코프).
- UI 한국어. `dangerouslySetInnerHTML` 금지(React 기본 이스케이프).
- 커밋 메시지 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- v1 범위 밖(별도 계획): 소모품/장보기(v2), 실시간 반영·생체인증(v3), AI 인식(future).

---

## File Structure

```
web/
├─ package.json, tsconfig.json, next.config.ts, vitest.config.ts, .env.example, .gitignore
├─ public/manifest.webmanifest, public/sw.js, public/icon-192.png, public/icon-512.png
├─ supabase/migrations/0001_init.sql
├─ src/
│  ├─ middleware.ts
│  ├─ lib/
│  │  ├─ supabase/client.ts, supabase/server.ts
│  │  ├─ types.ts                # Row 타입 + STORAGE_TYPES/ROOM_COLORS
│  │  ├─ crypto.ts               # FDK/암복호/래핑 (Web Crypto, TDD)
│  │  ├─ geometry.ts             # 좌표/드래그 (TDD)
│  │  ├─ search.ts               # 검색 필터 (TDD)
│  │  ├─ merge.ts                # LWW 병합 (TDD)
│  │  ├─ idb.ts                  # IndexedDB 얇은 래퍼
│  │  ├─ store.ts                # 로컬 스토어(IndexedDB 미러 + dirty)
│  │  ├─ sync.ts                 # pull/push 동기화 엔진
│  │  └─ keys.ts                 # 세션 FDK 보관 + 온보딩 키 로직
│  ├─ app/
│  │  ├─ layout.tsx, globals.css
│  │  ├─ login/page.tsx, auth/callback/route.ts
│  │  ├─ onboarding/page.tsx     # 가족 생성/참여 + 패스프레이즈 + 복구코드
│  │  ├─ unlock/page.tsx         # 기존 기기/재로그인 시 패스프레이즈 잠금해제
│  │  ├─ invite/[token]/page.tsx
│  │  └─ (app)/layout.tsx, (app)/page.tsx
│  └─ components/
│     ├─ Header.tsx, Toolbar.tsx, MapCanvas.tsx, RoomShape.tsx,
│     ├─ StorageBadge.tsx, DetailPanel.tsx, SearchBar.tsx, ActivityFeed.tsx
└─ (테스트는 src 옆 *.test.ts)
```

---

## Task 1: 스캐폴드 + PWA 셸 + geometry(TDD)

**Files:** Create `web/` (create-next-app), `web/vitest.config.ts`, `web/public/manifest.webmanifest`, `web/public/sw.js`, `web/src/app/globals.css`(빈), `web/src/lib/geometry.ts`, `web/src/lib/geometry.test.ts`

**Interfaces:** Produces `fitScale()`, `normalizeRect()`, `pointInRect()`, `LOGICAL_W/H`; 설치 가능한 PWA 셸.

- [ ] **Step 1: 앱 생성 + 의존성**
```bash
mkdir -p web && cd web
npx create-next-app@latest . --typescript --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm
npm i @supabase/supabase-js @supabase/ssr
npm i -D vitest
```

- [ ] **Step 2: vitest 설정** — Create `web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```
`package.json` scripts에 `"test": "vitest run"` 추가.

- [ ] **Step 3: geometry 실패 테스트** — Create `web/src/lib/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fitScale, normalizeRect, pointInRect } from './geometry'

describe('geometry', () => {
  it('fitScale: 비율 유지 축소, 최대 1', () => {
    expect(fitScale(470, 300)).toBeCloseTo(0.5)
    expect(fitScale(2000, 2000)).toBe(1)
  })
  it('normalizeRect: 좌상단+w/h 정규화', () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: 40, y: 200 })).toEqual({ x: 40, y: 80, w: 60, h: 120 })
  })
  it('pointInRect', () => {
    expect(pointInRect({ x: 50, y: 50 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(true)
    expect(pointInRect({ x: 5, y: 5 }, { x: 40, y: 40, w: 100, h: 100 })).toBe(false)
  })
})
```
Run `npm test` → FAIL.

- [ ] **Step 4: geometry 구현** — Create `web/src/lib/geometry.ts`:
```ts
export const LOGICAL_W = 940
export const LOGICAL_H = 600
export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export function fitScale(cw: number, ch: number): number {
  return Math.min(1, cw / LOGICAL_W, ch / LOGICAL_H)
}
export function normalizeRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}
export function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}
```
Run `npm test` → PASS.

- [ ] **Step 5: PWA 매니페스트 + 최소 서비스워커** — Create `web/public/manifest.webmanifest`:
```json
{
  "name": "홈즈맵", "short_name": "홈즈맵", "start_url": "/", "display": "standalone",
  "background_color": "#f7f2e9", "theme_color": "#e8663c",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
Create `web/public/sw.js` (앱 셸만 캐시, 데이터는 IndexedDB 담당):
```js
const CACHE = 'homesmap-shell-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // API/동기화 요청은 건드리지 않음. 정적 문서/스크립트만 stale-while-revalidate.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith((async () => {
    const cached = await caches.match(e.request)
    const net = fetch(e.request).then(async (res) => {
      const c = await caches.open(CACHE); c.put(e.request, res.clone()); return res
    }).catch(() => cached)
    return cached || net
  })())
})
```
`public/icon-192.png`·`icon-512.png`: 임시 아이콘(단색 🔍🏠) 배치. Root `layout.tsx`의 `metadata`에 `manifest: '/manifest.webmanifest'` 추가하고, 클라이언트에서 `navigator.serviceWorker.register('/sw.js')` 등록(작은 `RegisterSW` 클라이언트 컴포넌트).

- [ ] **Step 6: 커밋**
```bash
git add web && git commit -m "chore: scaffold PWA shell, vitest, geometry helpers"
```

---

## Task 2: Supabase 클라이언트 + 미들웨어

**Files:** Create `web/src/lib/supabase/client.ts`, `server.ts`, `web/src/middleware.ts`; Modify `web/.env.example`

**Interfaces:** Produces `createClient()`(브라우저·주 사용), `createClient()`(서버·auth용), 세션 갱신 미들웨어.

- [ ] **Step 1: env** — Create `web/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: 브라우저 클라이언트** — Create `web/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: 서버 클라이언트 + 미들웨어** — Create `web/src/lib/supabase/server.ts`(쿠키 기반)와 `web/src/middleware.ts`(`supabase.auth.getUser()`로 세션 갱신, matcher `['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)']`). 표준 `@supabase/ssr` 패턴 사용.
> 구현자 메모: 설치된 `@supabase/ssr` 버전의 쿠키 `getAll/setAll` 규약을 context7로 확인.

- [ ] **Step 4: 타입체크** — Run `npx tsc --noEmit` → 에러 없음.

- [ ] **Step 5: 커밋**
```bash
git add web/src/lib/supabase web/src/middleware.ts web/.env.example
git commit -m "feat: supabase clients and session middleware"
```

---

## Task 3: DB 스키마 + RLS + 초대 RPC + 타입

**Files:** Create `web/supabase/migrations/0001_init.sql`, `web/src/lib/types.ts`

**Interfaces:** Produces 7개 테이블(암호 컬럼·동기화 컬럼 포함) + RLS + `get_invite_family(token)` RPC; Row 타입·도메인 상수.

- [ ] **Step 1: 마이그레이션** — Create `web/supabase/migrations/0001_init.sql`:
```sql
create extension if not exists pgcrypto;

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  emoji text not null default '🧑',
  color text not null default '#4a7fa5',
  role text not null default 'member' check (role in ('owner','member')),
  wrapped_family_key text,          -- 패스프레이즈로 래핑된 FDK {salt,iv,ct}
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16),'hex'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null, x int not null, y int not null, w int not null, h int not null,
  color_index int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table storages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  type text not null, name text not null, x int not null, y int not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  storage_id uuid not null references storages(id) on delete cascade,
  enc_name text not null,           -- 암호블롭 {iv,ct}
  enc_memo text,                    -- 암호블롭 or null
  emoji text not null default '📦',
  photo_path text,                  -- 암호화 사진 경로 or null
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  kind text not null,
  enc_payload text not null,        -- 암호블롭(물건 이름 등 포함)
  created_at timestamptz not null default now()
);

create index on rooms(family_id);
create index on storages(family_id);
create index on items(family_id);
create index on items(storage_id);
create index on activity(family_id, created_at desc);

create or replace function is_family_member(fid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;

-- 비멤버가 초대 토큰으로 가족 id/이름만 확인(멤버십 삽입은 클라이언트가 RLS로)
create or replace function get_invite_family(p_token text)
returns table(family_id uuid, family_name text)
language sql security definer set search_path = public as $$
  select f.id, f.name from family_invites i join families f on f.id = i.family_id
  where i.token = p_token and i.expires_at > now();
$$;

alter table families        enable row level security;
alter table family_members  enable row level security;
alter table family_invites  enable row level security;
alter table rooms           enable row level security;
alter table storages        enable row level security;
alter table items           enable row level security;
alter table activity        enable row level security;

create policy fam_select on families for select using (is_family_member(id));
create policy fam_insert on families for insert with check (created_by = auth.uid());
create policy fam_update on families for update using (is_family_member(id));

create policy fm_select on family_members for select using (is_family_member(family_id));
create policy fm_insert on family_members for insert with check (user_id = auth.uid());
create policy fm_update on family_members for update using (user_id = auth.uid());
create policy fm_delete on family_members for delete using (user_id = auth.uid());

create policy inv_all on family_invites for all
  using (is_family_member(family_id)) with check (is_family_member(family_id));

create policy rooms_all    on rooms    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy storages_all on storages for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy items_all    on items    for all using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy activity_all on activity for all using (is_family_member(family_id)) with check (is_family_member(family_id));
```
Supabase SQL Editor에서 실행. 이후 **Storage 비공개 버킷 `item-photos` 생성** + Storage 정책(경로 첫 세그먼트 = 내 가족 id일 때만 read/write).

- [ ] **Step 2: RLS 격리 확인** — 두 유저·두 가족으로 서로의 `items` select 시 0행.

- [ ] **Step 3: 타입 + 상수** — Create `web/src/lib/types.ts`:
```ts
export type UUID = string
export type Family = { id: UUID; name: string; created_by: UUID; created_at: string }
export type FamilyMember = {
  id: UUID; family_id: UUID; user_id: UUID; display_name: string
  emoji: string; color: string; role: 'owner' | 'member'; wrapped_family_key: string | null; joined_at: string
}
export type Room = {
  id: UUID; family_id: UUID; name: string; x: number; y: number; w: number; h: number
  color_index: number; updated_at: string; deleted_at: string | null
}
export type Storage = {
  id: UUID; family_id: UUID; room_id: UUID; type: StorageTypeKey; name: string
  x: number; y: number; updated_at: string; deleted_at: string | null
}
// 서버 저장 형태(암호블롭). 앱 메모리에서는 복호화된 DecItem 사용.
export type Item = {
  id: UUID; family_id: UUID; storage_id: UUID; enc_name: string; enc_memo: string | null
  emoji: string; photo_path: string | null; created_by: UUID
  created_at: string; updated_at: string; deleted_at: string | null
}
export type DecItem = Omit<Item, 'enc_name' | 'enc_memo'> & { name: string; memo: string }
export type Activity = { id: UUID; family_id: UUID; actor_id: UUID; kind: string; enc_payload: string; created_at: string }

export type StorageTypeKey = 'drawer' | 'closet' | 'shelf' | 'fridge' | 'box' | 'shoe'
export const STORAGE_TYPES: { type: StorageTypeKey; em: string; label: string }[] = [
  { type: 'drawer', em: '🗄️', label: '서랍장' }, { type: 'closet', em: '🚪', label: '옷장' },
  { type: 'shelf',  em: '📚', label: '선반' },   { type: 'fridge', em: '🧊', label: '냉장고' },
  { type: 'box',    em: '📦', label: '수납박스' }, { type: 'shoe',  em: '👟', label: '신발장' },
]
export const ROOM_COLORS = [
  { fill: 'rgba(122,168,116,.16)', border: '#7aa874', name: '초록' },
  { fill: 'rgba(107,142,181,.16)', border: '#6b8eb5', name: '파랑' },
  { fill: 'rgba(224,158,84,.18)',  border: '#d99a50', name: '주황' },
  { fill: 'rgba(186,124,168,.16)', border: '#ba7ca8', name: '분홍' },
  { fill: 'rgba(153,143,101,.18)', border: '#a79a63', name: '카키' },
]
```

- [ ] **Step 4: 커밋**
```bash
git add web/supabase web/src/lib/types.ts
git commit -m "feat: db schema with encrypted+sync columns, RLS, invite RPC, types"
```

---

## Task 4: 암호화 모듈 (보안 핵심, TDD)

**Files:** Create `web/src/lib/crypto.ts`, `web/src/lib/crypto.test.ts`

**Interfaces:** Produces `generateFDK`, `encryptField`/`decryptField`, `wrapFDK`/`unwrapFDK`, `exportFDKCode`/`importFDKCode`, `encryptBytes`/`decryptBytes`.

- [ ] **Step 1: 실패 테스트** — Create `web/src/lib/crypto.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateFDK, encryptField, decryptField, wrapFDK, unwrapFDK, exportFDKCode, importFDKCode } from './crypto'

describe('crypto', () => {
  it('필드 암복호 왕복', async () => {
    const fdk = await generateFDK()
    const blob = await encryptField(fdk, '손톱깎이')
    expect(blob).not.toContain('손톱깎이')
    expect(await decryptField(fdk, blob)).toBe('손톱깎이')
  })
  it('다른 키로는 복호 실패', async () => {
    const a = await generateFDK(), b = await generateFDK()
    const blob = await encryptField(a, '여권')
    await expect(decryptField(b, blob)).rejects.toBeTruthy()
  })
  it('패스프레이즈 래핑 왕복 + 틀린 암호 실패', async () => {
    const fdk = await generateFDK()
    const wrapped = await wrapFDK(fdk, 'hunter2')
    const restored = await unwrapFDK(wrapped, 'hunter2')
    expect(await decryptField(restored, await encryptField(fdk, 'x'))).toBe('x')
    await expect(unwrapFDK(wrapped, 'wrong')).rejects.toBeTruthy()
  })
  it('초대 코드 export/import 왕복', async () => {
    const fdk = await generateFDK()
    const code = await exportFDKCode(fdk)
    const imported = await importFDKCode(code)
    expect(await decryptField(imported, await encryptField(fdk, 'y'))).toBe('y')
  })
})
```
Run `npm test -- crypto` → FAIL.

- [ ] **Step 2: 구현** — Create `web/src/lib/crypto.ts`:
```ts
const enc = new TextEncoder()
const dec = new TextDecoder()
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const b64url = (buf: ArrayBuffer | Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/'))

const AES = { name: 'AES-GCM', length: 256 } as const

export async function generateFDK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt'])
}

export async function encryptField(fdk: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fdk, enc.encode(plaintext))
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) })
}
export async function decryptField(fdk: CryptoKey, blob: string): Promise<string> {
  const { iv, ct } = JSON.parse(blob)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, fdk, unb64(ct))
  return dec.decode(pt)
}

async function deriveWrapKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    base, AES, false, ['encrypt', 'decrypt']
  )
}
export async function wrapFDK(fdk: CryptoKey, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const wrapKey = await deriveWrapKey(passphrase, salt)
  const raw = await crypto.subtle.exportKey('raw', fdk)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, raw)
  return JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) })
}
export async function unwrapFDK(wrapped: string, passphrase: string): Promise<CryptoKey> {
  const { salt, iv, ct } = JSON.parse(wrapped)
  const wrapKey = await deriveWrapKey(passphrase, unb64(salt))
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, wrapKey, unb64(ct))
  return crypto.subtle.importKey('raw', raw, AES, true, ['encrypt', 'decrypt'])
}

// 초대 프래그먼트 / 복구코드용 (URL-safe)
export async function exportFDKCode(fdk: CryptoKey): Promise<string> {
  return b64url(await crypto.subtle.exportKey('raw', fdk))
}
export async function importFDKCode(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64url(code), AES, true, ['encrypt', 'decrypt'])
}

// 사진 바이트: iv(12) + 암호문을 이어붙인 Uint8Array 반환/역변환
export async function encryptBytes(fdk: CryptoKey, bytes: ArrayBuffer): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fdk, bytes)
  return new Blob([iv, new Uint8Array(ct)])
}
export async function decryptBytes(fdk: CryptoKey, packed: ArrayBuffer): Promise<ArrayBuffer> {
  const all = new Uint8Array(packed)
  const iv = all.slice(0, 12), ct = all.slice(12)
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fdk, ct)
}
```
Run `npm test -- crypto` → PASS (4).
> 메모: Node 20+ 테스트 환경엔 `globalThis.crypto.subtle`·`btoa`·`atob` 존재. 브라우저와 동일 API.

- [ ] **Step 3: 커밋**
```bash
git add web/src/lib/crypto.ts web/src/lib/crypto.test.ts
git commit -m "feat: E2E crypto module (AES-GCM fields, PBKDF2 key wrap) with tests"
```

---

## Task 5: 로컬 스토어 (IndexedDB 미러 + LWW 병합)

**Files:** Create `web/src/lib/idb.ts`, `web/src/lib/merge.ts`, `web/src/lib/merge.test.ts`, `web/src/lib/store.ts`

**Interfaces:** Produces `mergeRows(local, incoming)`(순수, LWW); `store`(get/putLocal/allActive/markDirty/dirtyRows/setMeta).

- [ ] **Step 1: LWW 병합 실패 테스트** — Create `web/src/lib/merge.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mergeRows } from './merge'

type R = { id: string; updated_at: string; v: number }
describe('mergeRows (LWW)', () => {
  it('updated_at 최신이 승, 신규는 추가', () => {
    const local: R[] = [{ id: 'a', updated_at: '2026-01-01', v: 1 }]
    const incoming: R[] = [
      { id: 'a', updated_at: '2026-02-01', v: 2 }, // 최신 → 교체
      { id: 'b', updated_at: '2026-01-01', v: 9 }, // 신규 → 추가
    ]
    const m = mergeRows(local, incoming)
    expect(m.find(r => r.id === 'a')!.v).toBe(2)
    expect(m.find(r => r.id === 'b')!.v).toBe(9)
  })
  it('로컬이 더 최신이면 유지', () => {
    const local: R[] = [{ id: 'a', updated_at: '2026-03-01', v: 5 }]
    const incoming: R[] = [{ id: 'a', updated_at: '2026-02-01', v: 2 }]
    expect(mergeRows(local, incoming).find(r => r.id === 'a')!.v).toBe(5)
  })
})
```
Run → FAIL.

- [ ] **Step 2: 병합 구현** — Create `web/src/lib/merge.ts`:
```ts
export type Syncable = { id: string; updated_at: string }
/** id별로 updated_at이 큰 쪽을 채택(LWW). ponytail: 클라이언트 시계 기준, 시계 스큐는 알려진 한계 */
export function mergeRows<T extends Syncable>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map(r => [r.id, r]))
  for (const inc of incoming) {
    const cur = byId.get(inc.id)
    if (!cur || inc.updated_at >= cur.updated_at) byId.set(inc.id, inc)
  }
  return [...byId.values()]
}
```
Run → PASS.

- [ ] **Step 3: IndexedDB 래퍼** — Create `web/src/lib/idb.ts`: `openDB(name)` → object stores `rooms/storages/items/activity`(keyPath `id`) + `meta`(key-value: lastSync 등) + `dirty`(변경 대기 id 집합). `get/getAll/put/bulkPut/delete/setMeta/getMeta` 프로미스 래퍼(약 60줄). (새 의존성 없이 raw IndexedDB)

- [ ] **Step 4: 스토어** — Create `web/src/lib/store.ts`: `idb` 위에 도메인 API. `allActive(table)`=`deleted_at==null`만, `putLocal(table, row, {dirty})`, `dirtyRows(table)`, `clearDirty(ids)`, `getMeta/setMeta('lastSync')`. 렌더/편집은 이 API만 사용.

- [ ] **Step 5: 커밋**
```bash
git add web/src/lib/idb.ts web/src/lib/merge.ts web/src/lib/merge.test.ts web/src/lib/store.ts
git commit -m "feat: local IndexedDB store with tested LWW merge"
```

---

## Task 6: 동기화 엔진 (pull / push)

**Files:** Create `web/src/lib/sync.ts`

**Interfaces:** Consumes `store`, `merge.mergeRows`, Supabase 브라우저 클라이언트. Produces `pull(familyId)`, `push()`, `syncNow(familyId)`.

- [ ] **Step 1: 구현** — Create `web/src/lib/sync.ts`:
```ts
import { createClient } from '@/lib/supabase/client'
import { mergeRows } from './merge'
import { store } from './store'

const TABLES = ['rooms', 'storages', 'items', 'activity'] as const

/** 서버에서 lastSync 이후 변경분(삭제 포함)을 받아 로컬 병합 */
export async function pull(familyId: string) {
  const supabase = createClient()
  const since = (await store.getMeta('lastSync')) ?? '1970-01-01'
  let newest = since
  for (const t of TABLES) {
    const col = t === 'activity' ? 'created_at' : 'updated_at'
    const { data, error } = await supabase.from(t).select('*')
      .eq('family_id', familyId).gt(col, since)
    if (error) throw error
    if (data?.length) {
      const local = await store.getAll(t)
      // activity는 append-only라 그대로 add, 나머지는 LWW 병합
      const merged = t === 'activity' ? [...local, ...data] : mergeRows(local as any, data as any)
      await store.bulkPut(t, merged)
      for (const r of data) if (r[col] > newest) newest = r[col]
    }
  }
  await store.setMeta('lastSync', newest)
}

/** 로컬 dirty 행을 서버로 upsert */
export async function push() {
  const supabase = createClient()
  for (const t of ['rooms', 'storages', 'items'] as const) {
    const dirty = await store.dirtyRows(t)
    if (!dirty.length) continue
    const { error } = await supabase.from(t).upsert(dirty)
    if (error) throw error
    await store.clearDirty(dirty.map(r => r.id))
  }
  // activity는 생성 시 즉시 insert(별도 dirty 큐 불필요) — Task 10·11에서 처리
}

export async function syncNow(familyId: string) { await push(); await pull(familyId) }
```
> 오프라인 시 `push`가 네트워크 에러로 throw → 호출부에서 삼키고 온라인 복귀/다음 진입 시 재시도(큐는 dirty 플래그가 곧 큐). ponytail: 별도 큐 자료구조 없이 dirty=큐.

- [ ] **Step 2: 타입체크** — Run `npx tsc --noEmit` → 에러 없음.

- [ ] **Step 3: 커밋**
```bash
git add web/src/lib/sync.ts
git commit -m "feat: pull/push sync engine (LWW, dirty-as-queue)"
```

---

## Task 7: 인증 (로그인 + 콜백)

**Files:** Create `web/src/app/login/page.tsx`, `web/src/app/auth/callback/route.ts`

- [ ] **Step 1: 로그인 페이지** — 이메일 매직링크 + 카카오/구글 버튼(`supabase.auth.signInWithOtp` / `signInWithOAuth`, `redirectTo=/auth/callback`).
- [ ] **Step 2: 콜백 라우트** — `exchangeCodeForSession(code)` 후 `/`로 리다이렉트.
- [ ] **Step 3: OAuth 제공자 설정(수동)** — Supabase Authentication→Providers에서 카카오·구글 등록.
- [ ] **Step 4: 브라우저 검증** — 매직링크 로그인 → `/`, 세션 유지.
- [ ] **Step 5: 커밋**
```bash
git add web/src/app/login web/src/app/auth
git commit -m "feat: login (magic link + kakao/google) and auth callback"
```

---

## Task 8: 가족 온보딩 + 키 셋업 (생성/참여/잠금해제) + 보호 레이아웃

**Files:** Create `web/src/lib/keys.ts`, `web/src/app/onboarding/page.tsx`, `web/src/app/unlock/page.tsx`, `web/src/app/invite/[token]/page.tsx`, `web/src/app/(app)/layout.tsx`

**Interfaces:** Consumes `crypto.*`, Supabase 클라이언트. Produces 세션 FDK 홀더 `keys.getFDK/setFDK/hasFDK`; 온보딩 액션 `createFamilyWithKey`, `joinFamilyWithKey`, `unlockWithPassphrase`.

- [ ] **Step 1: 세션 키 홀더 + 온보딩 로직** — Create `web/src/lib/keys.ts`:
```ts
import { createClient } from '@/lib/supabase/client'
import { generateFDK, wrapFDK, unwrapFDK, importFDKCode, exportFDKCode } from './crypto'

let sessionFDK: CryptoKey | null = null           // 메모리에만. 새로고침 시 unlock 필요
export const keys = {
  getFDK: () => sessionFDK,
  hasFDK: () => sessionFDK !== null,
  setFDK: (k: CryptoKey) => { sessionFDK = k },
}

/** 새 가족: FDK 생성 → owner 멤버 행에 래핑 저장 → 복구코드(원본 FDK) 반환(1회 표시용) */
export async function createFamilyWithKey(familyName: string, displayName: string, passphrase: string): Promise<{ familyId: string; recoveryCode: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const fdk = await generateFDK()
  const wrapped = await wrapFDK(fdk, passphrase)
  const { data: fam, error } = await supabase.from('families').insert({ name: familyName, created_by: user.id }).select('id').single()
  if (error || !fam) throw error ?? new Error('가족 생성 실패')
  const { error: mErr } = await supabase.from('family_members')
    .insert({ family_id: fam.id, user_id: user.id, display_name: displayName, role: 'owner', wrapped_family_key: wrapped })
  if (mErr) throw mErr
  keys.setFDK(fdk)
  return { familyId: fam.id, recoveryCode: await exportFDKCode(fdk) }
}

/** 초대 참여: 프래그먼트의 FDK코드로 복원 → 내 패스프레이즈로 래핑해 내 멤버 행 삽입 */
export async function joinFamilyWithKey(token: string, fdkCode: string, displayName: string, passphrase: string): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data: inv, error: iErr } = await supabase.rpc('get_invite_family', { p_token: token })
  if (iErr) throw iErr
  const familyId: string | undefined = inv?.[0]?.family_id
  if (!familyId) throw new Error('유효하지 않거나 만료된 초대')
  const fdk = await importFDKCode(fdkCode)
  const wrapped = await wrapFDK(fdk, passphrase)
  const { error } = await supabase.from('family_members')
    .insert({ family_id: familyId, user_id: user.id, display_name: displayName, wrapped_family_key: wrapped })
  if (error) throw error
  keys.setFDK(fdk)
  return familyId
}

/** 기존 기기/재로그인: 내 wrapped_family_key를 패스프레이즈로 풀어 세션 FDK 복원 */
export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')
  const { data } = await supabase.from('family_members').select('wrapped_family_key').eq('user_id', user.id).limit(1).maybeSingle()
  if (!data?.wrapped_family_key) throw new Error('래핑 키 없음')
  keys.setFDK(await unwrapFDK(data.wrapped_family_key, passphrase)) // 틀리면 throw
}
```

- [ ] **Step 2: 온보딩 페이지** — Create `web/src/app/onboarding/page.tsx`(클라이언트): 가족명·내이름·패스프레이즈 입력 → `createFamilyWithKey` → **복구코드 1회 표시 모달**("이 코드를 안전한 곳에 보관하세요. 전원이 암호를 잊으면 이 코드로만 복구됩니다.") → 확인 후 `/`.

- [ ] **Step 3: 초대 수락 페이지** — Create `web/src/app/invite/[token]/page.tsx`(클라이언트): `location.hash`에서 `#k=` 추출(서버 미전송). 미로그인 시 `/login`으로 보내되 원래 URL(프래그먼트 포함) 복귀. 로그인 상태면 내이름·패스프레이즈 입력 → `joinFamilyWithKey(token, fdkCode, ...)` → `/`.

- [ ] **Step 4: 잠금해제 페이지** — Create `web/src/app/unlock/page.tsx`: 패스프레이즈 입력 → `unlockWithPassphrase` → `/`. 실패 시 "암호가 올바르지 않아요" + "다른 가족원에게 초대 링크를 받아 재참여" 안내.

- [ ] **Step 5: 보호 레이아웃** — Create `web/src/app/(app)/layout.tsx`(서버 컴포넌트): 미로그인 → `/login`. (FDK 유무는 메모리라 서버에서 모름 → **클라이언트 가드**로: `(app)/page.tsx` 최상단에서 `keys.hasFDK()` false면 멤버십 있으면 `/unlock`, 없으면 `/onboarding`으로 라우팅.)

- [ ] **Step 6: 브라우저 검증** — 신규: 로그인→온보딩→복구코드 표시→앱. 재로그인/새로고침: `/unlock`에서 암호 입력→앱. 둘째 계정: 첫 계정이 만든 초대 링크(`/invite/<t>#k=...`)로 참여→같은 가족. 새 기기에서 틀린 암호→거부.
- [ ] **Step 7: 커밋**
```bash
git add web/src/lib/keys.ts web/src/app/onboarding web/src/app/unlock web/src/app/invite "web/src/app/(app)/layout.tsx"
git commit -m "feat: family onboarding, key setup/unlock, invite-fragment key sharing, recovery code"
```

---

## Task 9: 초기 부트 + 지도 렌더(읽기 전용) — 로컬 스토어에서

**Files:** Create `web/src/app/(app)/page.tsx`, `web/src/components/MapCanvas.tsx`, `RoomShape.tsx`, `StorageBadge.tsx`, `Header.tsx`; Modify `web/src/app/globals.css`(프로토타입 CSS 이식)

**Interfaces:** Consumes `store`, `sync.syncNow`, `keys`, `crypto.decryptField`, `geometry.fitScale`.

- [ ] **Step 1: CSS 이식** — `homesmap.html` `<style>` → `globals.css`.
- [ ] **Step 2: 앱 부트(클라이언트 컴포넌트)** — `(app)/page.tsx`:
  1) `keys.hasFDK()` 확인(없으면 unlock/onboarding 라우팅, Task 8),
  2) 최초 진입 시 `syncNow(familyId)`로 서버→IndexedDB 하이드레이트,
  3) `store.allActive('rooms'|'storages'|'items')` 로드,
  4) items는 `decryptField(fdk, enc_name/enc_memo)`로 복호화해 `DecItem[]` 생성(메모리),
  5) `MapCanvas`에 전달. 진입 후 포커스 시 백그라운드 `syncNow` 재실행.
- [ ] **Step 3: MapCanvas 반응형 렌더** — `LOGICAL_W/H` `#map`을 `fitScale`로 `transform: scale()`. `ResizeObserver`로 컨테이너 추적. rooms→`RoomShape`, storages→`StorageBadge`(물건 수 배지 = 해당 storage의 DecItem 수). 클릭은 이 태스크에선 no-op.
- [ ] **Step 4: RoomShape / StorageBadge / Header** — 프로토타입 `renderMap` DOM 구조 이식. Header: 로고 + 검색창 자리 + 멤버 표시.
- [ ] **Step 5: 브라우저 검증** — Task 10으로 데이터 생성 후 or 수동 삽입 → 방·수납장 표시, 창 축소 시 비율 유지. 물건 이름이 서버(DB)엔 암호블롭인데 화면엔 평문으로 복호화되어 보임.
- [ ] **Step 6: 커밋**
```bash
git add "web/src/app/(app)/page.tsx" web/src/components web/src/app/globals.css
git commit -m "feat: boot sync + read-only responsive map from local store (decrypted)"
```

---

## Task 10: 지도 편집 — 방 그리기 · 수납장 놓기 · 삭제 (로컬 우선 + 동기화)

**Files:** Modify `web/src/components/MapCanvas.tsx`; Create `web/src/components/Toolbar.tsx`; Modify `web/src/lib/store.ts`(활동 헬퍼)

**Interfaces:** Consumes `geometry.normalizeRect`·`pointInRect`, `store.putLocal`, `sync.push`, `crypto.encryptField`.

- [ ] **Step 1: 툴바** — `select/room/storage` 모드 + 수납장 종류 팔레트(`STORAGE_TYPES`). 프로토타입 이식.
- [ ] **Step 2: 방 그리기(데스크톱 드래그)** — mousedown/move/up + **스케일 역보정**(clientX 차이 ÷ 현재 scale). `normalizeRect`, `w<60||h<50` 무시. 이름·색 모달 → 방 row 생성: `putLocal('rooms', {id: uuid, family_id, name, x,y,w,h, color_index, updated_at: now, deleted_at: null}, {dirty:true})` → 로컬 즉시 반영 → `push()`(오프라인이면 catch).
- [ ] **Step 3: 수납장 놓기(클릭)** — `pointInRect`로 방 판정(없으면 토스트). 이름 모달 → storage row `putLocal` + dirty + `push()`. **활동 기록**: `enc_payload = encryptField(fdk, JSON.stringify({roomName, storageName}))` → activity insert(즉시 서버 + 로컬 add).
- [ ] **Step 4: 삭제(소프트)** — 방 ✕ → `deleted_at = now` 세팅 + 하위 storages/items도 `deleted_at`(로컬 연쇄) → dirty → `push()`. cascade는 서버 물리 삭제가 아니라 앱이 소프트 삭제 전파.
- [ ] **Step 5: 브라우저 검증** — 방 생성·수납장 배치·삭제가 즉시 반영 + 새로고침(재하이드레이트) 후에도 유지 + 다른 기기 동기화 시 반영. 비행기모드에서 편집 → 온라인 복귀 시 서버 반영.
- [ ] **Step 6: 커밋**
```bash
git add web/src/components/MapCanvas.tsx web/src/components/Toolbar.tsx web/src/lib/store.ts
git commit -m "feat: local-first map editing (draw/place/soft-delete) with sync + encrypted activity"
```

---

## Task 11: 상세 패널 — 암호화 물건 등록/삭제 + 암호화 사진

**Files:** Create `web/src/components/DetailPanel.tsx`; Modify `web/src/components/MapCanvas.tsx`

**Interfaces:** Consumes `crypto.encryptField`/`encryptBytes`/`decryptBytes`, `store`, `sync.push`, Supabase Storage.

- [ ] **Step 1: 상세 패널** — 프로토타입 `openStorage` 마크업 이식. 물건 카드: 이름·메모(이미 복호화된 DecItem), 썸네일, 등록자. 폼: 이름·메모·사진·등록 버튼.
- [ ] **Step 2: 물건 등록 (draft→암호화→저장)** — 폼 제출 → `draft = [{name, memo, photo?}]`(v1은 1건):
  - 사진 있으면 `encryptBytes(fdk, fileBytes)` → Supabase Storage `item-photos/{familyId}/{itemId}/{uuid}` 업로드 → `photo_path` 획득.
  - `enc_name = encryptField(fdk, name)`, `enc_memo = memo? encryptField(fdk, memo): null`.
  - item row `putLocal('items', {...}, {dirty:true})` → `push()`.
  - 활동: `encryptField(fdk, JSON.stringify({roomName, storageName, itemName: name}))` → activity insert.
  - > draft 배열 형태 유지 = future AI 인식(여러 물건 확인)이 꽂히는 이음새.
- [ ] **Step 3: 사진 표시** — `photo_path`의 암호 바이트 다운로드(서명 URL) → `decryptBytes` → `URL.createObjectURL(new Blob([plain]))`로 `<img>`. 사용 후 revoke.
- [ ] **Step 4: 물건 삭제(소프트)** — `deleted_at` 세팅 + dirty + push.
- [ ] **Step 5: 패널 연결** — `StorageBadge` 클릭 → 선택 storageId → 패널 open(select 모드).
- [ ] **Step 6: 브라우저 검증** — 물건 등록 시 지도 배지 카운트↑, 활동 기록, **DB에는 enc_name이 암호블롭**(Supabase 대시보드로 확인)인데 화면엔 평문. 사진 첨부·표시·삭제 동작.
- [ ] **Step 7: 커밋**
```bash
git add web/src/components/DetailPanel.tsx web/src/components/MapCanvas.tsx
git commit -m "feat: encrypted item CRUD with encrypted photo upload/display"
```

---

## Task 12: 검색 + 활동 피드 + 배포

**Files:** Create `web/src/components/SearchBar.tsx`, `ActivityFeed.tsx`; Create `web/src/lib/search.ts`·`search.test.ts`, `web/src/lib/activity.ts`·`activity.test.ts`; Modify `Header.tsx`, `(app)/page.tsx`

**Interfaces:** Consumes DecItem[]·storages·rooms, `crypto.decryptField`, `activity.buildActivityMessage`.

- [ ] **Step 1: 검색 로직(TDD)** — Create `search.test.ts`(이름·메모 부분일치, 위치 포함, 빈 쿼리 빈배열) → FAIL → Create `search.ts`:
```ts
import type { DecItem, Storage, Room } from './types'
export type SearchHit = { itemId: string; storageId: string; roomName: string; storageName: string; memo: string }
export function searchItems(items: DecItem[], storages: Storage[], rooms: Room[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const sById = new Map(storages.map(s => [s.id, s]))
  const rById = new Map(rooms.map(r => [r.id, r]))
  return items.filter(i => i.name.toLowerCase().includes(q) || (i.memo && i.memo.toLowerCase().includes(q)))
    .slice(0, 8).map(i => {
      const s = sById.get(i.storage_id); const r = s ? rById.get(s.room_id) : undefined
      return { itemId: i.id, storageId: s?.id ?? '', roomName: r?.name ?? '?', storageName: s?.name ?? '?', memo: i.memo }
    })
}
```
Run → PASS. (검색은 **복호화된 로컬 데이터**에서 동작하므로 E2E와 양립)

- [ ] **Step 2: 활동 메시지(TDD)** — Create `activity.test.ts`(item_added/storage_added 문장, 멤버 없을 때 안전) → FAIL → Create `activity.ts`:
```ts
import type { FamilyMember } from './types'
export function buildActivityMessage(kind: string, p: Record<string, string>, member?: Pick<FamilyMember,'display_name'|'emoji'>): string {
  const who = member ? `${member.emoji} ${member.display_name}님이` : '누군가'
  switch (kind) {
    case 'item_added':    return `${who} ${p.roomName} ${p.storageName}에 '${p.itemName}' 등록`
    case 'storage_added': return `${who} ${p.roomName}에 ${p.storageName}을(를) 만들었어요`
    default:              return `${who} 활동했어요`
  }
}
```
Run → PASS.

- [ ] **Step 3: 검색바** — Header에 배치. 입력 시 `searchItems(decItems, storages, rooms, q)` 드롭다운. 결과 클릭 → 콜백으로 storageId → 패널 열고 지도 flash(프로토타입 `flashStorage` 이식: 방 glow + 수납장 pulse + scrollIntoView).
- [ ] **Step 4: 활동 피드** — activity 행의 `enc_payload`를 `decryptField(fdk)` → JSON.parse → `buildActivityMessage(kind, payload, memberOf(actor_id))`. 최근 50건.
- [ ] **Step 5: 전체 시나리오 검증** — 로그인→온보딩(복구코드)→방 그리기→수납장→'손톱깎이' 등록→검색 '손톱'→결과 클릭→지도 flash+패널→활동 피드 기록. 오프라인에서 검색·조회 동작. DB엔 암호블롭.
- [ ] **Step 6: 린트/타입/테스트** — Run `npm run lint && npx tsc --noEmit && npm test` → 모두 통과(geometry/crypto/merge/search/activity).
- [ ] **Step 7: 배포** — Vercel 저장소 연결, Root Directory=`web`, 환경변수 2개 설정. `git push` 자동 배포. 배포 URL에서 PWA 설치 + 전 흐름 확인.
- [ ] **Step 8: 커밋**
```bash
git add web/src/components/SearchBar.tsx web/src/components/ActivityFeed.tsx web/src/lib/search.ts web/src/lib/search.test.ts web/src/lib/activity.ts web/src/lib/activity.test.ts web/src/components/Header.tsx "web/src/app/(app)/page.tsx"
git commit -m "feat: local search with map flash + decrypted activity feed"
```

---

## 다음 계획 (별도 문서)
- **v2 소모품**: `items`에 평문 `is_consumable`/`quantity`/`low_threshold`/`shopping_url` 마이그레이션(+동기화 컬럼 기존 재사용), 수량 조정 UI, 재고≤임계 → `shopping_list` 자동 등록, 장보기 화면, "사러 가기" 외부 링크.
- **v3 다듬기**: Supabase Realtime 구독으로 동기화 즉시성↑, 모바일 방 그리기(핸들 조정), 생체인증(WebAuthn) 잠금해제, 성능.

---

## Self-Review

- **Spec 커버리지**: 로컬-퍼스트(T5·T6·T9) · E2E 암호화/키관리(T4·T8·T11) · PWA(T1) · 인증(T7) · 가족/초대 프래그먼트 키(T8) · 복구코드(T8) · 지도에디터(T9·T10) · 암호화 물건/사진(T11) · 검색(T12) · 활동피드 복호화(T12) · 반응형(T9). 설계 rev2 v1 항목 전부 태스크 존재. §13 기본값(복구코드/암호경계 물건만/PBKDF2/링크초대/자체SW) 반영.
- **Placeholder 스캔**: "적절히 처리" 류 없음. 보안·동기화 핵심은 완전 코드+테스트, UI는 프로토타입 이식 근거 명시.
- **타입 일관성**: `Item`(암호블롭 저장형) vs `DecItem`(복호화 렌더형) 구분 일관. `mergeRows`는 `Syncable`(id,updated_at) 제약, activity는 append(병합 제외)로 처리. `encryptField/decryptField`·`wrapFDK/unwrapFDK`·`searchItems(DecItem[])`·`buildActivityMessage` 시그니처가 테스트·소비처와 일치. `store`/`sync`/`keys` API 이름이 태스크 간 동일.
```
