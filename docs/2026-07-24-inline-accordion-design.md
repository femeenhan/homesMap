# 전면 아코디언 복귀 + 행 인라인 추가 2버튼 + 수납장 복사

작성일: 2026-07-24
근거: 사용자 결정 — 하이브리드 홈 이후 수납장 화면전환(StoragePane)은 이질적. 전 레벨 아코디언 인라인 + 행 아이콘 버튼 2개(＋칸/＋물건) + 수납장 복사.

## 1. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 수납장 내용 | **화면전환 폐지 → 목록 인라인 아코디언**(수납장 행 탭=펼침: 칸 트리 재귀 + 물건 행·사진 썸네일). `StoragePane`·2-pane 삭제(git 복원 가능) |
| 지도·검색 연결 | 화면전환 대신 **동기화**: 지도 수납장 타일 탭·검색 결과 탭 → 목록에서 방+수납장 펼침+스크롤+하이라이트(`focusStorageId`) — "지도=선택기, 목록=내용" 전 레벨 완성 |
| 행 추가 버튼 | 수납장·칸 행에 **아이콘 버튼 2개**: `folder-plus`(칸 추가)·`box-plus`(물건 추가) — 확립된 폴더/박스 언어 재사용, aria-label·title 보강. 각각 단순 폼(InlineInput / InlineItemForm) 인라인 — 칸/물건 토글 폼 불필요. 방 행 `＋`(수납장)은 유지 |
| 수납장 복사 | ⋯ 메뉴에 `복사`: **칸 구조까지 복사, 물건 제외**. 이름 `"○○ 복사"`, 같은 방 빈 자리 autoPlace, w/h 동일. 칸 id 신규 발급+parent_id 재매핑(순수 함수+테스트) |

## 2. 상세

- **TreeRow 확장**: `onAdd?` → `addActions?: { icon: IconName; label: string; onClick(): void }[]`(방=1개 plus, 수납장·칸=2개). `RowMenu`에 `onDuplicate?` 옵션 항목(`복사`).
- **Icon**: `folder-plus`·`box-plus`(lucide folder-plus·package-plus 패스) 추가.
- **HomeTree**: `TreeStorage` 아코디언화(expandable, chevron 제거) + 하위에 `CmpNode` 재귀(직속 물건 수 뱃지, addActions 2개, ⋯ 이름수정/삭제)·`ItemRow`. `focusStorageId?: string | null` — 해당 수납장 포함 방·수납장 자동 펼침+scrollIntoView+`sel` 하이라이트(+검색 시 flash).
- **page**: `openStorageId`/`StoragePane` 렌더 제거 → `focusStorageId` state. 지도 타일 탭·검색 탭 = `setFocusStorageId`(검색은 flash 동반). `HomeTreeProps`: `onOpenStorage` → `focusStorageId`/`onDuplicateStorage?`로 교체. `handleDuplicateStorage`: `duplicateCompartments`로 구조 복사 + autoPlace + putLocal/push(기존 패턴).
- **lib/compartments**: `duplicateCompartments(comps: Compartment[]): Compartment[]` — 전부 새 id, parent_id 재매핑(TDD).
- **삭제**: `StoragePane.tsx`, `.sp-*` CSS, `gm-focus`의 `.sp-right` 타깃(목록 행 flash로 대체), GridMap의 `onOpenStorage` 경유 배선(→`onSelectStorage`류로 개명 or focus 콜백 재사용).

## 3. 검증

`tsc`/`eslint`/`vitest`(+duplicate 테스트)/`build`. 수동: 수납장 인라인 펼침(칸 중첩·물건·사진), 행 2버튼 추가 각각, 지도 타일→목록 동기화, 검색→펼침+플래시, 복사(중첩 칸 보존·물건 0·빈 자리 배치), 모바일 390px.
