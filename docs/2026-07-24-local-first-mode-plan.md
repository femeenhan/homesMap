# 로그인 프리 로컬 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/2026-07-24-local-first-mode-design.md` 구현 — 로그인 게이트 제거(항상 로컬 부팅) + 초대·활동·멤버 UI 숨김.

**Architecture:** 기존 게스트 인프라(고정 로컬 키·IndexedDB·sync 가드)를 기본값으로 승격. page.tsx 부팅에서 인증 분기 제거, Header 축소, middleware 삭제. 데이터 계층 무변경.

**Tech Stack:** Next.js 16 / React 19 / vitest. 새 의존성 금지.

## Global Constraints

- 작업 디렉터리 `web/`, main 직접 작업(프로젝트 정책), push는 최종 태스크에서만.
- `/login`·`/unlock`·`/onboarding`·`/invite`·`ActivityFeed.tsx`·`keys.ts` **파일 삭제 금지**(확장기능 보류 — 흐름에서만 제외). 유일한 파일 삭제는 `middleware.ts`.
- 데이터 계층(store/sync/crypto/types) 로직 무변경 — 예외: `recordActivity` 가드 1줄.
- 기존 로컬 데이터(게스트로 만든 IndexedDB) 그대로 이어져야 함 — `GUEST_FAMILY_ID`/`GUEST_FDK_CODE` 값 변경 금지.
- 검증: `cd web && npx tsc --noEmit && npm run lint && npm test` (개수 고정 없이 전부 통과).

---

### Task 1: 부팅 로컬 전용 전환

**Files:**
- Modify: `web/src/lib/guest.ts`, `web/src/app/(app)/page.tsx`
- Delete: `web/src/middleware.ts`

**Interfaces:**
- Consumes: 기존 `enterGuest()`(page.tsx), `guestSession`(`@/lib/guest`)
- Produces: `enterLocal()`(구 enterGuest 개명, page 내부 전용). `GUEST_MODE` export 소멸 — Task 2가 이를 참조하는 배너를 제거하므로 **이 태스크에서는 배너 줄의 `GUEST_MODE &&` 조건만 `data.userId === GUEST_USER_ID`로 임시 축소**(빌드 유지용, Task 2가 줄 자체를 삭제).

- [ ] **Step 1: guest.ts 정리**

`GUEST_MODE` export와 "끄는 법" 주석 삭제. 파일 머리 주석을 갱신:

```ts
// 기본 로컬 모드: 로그인 없이 이 기기 로컬 전용으로 동작한다(개인용 기본값).
// 서버 동기화(push/pull) 없음 — sync.ts가 guestSession으로 차단. 데이터는 IndexedDB에만.
// 로그인·가족 공유는 확장기능으로 보류 — 복원 시 이 모드 위에 계정 전환/업로드 플로우를 얹는다.
```

나머지(`GUEST_FAMILY_ID`, `GUEST_USER_ID`, `GUEST_FDK_CODE`, `guestSession`)는 그대로.

- [ ] **Step 2: page.tsx 부팅 단순화**

1. boot useEffect 본문 전체(pendingInvite 복귀, `keys.hasFDK()` 분기, wrappedKey→/unlock, `supabase.auth.getUser()`→로그인/온보딩 분기)를 다음으로 교체:

```tsx
  useEffect(() => {
    (async () => {
      try {
        await enterLocal()
      } catch {
        setError('데이터를 불러오지 못했어요. 새로고침 해주세요.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

2. `enterGuest` → `enterLocal`로 개명(본문 동일 — FDK 설정·guestSession.activate·메타 저장·loadLocalData). 주석을 "기본 로컬 부팅"으로.
3. 고아 정리: 이제 안 쓰는 import(`useRouter`·`router`, `createClient`(supabase), `keys`의 미사용 멤버, `GUEST_MODE`, `syncNow`/`pull` 등 — **tsc·lint로 전수 확인**하고 실제 미사용만 제거). `boot()` 함수가 enterLocal로 대체되어 통째로 죽으면 삭제(단 `loadLocalData`·`reconcileWithServer` 중 로컬 경로가 쓰는 것은 유지 — reconcileWithServer가 이제 무호출이면 함께 삭제).
4. 게스트 배너 줄(`GUEST_MODE && data.userId === GUEST_USER_ID`)은 `data.userId === GUEST_USER_ID`로 조건만 축소(Task 2가 줄 삭제).
5. `recordActivity` 첫 줄에 가드 추가:

```tsx
    if (guestSession.isActive()) return // 로컬 모드: 활동 기록은 확장기능 보류 — 서버 시도·암호화 생략
```

- [ ] **Step 3: middleware 삭제**

```bash
git rm web/src/middleware.ts
```

- [ ] **Step 4: 검증**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: 전부 통과. (build로 middleware 제거·페이지 잔존 확인.)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(local): 로그인 게이트 제거 — 항상 로컬 부팅(네트워크 0), middleware 삭제, recordActivity 로컬 가드"
```

---

### Task 2: 헤더·배너 UI 숨김

**Files:**
- Modify: `web/src/components/Header.tsx`, `web/src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: Task 1 완료 상태(GUEST_MODE 소멸, 배너 조건 축소됨)
- Produces: `Header` props가 `{ decItems: DecItem[]; storages: Storage[]; rooms: Room[]; onSearchPick: (storageId: string) => void }`로 축소.

- [ ] **Step 1: Header.tsx 축소**

멤버 칩 블록(`.members`), 초대 버튼(+`handleInvite`·`inviting`·`fallbackLink` state·`invite-notice` UI·`createInviteLink` import), 활동 시계 버튼(`hdr-icon-btn`+`Icon clock`) 제거. 남는 것: 로고 + `SearchBar`. props에서 `familyId`/`members`/`onToast`/`onActivityClick` 제거. `Icon` import는 미사용이 되면 제거.

- [ ] **Step 2: page.tsx 정리**

- `<Header ...>` 호출을 축소된 props로.
- `showActivity` state + 활동 시트 JSX(`sheet-wrap`…`ActivityFeed`) + `ActivityFeed` import 제거.
- 게스트 배너 줄(`data.userId === GUEST_USER_ID && ...offline-notice...테스트(게스트) 모드`) 삭제. `GUEST_USER_ID` import가 다른 곳(enterLocal)에서 쓰이면 유지.
- 이로 인해 생기는 고아(import·state·핸들러)만 정리 — 그 외 리팩터 금지. `BootData.members`/`activity`는 데이터 계층이라 유지(무해).

- [ ] **Step 3: CSS 데드 셀렉터 정리 (grep 0건 확인 후)**

`.members`, `.member-chip`(+.em/.active), `.invite-btn`, `.invite-notice`, `.hdr-icon-btn` — 각각 사용처 grep 0건 확인 후 삭제. `.sheet-*`는 RowMenu가 사용하므로 **유지**. `.activity-list`·`.tb-title`·`.activity`는 ActivityFeed(잔존 파일)가 쓰므로 CSS도 유지.

- [ ] **Step 4: 검증**

```bash
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(local): 헤더 축소(로고+검색) — 초대·활동·멤버 칩·게스트 배너 숨김"
```

---

### Task 3: (컨트롤러 직접) 게이트 + 최종 리뷰 + 배포

1. 전체 게이트 재확인.
2. 최종 리뷰(opus): 부팅 경로에 네트워크 호출 잔존 여부, 인증 페이지 직접 접근이 여전히 빌드·동작하는지, 삭제한 심볼의 잔존 참조, 기존 로컬 데이터 연속성(GUEST_* 값 불변).
3. push(=Vercel 자동 배포), 원장 기록, 수동 확인 안내(시크릿 창 즉시 시작·비행기 모드·헤더 3요소 부재·기존 데이터 유지).
