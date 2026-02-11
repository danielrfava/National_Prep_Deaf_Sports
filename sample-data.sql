create table if not exists sports (
  id uuid primary key default gen_random_uuid(),
  name text,
  sport text,
  year int,
  location text
);

insert into sports (name, sport, year, location)
values
  ('Patricia Smith', 'Track', 1992, 'Washington, DC'),
  ('Miguel Garcia', 'Basketball', 2001, 'Austin, TX'),
  ('Aiko Tanaka', 'Swimming', 1988, 'San Diego, CA');
