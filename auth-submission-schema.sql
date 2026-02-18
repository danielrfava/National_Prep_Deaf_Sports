-- ============================================
-- AUTHENTICATION & SUBMISSION SYSTEM SCHEMA
-- ============================================
-- This enables schools to submit game data for approval

-- ============================================
-- 1. USER PROFILES TABLE
-- ============================================
-- Stores athletic director and admin accounts
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('athletic_director', 'admin')),
  school_id text REFERENCES schools(id),
  school_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_school_id ON user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- ============================================
-- 2. GAME SUBMISSIONS TABLE (Pending Approval)
-- ============================================
-- Stores all submitted games before they go live
CREATE TABLE IF NOT EXISTS game_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid REFERENCES user_profiles(id) NOT NULL,
  submitter_school_id text REFERENCES schools(id) NOT NULL,
  
  -- Game Information
  game_date date NOT NULL,
  sport text NOT NULL,
  gender text CHECK (gender IN ('boys', 'girls')),
  sport_variant text, -- For football: '8-man' or '11-man'; For other sports: NULL
  
  -- Teams & Score
  home_team_id text REFERENCES schools(id),
  away_team_id text REFERENCES schools(id),
  home_score integer,
  away_score integer,
  location text,
  
  -- Game Data (JSON format - this is the key!)
  game_data jsonb NOT NULL,
  
  -- Metadata
  submission_method text CHECK (submission_method IN ('text_paste', 'csv_upload', 'manual_form')),
  original_data text, -- Store original paste/CSV for reference
  
  -- Approval Workflow
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES user_profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_submissions_status ON game_submissions(status);
CREATE INDEX IF NOT EXISTS idx_game_submissions_submitter ON game_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_game_submissions_school ON game_submissions(submitter_school_id);
CREATE INDEX IF NOT EXISTS idx_game_submissions_date ON game_submissions(game_date DESC);

-- ============================================
-- 3. GAMES TABLE (Approved & Live)
-- ============================================
-- Stores approved games that appear on public site
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES game_submissions(id),
  
  -- Game Information
  game_date date NOT NULL,
  sport text NOT NULL,
  gender text CHECK (gender IN ('boys', 'girls')),
  sport_variant text, -- For football: '8-man' or '11-man'; For other sports: NULL
  
  -- Teams & Score
  home_team_id text REFERENCES schools(id),
  home_team_name text,
  away_team_id text REFERENCES schools(id),
  away_team_name text,
  home_score integer NOT NULL,
  away_score integer NOT NULL,
  location text,
  
  -- Tournament/Event Info
  tournament_name text,
  is_playoff boolean DEFAULT false,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date DESC);
CREATE INDEX IF NOT EXISTS idx_games_sport ON games(sport);
CREATE INDEX IF NOT EXISTS idx_games_home_team ON games(home_team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team ON games(away_team_id);

-- ============================================
-- 4. PLAYER STATS TABLE (Approved & Live)
-- ============================================
-- Stores individual player performance from approved games
CREATE TABLE IF NOT EXISTS player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  
  -- Player Info
  player_name text NOT NULL,
  school_id text REFERENCES schools(id),
  school_name text,
  
  -- Stats (sport-specific, stored as JSONB for flexibility)
  stats jsonb NOT NULL,
  
  -- Common stats (extracted for easy querying)
  points integer,
  rebounds integer,
  assists integer,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_stats_game ON player_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_name);
CREATE INDEX IF NOT EXISTS idx_player_stats_school ON player_stats(school_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_points ON player_stats(points DESC);

-- ============================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USER PROFILES POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
ON user_profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can insert/update user profiles
CREATE POLICY "Only admins can manage users"
ON user_profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================
-- GAME SUBMISSIONS POLICIES
-- ============================================

-- Athletic directors can insert submissions for their own school
CREATE POLICY "ADs can submit games for their school"
ON game_submissions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() 
    AND role = 'athletic_director'
    AND school_id = game_submissions.submitter_school_id
  )
);

-- Users can view their own submissions
CREATE POLICY "Users can view own submissions"
ON game_submissions FOR SELECT
TO authenticated
USING (submitted_by = auth.uid());

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON game_submissions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can update submissions (approve/reject)
CREATE POLICY "Only admins can review submissions"
ON game_submissions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================
-- GAMES & PLAYER STATS POLICIES (Public Read)
-- ============================================

-- Anyone can view approved games (public data)
CREATE POLICY "Public can view games"
ON games FOR SELECT
TO anon, authenticated
USING (true);

-- Anyone can view player stats (public data)
CREATE POLICY "Public can view player stats"
ON player_stats FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can insert games (from approved submissions)
CREATE POLICY "Only admins can insert games"
ON games FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can insert player stats
CREATE POLICY "Only admins can insert player stats"
ON player_stats FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to automatically approve a submission and move to live tables
CREATE OR REPLACE FUNCTION approve_game_submission(submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  submission_record game_submissions%ROWTYPE;
  new_game_id uuid;
  player_record jsonb;
BEGIN
  -- Get the submission
  SELECT * INTO submission_record
  FROM game_submissions
  WHERE id = submission_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  
  -- Insert into games table
  INSERT INTO games (
    submission_id,
    game_date,
    sport,
    gender,
    sport_variant,
    home_team_id,
    home_team_name,
    away_team_id,
    away_team_name,
    home_score,
    away_score,
    location
  )
  VALUES (
    submission_record.id,
    submission_record.game_date,
    submission_record.sport,
    submission_record.gender,
    submission_record.sport_variant,
    submission_record.home_team_id,
    (SELECT full_name FROM schools WHERE id = submission_record.home_team_id),
    submission_record.away_team_id,
    (SELECT full_name FROM schools WHERE id = submission_record.away_team_id),
    submission_record.home_score,
    submission_record.away_score,
    submission_record.location
  )
  RETURNING id INTO new_game_id;
  
  -- Insert player stats from JSON
  FOR player_record IN 
    SELECT * FROM jsonb_array_elements(submission_record.game_data->'players')
  LOOP
    INSERT INTO player_stats (
      game_id,
      player_name,
      school_id,
      school_name,
      stats,
      points,
      rebounds,
      assists
    )
    VALUES (
      new_game_id,
      player_record->>'name',
      player_record->>'school_id',
      player_record->>'school_name',
      player_record->'stats',
      (player_record->'stats'->>'points')::integer,
      (player_record->'stats'->>'rebounds')::integer,
      (player_record->'stats'->>'assists')::integer
    );
  END LOOP;
  
  -- Update submission status
  UPDATE game_submissions
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = submission_id;
END;
$$;

-- ============================================
-- 7. SAMPLE DATA FOR TESTING
-- ============================================

-- Create a test admin user (you'll do this manually in Supabase)
-- After creating auth user, insert profile:
-- INSERT INTO user_profiles (id, email, full_name, role)
-- VALUES ('your-user-id', 'admin@npds.com', 'Admin User', 'admin');

-- Create a test athletic director
-- INSERT INTO user_profiles (id, email, full_name, role, school_id, school_name)
-- VALUES ('ad-user-id', 'ad@msd.edu', 'John Smith', 'athletic_director', 'msd', 'Maryland School for the Deaf');

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Create your admin account in Supabase Auth
-- 3. Insert your user profile manually
-- 4. Test the athletic director portal
