-- Sports Records Table Schema
-- This matches what the application expects

create table if not exists sports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null,
  year int,
  location text,
  school_id text references schools(id),
  school_name text,
  division text,
  gender text,
  team text,
  record_scope text,
  deaflympics boolean default false,
  created_at timestamptz default now()
);

-- Sample data with proper fields
insert into sports (name, sport, year, location, school_id, school_name, division, gender, team, record_scope, deaflympics)
values
  -- Indiana School for the Deaf players
  ('John Smith', 'Basketball', 2023, 'Indianapolis, IN', 'isd', 'Indiana School for the Deaf', 'd1', 'boys', 'ISD Orioles', 'career', true),
  ('Michael Johnson', 'Basketball', 2022, 'Indianapolis, IN', 'isd', 'Indiana School for the Deaf', 'd1', 'boys', 'ISD Orioles', 'season', false),
  ('Sarah Williams', 'Basketball', 2024, 'Indianapolis, IN', 'isd', 'Indiana School for the Deaf', 'd1', 'girls', 'ISD Orioles', 'game', false),
  ('David Brown', 'Basketball', 2021, 'Indianapolis, IN', 'isd', 'Indiana School for the Deaf', 'd1', 'boys', 'ISD Orioles', 'career', false),
  
  -- Maryland School for the Deaf players
  ('Patricia Smith', 'Track', 1992, 'Frederick, MD', 'msd', 'Maryland School for the Deaf', 'd1', 'girls', 'MSD Orioles', 'season', true),
  ('James Davis', 'Basketball', 2023, 'Frederick, MD', 'msd', 'Maryland School for the Deaf', 'd1', 'boys', 'MSD Orioles', 'career', false),
  
  -- Texas School for the Deaf players
  ('Miguel Garcia', 'Basketball', 2001, 'Austin, TX', 'tsd', 'Texas School for the Deaf', 'd1', 'boys', 'TSD Rangers', 'season', true),
  ('Carlos Rodriguez', 'Basketball', 2023, 'Austin, TX', 'tsd', 'Texas School for the Deaf', 'd1', 'boys', 'TSD Rangers', 'game', false),
  
  -- California School for the Deaf, Fremont players
  ('Aiko Tanaka', 'Swimming', 1988, 'Fremont, CA', 'csd-fremont', 'California School for the Deaf, Fremont', 'd1', 'girls', 'CSDF Eagles', 'career', true),
  ('Robert Lee', 'Basketball', 2024, 'Fremont, CA', 'csd-fremont', 'California School for the Deaf, Fremont', 'd1', 'boys', 'CSDF Eagles', 'season', false),
  
  -- Division 2 schools
  ('Thomas Anderson', 'Basketball', 2023, 'Columbus, OH', 'osd', 'Ohio School for the Deaf', 'd2', 'boys', 'OSD Spartans', 'career', false),
  ('Emily Martinez', 'Volleyball', 2024, 'Hartford, CT', 'asd', 'American School for the Deaf', 'd2', 'girls', 'ASD Tigers', 'season', false);

-- Create indexes for better search performance
create index if not exists idx_sports_name on sports(name);
create index if not exists idx_sports_school_id on sports(school_id);
create index if not exists idx_sports_sport on sports(sport);
create index if not exists idx_sports_year on sports(year);
create index if not exists idx_sports_division on sports(division);
create index if not exists idx_sports_gender on sports(gender);
