# 수납장 화면 통일 + 방 이름 워터마크

작성일: 2026-07-24
근거: 사용자 피드백 — ① 목록 뷰에 2-pane 미적용(수납장 내용 UI를 앱 전체 하나로), ② 탑뷰 방 이름과 수납장 겹침.

## 1. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 수납장 내용 UI | **공용 2-pane 화면 하나로 통일** — 목록(모바일 드릴·데스크톱 아코디언)·도식화 어디서 진입해도 동일. 데스크톱 아코디언의 수납장 인라인 펼침은 화면 전환으로 대체 |
| 방 이름 | **중앙 워터마크** — 타일 중앙, 크고 은은하게(muted), 수납장 **아래** 레이어(pointer-events 없음). 꽉 찬 방에서 가려지는 것은 수용(수납장 화면 헤더·확대 편집이 보완) |

## 2. 상세

- **`StoragePane.tsx` 신설**: GridMap의 `StorageScreen`+`SpCmpNode`를 이동·일반화 — props `{ p: HomeTreeProps; storage: Storage; flash?: boolean; onBack: () => void }`. GridMap은 이를 임포트해 사용.
- **순환 임포트 방지**: `DrillHeader`를 `DrillDown.tsx` → `TreeRow.tsx`로 이동(RowMenu와 같은 파일, Icon 이미 임포트). DrillDown·GridMap·StoragePane은 `./TreeRow`에서 임포트.
- **목록 배선**: `HomeTreeProps`에 `onOpenStorage?: (id: string) => void` 추가. page.tsx가 `openStorageId` state 보유 — 목록 뷰에서 값이 있으면(동기화 소실 시 자동 해제) `.main` 컨테이너에 `StoragePane` 렌더, 없으면 기존 트리. `‹` = 목록 복귀.
  - `HomeTree`: 수납장 행 = 탭→`onOpenStorage`(expandable=false, `chevron` 표시, 개수 뱃지 유지). 인라인 `CompartmentTree`/`InlineAddForm`/수납장 하위 추가 행 제거(칸·물건 추가는 2-pane 안에서).
  - `DrillDown`: 수납장 행 탭→`onOpenStorage`. storage/cmp 경로 세그·`ContainerScreen` 제거(경로는 방까지만).
- **데드 정리**: `CompartmentTree` 컴포넌트·`CompartmentNode`·`InlineAddForm`(칸/물건 토글) — 사용처 0 확인 후 삭제. `DeleteBtn`/`InlineInput`/`InlineItemForm`/`AddRow`/`ItemRow`는 잔존(공용 폼).
- **워터마크 CSS**: `.gm-room > .gm-name` = absolute inset 0, 중앙 정렬, 15px·700·`--ink-soft`, `z-index:0`(수납장 `.gm-sto`는 z 1), `pointer-events:none`. 기존 z-index:2 규칙 대체.
- 검색 점프는 현행 유지(도식화 탭의 수납장 화면으로).

## 3. 검증

`tsc`/`eslint`/`vitest`/`build` 통과. 수동: 목록(모바일 드릴·데스크톱 아코디언)에서 수납장 탭→2-pane→복귀, 도식화 동일, 탑뷰 방 이름 중앙 표시·수납장과 비경쟁, 편집·검색 무회귀.
