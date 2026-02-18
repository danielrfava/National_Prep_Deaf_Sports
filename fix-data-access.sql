-- Fix Data Access Issues for GitHub Pages
-- This script ensures your data is accessible from the public-facing site

-- ============================================
-- STEP 1: Enable Row Level Security (RLS) on tables
-- ============================================

-- Enable RLS on raw_stat_rows table
ALTER TABLE raw_stat_rows ENABLE ROW LEVEL SECURITY;

-- Enable RLS on schools table (if it exists)
ALTER TABLE IF EXISTS schools ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sports table (if it exists)
ALTER TABLE IF EXISTS sports ENABLE ROW LEVEL SECURITY;

-- Enable RLS on teams table (if it exists)
ALTER TABLE IF EXISTS teams ENABLE ROW LEVEL SECURITY;

-- Enable RLS on tournaments table (if it exists)
ALTER TABLE IF EXISTS tournaments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create public read policies
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to raw_stat_rows" ON raw_stat_rows;
DROP POLICY IF EXISTS "Allow public read access to schools" ON schools;
DROP POLICY IF EXISTS "Allow public read access to sports" ON sports;
DROP POLICY IF EXISTS "Allow public read access to teams" ON teams;
DROP POLICY IF EXISTS "Allow public read access to tournaments" ON tournaments;

-- Create policies to allow public read access
CREATE POLICY "Allow public read access to raw_stat_rows"
  ON raw_stat_rows FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to schools"
  ON schools FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to sports"
  ON sports FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to teams"
  ON teams FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to tournaments"
  ON tournaments FOR SELECT
  USING (true);

-- ============================================
-- STEP 3: Check if raw_stat_rows table exists and has data
-- ============================================

-- To check if the table exists, run this query:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'raw_stat_rows');

-- To count rows in raw_stat_rows:
-- SELECT COUNT(*) FROM raw_stat_rows;

-- To view sample data:
-- SELECT * FROM raw_stat_rows LIMIT 5;
