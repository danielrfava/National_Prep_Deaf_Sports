-- ============================================
-- NPDS PUBLIC VISIBILITY / FILTER SOURCES
-- ============================================
-- Run this in Supabase so the public site can consume
-- pre-filtered visible schools, sports, and seasons without
-- scanning raw_stat_rows in the browser.

create or replace view public.vw_public_meaningful_stat_rows as
select
  r.id,
  nullif(trim(r.school_id), '') as school_id,
  nullif(trim(r.school), '') as school,
  lower(trim(r.sport)) as sport,
  trim(r.season) as season
from public.raw_stat_rows r
where (
  nullif(trim(r.school_id), '') is not null
  or nullif(trim(r.school), '') is not null
)
and nullif(trim(r.sport), '') is not null
and nullif(trim(r.season), '') is not null
and r.stat_row is not null
and jsonb_typeof(r.stat_row) = 'object'
and r.stat_row <> '{}'::jsonb;

create or replace view public.vw_public_visible_schools as
select distinct
  s.id,
  s.full_name,
  s.short_name,
  s.division
from public.schools s
where exists (
  select 1
  from public.vw_public_meaningful_stat_rows r
  where r.school_id = s.id
     or lower(coalesce(r.school, '')) = lower(trim(coalesce(s.full_name, '')))
     or lower(coalesce(r.school, '')) = lower(trim(coalesce(s.short_name, '')))
);

create or replace view public.vw_public_visible_sports as
select distinct
  sport
from public.vw_public_meaningful_stat_rows
order by sport;

create or replace view public.vw_public_visible_seasons as
select distinct
  season
from public.vw_public_meaningful_stat_rows
order by season desc;
