-- ============================================
-- NPDS PHASE 1 SCHOOL ACCOUNT ACCESS
-- ============================================
-- Run this in Supabase SQL editor before using the new school account flow.
-- Verification notes are stored in user_profiles.verification_notes until review.

alter table public.user_profiles
add column if not exists school_id text,
add column if not exists role text not null default 'school_staff',
add column if not exists status text not null default 'pending',
add column if not exists reference_ad_name text,
add column if not exists reference_ad_email text,
add column if not exists job_title text,
add column if not exists verification_notes text,
add column if not exists approved_by uuid,
add column if not exists approved_at timestamptz,
add column if not exists archived_at timestamptz,
add column if not exists updated_at timestamptz default now();

alter table public.user_profiles
add column if not exists school_name text;

alter table public.user_profiles
drop constraint if exists user_profiles_role_check;

-- Keep platform admins working with the existing admin dashboard.
alter table public.user_profiles
add constraint user_profiles_role_check
check (
  role = any (
    array[
      'athletic_director',
      'assistant_ad',
      'coach',
      'stats_staff',
      'volunteer',
      'school_staff',
      'former_staff',
      'admin'
    ]
  )
);

alter table public.user_profiles
drop constraint if exists user_profiles_status_check;

alter table public.user_profiles
add constraint user_profiles_status_check
check (
  status = any (
    array[
      'pending',
      'approved',
      'rejected',
      'archived'
    ]
  )
);

create index if not exists idx_user_profiles_school_id on public.user_profiles(school_id);
create index if not exists idx_user_profiles_status on public.user_profiles(status);

create or replace function public.sync_user_profile_state()
returns trigger
language plpgsql
as $$
declare
  previous_status text;
  previous_school_id text;
  resolved_school_name text;
begin
  previous_status := case when tg_op = 'INSERT' then null else old.status end;
  previous_school_id := case when tg_op = 'INSERT' then null else old.school_id end;

  if new.school_id is not null and (
    tg_op = 'INSERT'
    or new.school_id is distinct from previous_school_id
    or new.school_name is null
  ) then
    select full_name
    into resolved_school_name
    from public.schools
    where id = new.school_id;

    if resolved_school_name is not null then
      new.school_name := resolved_school_name;
    end if;
  end if;

  new.updated_at := now();

  if new.status = 'approved' and previous_status is distinct from 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.status = 'archived' and previous_status is distinct from 'archived' and new.archived_at is null then
    new.archived_at := now();
  end if;

  if new.status <> 'archived' then
    new.archived_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_user_profiles on public.user_profiles;

create trigger trg_sync_user_profiles
before insert or update on public.user_profiles
for each row
execute function public.sync_user_profile_state();

create or replace function public.handle_school_account_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_school_id text;
  requested_school_name text;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'school_staff'));

  if requested_role not in (
    'athletic_director',
    'assistant_ad',
    'coach',
    'stats_staff',
    'volunteer',
    'school_staff',
    'former_staff'
  ) then
    requested_role := 'school_staff';
  end if;

  requested_school_id := nullif(new.raw_user_meta_data ->> 'school_id', '');

  if requested_school_id is not null then
    select full_name
    into requested_school_name
    from public.schools
    where id = requested_school_id;
  end if;

  insert into public.user_profiles (
    id,
    email,
    full_name,
    school_id,
    school_name,
    role,
    status,
    reference_ad_name,
    reference_ad_email,
    job_title,
    verification_notes
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    requested_school_id,
    coalesce(requested_school_name, nullif(new.raw_user_meta_data ->> 'school_name', '')),
    requested_role,
    'pending',
    nullif(new.raw_user_meta_data ->> 'reference_ad_name', ''),
    nullif(new.raw_user_meta_data ->> 'reference_ad_email', ''),
    nullif(new.raw_user_meta_data ->> 'job_title', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'verification_notes', ''),
      nullif(new.raw_user_meta_data ->> 'request_reason', '')
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_school_account on auth.users;

create trigger on_auth_user_created_school_account
after insert on auth.users
for each row
execute function public.handle_school_account_signup();

alter table public.user_profiles enable row level security;
alter table public.game_submissions enable row level security;

drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Admins can view all profiles" on public.user_profiles;
drop policy if exists "Only admins can manage users" on public.user_profiles;
drop policy if exists "Approved school users can view school staff" on public.user_profiles;
drop policy if exists "Admins can manage all profiles" on public.user_profiles;
drop policy if exists "Athletic directors can manage approved school staff" on public.user_profiles;

create policy "Users can view own profile"
on public.user_profiles for select
to authenticated
using (auth.uid() = id);

create policy "Approved school users can view school staff"
on public.user_profiles for select
to authenticated
using (
  status = any (array['approved', 'archived'])
  and exists (
    select 1
    from public.user_profiles viewer
    where viewer.id = auth.uid()
      and viewer.status = 'approved'
      and viewer.school_id is not null
      and viewer.school_id = user_profiles.school_id
  )
);

create policy "Admins can view all profiles"
on public.user_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
);

create policy "Admins can manage all profiles"
on public.user_profiles for all
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
);

create policy "Athletic directors can manage approved school staff"
on public.user_profiles for update
to authenticated
using (
  id <> auth.uid()
  and exists (
    select 1
    from public.user_profiles viewer
    where viewer.id = auth.uid()
      and viewer.status = 'approved'
      and viewer.role = 'athletic_director'
      and viewer.school_id = user_profiles.school_id
  )
)
with check (
  id <> auth.uid()
  and school_id = (
    select viewer.school_id
    from public.user_profiles viewer
    where viewer.id = auth.uid()
  )
  and role = any (
    array[
      'assistant_ad',
      'coach',
      'stats_staff',
      'volunteer',
      'school_staff',
      'former_staff'
    ]
  )
  and status = any (array['approved', 'archived'])
);

drop policy if exists "ADs can submit games for their school" on public.game_submissions;
drop policy if exists "Users can view own submissions" on public.game_submissions;
drop policy if exists "Admins can view all submissions" on public.game_submissions;
drop policy if exists "Only admins can review submissions" on public.game_submissions;
drop policy if exists "Approved school users can submit games for their school" on public.game_submissions;
drop policy if exists "Approved school users can view school submissions" on public.game_submissions;

create policy "Approved school users can submit games for their school"
on public.game_submissions for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_profiles viewer
    where viewer.id = auth.uid()
      and viewer.status = 'approved'
      and viewer.role = any (
        array[
          'athletic_director',
          'assistant_ad',
          'coach',
          'stats_staff',
          'volunteer',
          'school_staff'
        ]
      )
      and viewer.school_id = game_submissions.submitter_school_id
  )
);

create policy "Approved school users can view school submissions"
on public.game_submissions for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles viewer
    where viewer.id = auth.uid()
      and viewer.status = 'approved'
      and viewer.school_id = game_submissions.submitter_school_id
  )
);

create policy "Admins can view all submissions"
on public.game_submissions for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
);

create policy "Only admins can review submissions"
on public.game_submissions for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
);

-- One-time backfill reminder for existing live users:
-- Existing admin and already-approved school accounts created before this migration
-- should be updated manually so they are not left in pending status.
--
-- Example:
-- update public.user_profiles
-- set status = 'approved',
--     approved_at = coalesce(approved_at, now())
-- where email in ('admin@npds.com', 'current-ad@school.edu');
