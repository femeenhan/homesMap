# 물건 상세 시트 — 사진 크게 보기 + 이름·메모·사진 수정

작성일: 2026-07-25
근거: 사용자 — "① 사진이 아이콘만 해서 기능적이지 않음 ② 메모·사진 수정 불가". 참고 이미지 §5(물건 상세 아주 심플) 대응. 백로그 '물건 상세 화면' 소화.

## 1. 확정 결정

| 항목 | 결정 |
|---|---|
| 진입 | **물건 행 탭 → 물건 상세 바텀시트**(`.sheet` 재사용). 행의 썸네일·휴지통은 유지 |
| 사진 | 시트 상단 **큰 프리뷰**(object-fit contain, max-height 40vh). `사진 변경`(없으면 `사진 추가`)·`사진 삭제` — 즉시 저장(다운스케일→IndexedDB 교체, objectURL 정리) |
| 이름·메모 | 인라인 편집, **blur 시 저장**(앱의 기존 이름수정 문법). 이름 빈값=무시(원복), 메모 빈값=메모 제거. maxLength 30/40 기존 유지 |
| 위치 | 브레드크럼 `방 › 수납장 › 칸…`(search.ts 내부 경로 로직 재사용 가능하면 export, 아니면 시트에서 조립) |
| 삭제 | 시트 하단 삭제 버튼(기존 Modal 확인·카피) → 삭제 후 시트 닫힘 |
| 데이터 | 신규 `handleItemUpdate(item, patch: { name?; memo?; photoFile?: File | null })` — File=교체/추가, null=사진 삭제, undefined=무변경. 이름/메모 재암호화, photo_path='local'/null, photoUrls 갱신(revoke 포함). putLocal/push 기존 패턴 |

## 2. 구성

- 신규 `ItemSheet.tsx`: props `{ item: DecItem; photoUrl?: string; rooms; storages; onUpdate(patch); onDelete(); onClose() }`. page가 `openItem`(id) state 소유 — 동기화로 물건 소실 시 자동 닫힘(`find ?? null` 패턴).
- `ItemRow`에 `onOpen?` 추가(행 탭 — 휴지통·기존 동작과 stopPropagation 분리). HomeTree(직속·CmpNode) 배선.
- `HomeTreeProps`: `onUpdateItem?: (item, patch) => void | Promise<void>`, `onOpenItem?`은 page가 직접? — HomeTree가 ItemRow에 `onOpen={() => p.onOpenItem?.(it.id)}` 전달하는 형태로 `onOpenItem?: (id: string) => void` 추가.

## 3. 범위 외

사진 전체화면 라이트박스·다중 사진, 물건 이동(다른 칸으로), 메모 멀티라인.

## 4. 검증

`tsc`/`eslint`/`vitest`/`build`. 수동: 행 탭→시트, 사진 추가/변경/삭제 즉시 반영(행 썸네일 포함), 이름·메모 blur 저장, 브레드크럼, 삭제→닫힘, 재실행 후 유지.
