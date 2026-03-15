-- ============================================
-- NPDS FOOTBALL FORMAT STORAGE UPGRADE
-- ============================================
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- 1. Keep football as one sport family
-- 2. Store the season/submission format dimension in sport_variant
-- 3. Make raw_stat_rows filterable for 11-man / 8-man / 6-man / unknown
--
-- After running this file, rerun:
--   submission-approval-raw-stat-rows-migration.sql
-- so approve_game_submission(...) copies football format into raw_stat_rows.

alter table public.raw_stat_rows
add column if not exists sport_variant text;

comment on column public.game_submissions.sport_variant is
  'Football format dimension: 11-man, 8-man, 6-man, unknown. NULL for non-football submissions.';

comment on column public.games.sport_variant is
  'Football format dimension: 11-man, 8-man, 6-man, unknown. NULL for non-football games.';

comment on column public.raw_stat_rows.sport_variant is
  'Football format dimension copied from submission approval for filtering public records. NULL for non-football rows.';

create index if not exists idx_raw_stat_rows_sport_variant
  on public.raw_stat_rows (sport_variant)
  where sport_variant is not null;
