# 하이브리드 홈 — 탭 제거, 지도+목록 한 몸

작성일: 2026-07-24
근거: 사용자 결정 — "목록/도식화 분리는 서비스 철학(효율·간편)에 안 맞음. 콤팩트 탑뷰(인지 보조)+카테고리 목록을 한 화면에" (옵션 B 동기화 하이브리드 채택).

## 1. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 탭 | `목록/도식화` viewtabs **삭제** — 홈 화면 하나 |
| 홈 레이아웃 | **모바일: 상단 콤팩트 탑뷰(~35vh) + 하단 목록(스택)** / **데스크톱: 좌 탑뷰·우 목록(2-pane)** — CSS로만 분기(컴포넌트 단일) |
| 동기화 | 단일 상태 `homeRoomId` — 지도 방 탭 ↔ 목록 방 행 탭 양방향: 지도는 액센트 하이라이트, 목록은 해당 방 펼침+스크롤+`sel` 하이라이트. 같은 방 재탭=해제 |
| 목록 본체 | **HomeTree 아코디언으로 통일(모바일 포함)** — 콤팩트 지도가 이미 한눈 개요를 주므로 모바일 드릴다운(DrillDown)은 폐기(수납장 복귀 루트 착지 백로그도 함께 소멸) |
| 수납장 진입 | 지도·목록 어디서든 `page.openStorageId` 하나로 → 공용 `StoragePane` 전체 화면(‹=홈 복귀). GridMap 내부 storageId/flash 제거 |
| 검색 점프 | page가 `openStorageId` + flash(1.6s) 직접 처리(뷰 전환 개념 소멸) |
| 편집 | 지도 영역의 기존 편집 모드 그대로(직접 드래그+방 재탭 확대 RoomEditView — 홈 영역 전체 사용) |

## 2. 상세

- **GridMap 축소**: props에서 `focusStorageId`/`onConsumeFocus` 제거, `homeRoomId: string | null`·`onSelectRoom(id|null)` 추가. 수납장 탭=`p.onOpenStorage`(기존 옵션 prop 활용). 보기 모드 방 탭=선택 토글(EditableTile에 `onOpen?` 재도입 — 있을 때만 role=button). 내부 StoragePane 렌더·`gmap-foot`(개수 푸터) 제거.
- **HomeTree 동기화**: props에 `focusRoomId?: string | null`·`onSelectRoom?: (id: string | null) => void` 추가. TreeRoom — 행 탭 시 기존 펼침 + `onSelectRoom` 통지, `focusRoomId` 일치 시 펼침+`scrollIntoView`+`levelClass 'sel'`.
- **page**: `view` state·viewtabs JSX 삭제, `homeRoomId`·`searchFlash` 추가. 렌더: `openStorage ? StoragePane(flash) : home-hybrid(지도+목록)`.
- **CSS**: `.home-hybrid{flex:1;min-height:0;display:flex;flex-direction:column}`(모바일: `.hh-map{height:35vh}` 콤팩트+내부 스크롤, `.hh-list{flex:1;overflow-y:auto}`), `@media(min-width:768px)`: `flex-direction:row`, `.hh-map{width:55%}·.hh-list{flex:1}`. 지도 방 하이라이트 `.gm-room.hh-sel{border-color:var(--accent)}`.
- **삭제(사용처 0 확인 후)**: `DrillDown.tsx`, `lib/drillPath.ts`(+test — DrillDown 전용), `lib/useIsMobile.ts`(+page 사용), viewtabs CSS, `.lv-drill`·`RootScreen/RoomScreen` 관련 죽은 CSS. `DrillHeader`는 TreeRow 소속이라 무관(StoragePane·RoomEditView 사용).

## 3. 범위 외

지도 미니맵 접기 토글, 목록 정렬 옵션, 줌 제스처.

## 4. 검증

`tsc`/`eslint`/`vitest`(drillPath 테스트 6개 감소)/`build` 통과. 수동: 모바일 390px 스택·데스크톱 좌우, 지도↔목록 양방향 선택 동기화, 수납장 진입/복귀(지도·목록·검색 3경로), 편집 무회귀.
