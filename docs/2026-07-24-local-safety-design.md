# 로컬 안전장치 — 백업/복원 · 사진 로컬 저장 · 저장소 보호

작성일: 2026-07-24
근거: 로그인 프리 로컬 전용 전환 후 사용자 우려 "데이터 유지". 결정: 로그인 없이 안전장치 3종으로 해결.

## 1. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 백업 | **JSON 파일 내보내기/가져오기** — 백업·복구·기기 이전 수단. 가져오기는 **전체 교체**(확인 모달) |
| 사진 | **IndexedDB blob 로컬 저장**으로 전환(현재 서버 업로드는 항상 실패·유실). 목록 물건 행에 썸네일 표시 |
| 저장소 보호 | 부팅 시 `navigator.storage.persist()` 1회 요청 + 설정 시트에 홈 화면 설치 안내 |
| UI 진입점 | 헤더에 설정(기어) 버튼 → 시트: 내보내기 / 가져오기 / 저장소 보호 상태·설치 안내 |
| 로그인 | 여전히 안 붙임 — 서버 미접근 유지 |

## 2. 사진 로컬 저장

- **idb**: `DB_VERSION 1→2`, `photos` 스토어 추가(out-of-line key = itemId → `Blob`). `onupgradeneeded`는 기존 스토어에 `objectStoreNames.contains` 가드 필수(v1→v2 증분 업그레이드).
- **store**: `putPhoto(itemId, blob)` / `getPhoto(itemId)` / `delPhoto(itemId)` 추가. `clearFamilyData`에 photos clear 포함.
- **저장 형식**: `downscaleImage` 결과를 **평문 blob**으로 저장 — 공개된 고정 로컬 키로 암호화하는 것은 보안 가치가 없고 표시 비용만 늘림(`encryptBytes` 경로 미사용 전환). `photo_path = 'local'` 마커(존재 표시·내보내기 판단용).
- **handleItemsAdd**: supabase.storage 업로드 블록 제거 → `putPhoto`. 실패 토스트 소멸. supabase import 제거(마지막 사용처).
- **표시**: `BootData.photoUrls: Record<itemId, objectURL>` — loadLocalData가 `photo_path==='local'`인 물건의 blob을 읽어 objectURL 생성. `HomeTreeProps`에 `photoUrls?` 추가 → HomeTree→CompartmentTree(기존 prop), DrillDown·GridMap의 ItemRow에 전달. 추가 시 URL 생성·삭제 시 `delPhoto`+revoke.
- ponytail: objectURL은 재로드 시 일괄 재생성(개별 revoke 생략 — 로드당 수십 장 규모, 세션 수명 무해).

## 3. 백업 파일 (JSON)

- **형식 v1** (평문 — 고정 로컬 키는 비밀이 아니므로 정직하게 평문):

```json
{ "app": "homes-map", "version": 1, "exported_at": "ISO",
  "rooms": [Room…], "storages": [Storage…],
  "items": [{ "id","storage_id","compartment_id","name","memo","created_at","photo"?: "base64" }] }
```

- **lib/backup.ts (순수, TDD)**: `buildBackup(rooms, storages, items: PlainItem[])` → JSON 문자열, `parseBackup(text)` → 검증된 구조 or throw(앱 태그·버전·필수 필드). base64 인코딩/디코딩 헬퍼 포함(Uint8Array 기반, 브라우저·Node 공용).
- **내보내기**: 현재 로드된 데이터(복호화된 이름·메모 + 사진 blob→base64) → `homes-map-backup-YYYY-MM-DD.json` 다운로드.
- **가져오기**: 파일 선택 → `parseBackup` → 확인 모달("현재 데이터를 백업 파일 내용으로 교체합니다. 되돌릴 수 없어요.") → 현재 familyId의 rooms/storages/items/photos 삭제 → 파일 내용 재구성(이름·메모는 로컬 키로 재암호화, `family_id`=현재, 사진 base64→blob `putPhoto`, `photo_path='local'`, dirty:false) → 데이터 리로드.
- 실패 시(형식 오류) 토스트로 사유 표시, 기존 데이터 무변경(삭제는 파싱 성공 후에만).

## 4. 설정 시트 + 저장소 보호

- 헤더 우측 기어 아이콘(신규 `settings` 아이콘 — Icon.tsx에 lucide 패스 추가) → `.sheet` 재사용 시트:
  - `백업 파일 내보내기` / `백업 파일 가져오기`(숨김 file input)
  - 저장소 보호 상태 표시: `navigator.storage.persisted()` 결과("보호됨" / "브라우저 정리 대상일 수 있음")
  - 안내 문구: "홈 화면에 추가하면 iOS가 데이터를 자동 정리하지 않아요. 사파리 공유 버튼 → '홈 화면에 추가'"
- 부팅(`enterLocal`)에서 `navigator.storage?.persist?.()` fire-and-forget 1회.

## 5. 범위 외

멤버·활동 데이터 백업(휴면 기능), 사진 다중·상세 화면, 자동 백업 스케줄, zip 압축(사진 대량 시 다음 단계 — v1은 base64 인라인, 개인 규모 수십 장 전제).

## 6. 검증

- backup.ts 왕복·검증 실패 케이스 vitest. `tsc`/`eslint`/`vitest`/`build` 통과.
- 수동: 사진 첨부 → 썸네일 표시·재실행 후 유지, 내보내기 파일 확인, 가져오기 교체, 설정 시트 표시.
