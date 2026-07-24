-- 수납장 타일 크기(셀 단위). NULL = 기본 크기(3×2). RLS 변경 없음.
alter table public.storages
  add column if not exists w int,
  add column if not exists h int;
