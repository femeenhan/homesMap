# 로그인 프리 로컬 모드 전환

작성일: 2026-07-24
근거: 사용자 결정 — "로그인 없이 쓰는 개인용 서비스로 전환. 가족 초대·활동 히스토리 숨김(확장기능 보류). 배포 전 개발 중이라 기존 로그인 세션 고려 불필요."

## 1. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 진입 | **항상 로컬 모드** — 세션/래핑키/멤버십 분기 전부 제거, 네트워크 확인 없이 즉시 부팅 |
| 초대·활동·멤버 칩 | **무조건 숨김**(코드 최소 잔존, 확장기능 복원 대비). 헤더 = 로고 + 검색만 |
| 게스트 배너 | 제거 ("테스트(게스트) 모드…" — 로컬이 기본값이 됐으므로) |
| 인증 페이지 | `/login`·`/unlock`·`/onboarding`·`/invite` 파일 유지, 앱 흐름에서만 제외 |
| 데이터/암호화 | 무변경 — 기존 게스트 인프라(고정 로컬 키, IndexedDB, sync 가드) 그대로 |
| 마이그레이션 | 로컬→계정 업로드 플로우는 로그인 복원 라운드의 몫 (지금 구현 안 함) |

## 2. 변경 상세

- **boot(page.tsx)**: pendingInvite 복귀·`keys.hasFDK()`·wrappedKey·`supabase.auth.getUser()`·멤버십 조회 분기 전부 제거 → 기존 `enterGuest()` 경로가 유일한 부팅(이름은 `enterLocal`로). 네트워크 왕복 0 → 비행기 모드 콜드 스타트.
- **guest.ts**: `GUEST_MODE` 킬 스위치 제거(항상 로컬). 주석을 "기본 로컬 모드"로 갱신. `GUEST_FAMILY_ID`/`GUEST_FDK_CODE`/`guestSession` 등 인프라는 유지(기존 로컬 데이터 그대로 이어짐).
- **middleware.ts**: 삭제 — 매 요청 Supabase 세션 리프레시는 휴면 기능의 비용. 인증 페이지들은 자체 클라이언트로 동작(직접 URL 접근 시).
- **Header.tsx**: 멤버 칩·가족 초대 버튼(+`handleInvite`/fallbackLink UI)·활동 시계 버튼 제거 → props `{ decItems, storages, rooms, onSearchPick }`로 축소. page의 활동 시트(`showActivity`/ActivityFeed 렌더)·게스트 배너도 제거.
- **recordActivity**: 함수·호출부 유지하되 첫 줄 `if (guestSession.isActive()) return` 가드 — 로컬 모드에서 서버 시도·암호화 오버헤드 0. (활동 기능 복원 시 가드만 풀면 됨.)
- **비고**: ActivityFeed·keys.createInviteLink 등은 파일로 잔존(미사용 import만 정리). 삭제 아님 — 확장기능 복원 대비.

## 3. 검증

- `tsc`/`eslint`/`vitest` 통과, `npm run build` 통과.
- 수동: 시크릿 창(로컬 데이터 없음)에서 로그인 화면 없이 즉시 시작, 비행기 모드 새로고침 정상, 헤더에 초대·활동·멤버 칩 없음, 기존 로컬 데이터 유지.
