-- ============================================
-- NPDS CREATE-ACCOUNT SCHOOL ACCESS FLOW
-- ============================================
-- Run this in Supabase SQL editor before deploying the auth-first Create Account school access flow.
--
-- Goals:
-- 1. Create the real auth user first during public account creation
-- 2. Persist linked pending school access request + user profile rows immediately
-- 3. Unlock portal access only after athletic director/admin approval
-- 4. Preserve legacy invite/activation rows that do not yet have auth_user_id

create table if not exists public.school_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  school_id text not null references public.schools(id),
  school_name text,
  role text not null default 'school_staff',
  approved_role text,
  job_title text not null,
  reference_ad_name text,
  reference_ad_email text,
  verification_notes text,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  approved_by uuid references public.user_profiles(id),
  approved_at timestamptz,
  activation_email_sent_at timestamptz,
  activated_at timestamptz,
  activated_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_access_requests_role_check check (
    role = any (
      array[
        'athletic_director',
        'assistant_ad',
        'coach',
        'stats_staff',
        'volunteer',
        'school_staff',
        'former_staff'
      ]
    )
  ),
  constraint school_access_requests_approved_role_check check (
    approved_role is null
    or approved_role = any (
      array[
        'athletic_director',
        'assistant_ad',
        'coach',
        'stats_staff',
        'volunteer',
        'school_staff',
        'former_staff'
      ]
    )
  ),
  constraint school_access_requests_status_check check (
    status = any (
      array[
        'pending',
        'approved',
        'rejected',
        'activated'
      ]
    )
  ),
  constraint school_access_requests_reference_check check (
    role = 'athletic_director'
    or (
      nullif(btrim(coalesce(reference_ad_name, '')), '') is not null
      and nullif(btrim(coalesce(reference_ad_email, '')), '') is not null
    )
  )
);

alter table public.school_access_requests
add column if not exists auth_user_id uuid references auth.users(id);

create index if not exists idx_school_access_requests_status
  on public.school_access_requests(status, created_at);

create index if not exists idx_school_access_requests_email
  on public.school_access_requests(lower(email));

create unique index if not exists idx_school_access_requests_active_email
  on public.school_access_requests(lower(email))
  where status in ('pending', 'approved');

create unique index if not exists idx_school_access_requests_activated_user
  on public.school_access_requests(activated_user_id)
  where activated_user_id is not null;

create unique index if not exists idx_school_access_requests_auth_user
  on public.school_access_requests(auth_user_id)
  where auth_user_id is not null;

insert into public.school_access_requests (
  email,
  full_name,
  school_id,
  school_name,
  role,
  job_title,
  reference_ad_name,
  reference_ad_email,
  verification_notes,
  auth_user_id,
  status,
  created_at,
  updated_at
)
select
  lower(btrim(up.email)),
  up.full_name,
  up.school_id,
  coalesce(up.school_name, schools.full_name, up.school_id),
  up.role,
  coalesce(nullif(up.job_title, ''), 'Not provided'),
  up.reference_ad_name,
  up.reference_ad_email,
  up.verification_notes,
  up.id,
  case
    when up.status = 'rejected' then 'rejected'
    else 'pending'
  end,
  coalesce(up.created_at, now()),
  coalesce(up.updated_at, up.created_at, now())
from public.user_profiles up
left join public.schools on schools.id = up.school_id
where up.role <> 'admin'
  and up.status in ('pending', 'rejected')
  and not exists (
    select 1
    from public.school_access_requests existing
    where lower(existing.email) = lower(up.email)
  );

update public.school_access_requests
set auth_user_id = activated_user_id,
    updated_at = now()
where auth_user_id is null
  and activated_user_id is not null;

update public.school_access_requests request_row
set auth_user_id = profile.id,
    updated_at = now()
from public.user_profiles profile
where request_row.auth_user_id is null
  and request_row.activated_user_id is null
  and request_row.status in ('pending', 'rejected')
  and lower(request_row.email) = lower(profile.email)
  and profile.role <> 'admin'
  and profile.status in ('pending', 'rejected');

alter table public.user_profiles
drop constraint if exists user_profiles_status_check;

alter table public.user_profiles
add constraint user_profiles_status_check
check (
  status = any (
    array[
      'pending',
      'invited',
      'approved',
      'rejected',
      'archived'
    ]
  )
);

create or replace function public.sync_school_access_request_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_name text;
begin
  new.email := lower(btrim(coalesce(new.email, '')));
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.job_title := btrim(coalesce(new.job_title, ''));
  new.role := lower(btrim(coalesce(new.role, 'school_staff')));
  new.approved_role := nullif(lower(btrim(coalesce(new.approved_role, ''))), '');
  new.auth_user_id := coalesce(new.auth_user_id, new.activated_user_id);
  new.reference_ad_name := nullif(btrim(coalesce(new.reference_ad_name, '')), '');
  new.reference_ad_email := nullif(lower(btrim(coalesce(new.reference_ad_email, ''))), '');
  new.verification_notes := nullif(btrim(coalesce(new.verification_notes, '')), '');
  new.rejection_reason := nullif(btrim(coalesce(new.rejection_reason, '')), '');

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.approved_by := null;
    new.approved_at := null;
    new.approved_role := null;
    new.activation_email_sent_at := null;
    new.activated_at := null;
    new.rejection_reason := null;
  end if;

  if new.full_name = '' then
    raise exception 'Full name is required.';
  end if;

  if new.email = '' or position('@' in new.email) < 2 then
    raise exception 'A valid email address is required.';
  end if;

  if new.job_title = '' then
    raise exception 'Job title is required.';
  end if;

  if new.role not in (
    'athletic_director',
    'assistant_ad',
    'coach',
    'stats_staff',
    'volunteer',
    'school_staff',
    'former_staff'
  ) then
    raise exception 'Requested role is not supported.';
  end if;

  if new.approved_role is not null and new.approved_role not in (
    'athletic_director',
    'assistant_ad',
    'coach',
    'stats_staff',
    'volunteer',
    'school_staff',
    'former_staff'
  ) then
    raise exception 'Approved role is not supported.';
  end if;

  select full_name
  into resolved_school_name
  from public.schools
  where id = new.school_id;

  if resolved_school_name is null then
    raise exception 'Select a valid school before submitting.';
  end if;

  new.school_name := resolved_school_name;
  new.updated_at := now();

  if new.role <> 'athletic_director'
     and (
       new.reference_ad_name is null
       or new.reference_ad_email is null
     ) then
    raise exception 'Non-Athletic Director requests require Athletic Director name and email.';
  end if;

  if tg_op = 'INSERT'
     and exists (
       select 1
       from public.user_profiles existing_profile
       where lower(existing_profile.email) = new.email
         and existing_profile.role <> 'admin'
         and existing_profile.status in ('invited', 'approved')
     ) then
    raise exception 'A school access account already exists for this email.';
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'approved' and old.status is distinct from 'approved' and new.approved_at is null then
      new.approved_at := now();
    end if;

    if new.status in ('approved', 'rejected', 'activated')
       and old.status is distinct from new.status
       and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;

    if new.status <> 'rejected' then
      new.rejection_reason := null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.sync_school_access_request_state() is
  'SECURITY DEFINER is required because auth-linked school access request rows are validated and normalized inside this trigger.';

drop trigger if exists trg_sync_school_access_requests on public.school_access_requests;

create trigger trg_sync_school_access_requests
before insert or update on public.school_access_requests
for each row
execute function public.sync_school_access_request_state();

create or replace function public.handle_school_account_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  request_record public.school_access_requests%rowtype;
  resolved_role text;
  requested_role text;
  requested_school_id text;
  requested_school_name text;
  requested_full_name text;
  requested_reference_ad_name text;
  requested_reference_ad_email text;
  requested_job_title text;
  requested_verification_notes text;
begin
  begin
    request_id := nullif(new.raw_user_meta_data ->> 'school_access_request_id', '')::uuid;
  exception
    when invalid_text_representation then
      request_id := null;
  end;

  if request_id is not null then
    select *
    into request_record
    from public.school_access_requests
    where id = request_id;

    if not found then
      return new;
    end if;

    resolved_role := coalesce(request_record.approved_role, request_record.role, 'school_staff');

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
      verification_notes,
      approved_by,
      approved_at,
      archived_at
    )
    values (
      new.id,
      lower(new.email),
      request_record.full_name,
      request_record.school_id,
      request_record.school_name,
      resolved_role,
      'invited',
      request_record.reference_ad_name,
      request_record.reference_ad_email,
      request_record.job_title,
      request_record.verification_notes,
      request_record.approved_by,
      request_record.approved_at,
      null
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        school_id = excluded.school_id,
        school_name = excluded.school_name,
        role = excluded.role,
        status = 'invited',
        reference_ad_name = excluded.reference_ad_name,
        reference_ad_email = excluded.reference_ad_email,
        job_title = excluded.job_title,
        verification_notes = excluded.verification_notes,
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        archived_at = null,
        updated_at = now();

    update public.school_access_requests
    set auth_user_id = coalesce(auth_user_id, new.id),
        updated_at = now()
    where id = request_record.id;

    return new;
  end if;

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

  if requested_school_name is null then
    requested_school_name := nullif(new.raw_user_meta_data ->> 'school_name', '');
  end if;

  requested_full_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(lower(new.email), '@', 1)
  );
  requested_reference_ad_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'reference_ad_name', '')), '');
  requested_reference_ad_email := nullif(
    lower(btrim(coalesce(new.raw_user_meta_data ->> 'reference_ad_email', ''))),
    ''
  );
  requested_job_title := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'job_title', '')), '');
  requested_verification_notes := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'verification_notes', '')),
    ''
  );

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
    verification_notes,
    approved_by,
    approved_at,
    archived_at
  )
  values (
    new.id,
    lower(new.email),
    requested_full_name,
    requested_school_id,
    requested_school_name,
    requested_role,
    'pending',
    requested_reference_ad_name,
    requested_reference_ad_email,
    requested_job_title,
    requested_verification_notes,
    null,
    null,
    null
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      school_id = excluded.school_id,
      school_name = excluded.school_name,
      role = excluded.role,
      status = case
        when user_profiles.status in ('approved', 'archived') then user_profiles.status
        else 'pending'
      end,
      reference_ad_name = excluded.reference_ad_name,
      reference_ad_email = excluded.reference_ad_email,
      job_title = excluded.job_title,
      verification_notes = excluded.verification_notes,
      approved_by = case
        when user_profiles.status in ('approved', 'archived') then user_profiles.approved_by
        else null
      end,
      approved_at = case
        when user_profiles.status in ('approved', 'archived') then user_profiles.approved_at
        else null
      end,
      archived_at = case
        when user_profiles.status = 'archived' then user_profiles.archived_at
        else null
      end,
      updated_at = now();

  insert into public.school_access_requests (
    email,
    full_name,
    school_id,
    school_name,
    role,
    job_title,
    reference_ad_name,
    reference_ad_email,
    verification_notes,
    auth_user_id,
    status
  )
  values (
    lower(new.email),
    requested_full_name,
    requested_school_id,
    requested_school_name,
    requested_role,
    requested_job_title,
    requested_reference_ad_name,
    requested_reference_ad_email,
    requested_verification_notes,
    new.id,
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_school_account on auth.users;

create trigger on_auth_user_created_school_account
after insert on auth.users
for each row
execute function public.handle_school_account_signup();

create or replace function public.complete_school_access_activation(request_id uuid default null)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_email text;
  request_record public.school_access_requests%rowtype;
  resolved_role text;
  profile_record public.user_profiles%rowtype;
begin
  current_user_id := auth.uid();
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if current_user_id is null then
    raise exception 'You must be signed in to activate this account.';
  end if;

  if current_email = '' then
    raise exception 'The signed-in user email could not be verified.';
  end if;

  if request_id is not null then
    select *
    into request_record
    from public.school_access_requests
    where id = request_id;
  else
    select *
    into request_record
    from public.school_access_requests
    where lower(email) = current_email
      and status in ('approved', 'activated')
    order by approved_at desc nulls last, created_at desc
    limit 1;
  end if;

  if not found then
    raise exception 'No approved school access request is ready for activation.';
  end if;

  if lower(request_record.email) <> current_email then
    raise exception 'This activation link does not match the signed-in email address.';
  end if;

  if request_record.status not in ('approved', 'activated') then
    raise exception 'This school access request is not approved yet.';
  end if;

  if request_record.auth_user_id is not null
     and request_record.activation_email_sent_at is null
     and request_record.activated_user_id is null then
    raise exception 'This school access request already has a linked auth account. Sign in after approval instead of using activation.';
  end if;

  resolved_role := coalesce(request_record.approved_role, request_record.role, 'school_staff');

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
    verification_notes,
    approved_by,
    approved_at,
    archived_at
  )
  values (
    current_user_id,
    current_email,
    request_record.full_name,
    request_record.school_id,
    request_record.school_name,
    resolved_role,
    'approved',
    request_record.reference_ad_name,
    request_record.reference_ad_email,
    request_record.job_title,
    request_record.verification_notes,
    request_record.approved_by,
    coalesce(request_record.approved_at, now()),
    null
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      school_id = excluded.school_id,
      school_name = excluded.school_name,
      role = excluded.role,
      status = 'approved',
      reference_ad_name = excluded.reference_ad_name,
      reference_ad_email = excluded.reference_ad_email,
      job_title = excluded.job_title,
      verification_notes = excluded.verification_notes,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      archived_at = null,
      updated_at = now();

  update public.school_access_requests
  set status = 'activated',
      auth_user_id = coalesce(auth_user_id, current_user_id),
      activated_at = coalesce(activated_at, now()),
      activated_user_id = current_user_id,
      reviewed_at = coalesce(reviewed_at, now()),
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = request_record.id;

  select *
  into profile_record
  from public.user_profiles
  where id = current_user_id;

  return profile_record;
end;
$$;

alter table public.school_access_requests enable row level security;

drop policy if exists "Anyone can submit school access requests" on public.school_access_requests;
drop policy if exists "Admins can view school access requests" on public.school_access_requests;
drop policy if exists "Admins can update school access requests" on public.school_access_requests;

create policy "Admins can view school access requests"
on public.school_access_requests for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles admin_user
    where admin_user.id = auth.uid()
      and admin_user.role = 'admin'
  )
);

create policy "Admins can update school access requests"
on public.school_access_requests for update
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

-- Public inserts now flow through auth.users signup + handle_school_account_signup().
-- Do not recreate an anon/authenticated insert policy here, or the app can drift back into request-only behavior.

grant execute on function public.complete_school_access_activation(uuid) to authenticated;
