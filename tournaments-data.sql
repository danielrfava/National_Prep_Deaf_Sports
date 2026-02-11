create table if not exists tournaments (
  id text primary key,
  name text,
  sport text,
  level text,
  gender text,
  start_date date,
  end_date date,
  location text,
  description text,
  tags text[]
);

insert into tournaments (id, name, sport, level, gender, start_date, end_date, location, description, tags)
values
  ('clerc-classic', 'Clerc Classic', 'basketball', 'hs', 'boys', '2026-02-12', '2026-02-15', 'TBD', 'Division 1 (Big 6) programs are core members; Division 2 teams may receive invitations depending on roster and season.', '{basketball,tournament,division1-core,division2-invite}'),
  ('willigan', 'Willigan Wrestling Tournament', 'wrestling', 'hs', 'boys', '2026-01-10', '2026-01-11', 'TBD', 'Primarily Division 1 programs; Division 2 schools may attend if they field a team.', '{wrestling,tournament,division1-core,division2-invite}'),
  ('hoy-classic', 'Hoy Classic', 'softball', 'hs', 'girls', '2026-04-18', '2026-04-19', 'TBD', 'Softball tournament (baseball portion was discontinued).', '{softball,tournament}'),
  ('spike-it-out', 'Spike It Out', 'volleyball', 'hs', 'girls', '2026-10-03', '2026-10-05', 'TBD', 'Volleyball tournament similar format to Clerc Classic; Division 1 teams typically included, Division 2 by invitation depending on roster year-to-year.', '{volleyball,tournament,division1-core,division2-invite}');
