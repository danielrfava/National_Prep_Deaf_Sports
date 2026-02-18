-- ============================================
-- MIGRATION: Add sport_variant field
-- ============================================
-- Run this in your Supabase SQL Editor to add support for 8-man vs 11-man football

-- Add sport_variant to game_submissions table
ALTER TABLE public.game_submissions 
ADD COLUMN IF NOT EXISTS sport_variant text;

-- Add comment to document the field
COMMENT ON COLUMN public.game_submissions.sport_variant IS 'For football: 8-man or 11-man; For other sports: NULL';

-- Add sport_variant to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS sport_variant text;

-- Add comment to document the field
COMMENT ON COLUMN public.games.sport_variant IS 'For football: 8-man or 11-man; For other sports: NULL';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_game_submissions_sport_variant ON public.game_submissions(sport_variant) WHERE sport_variant IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_sport_variant ON public.games(sport_variant) WHERE sport_variant IS NOT NULL;

-- Update the approve_game_submission function to include sport_variant
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
-- MIGRATION COMPLETE!
-- ============================================
-- The sport_variant field is now available in both tables
-- You can now track 8-man vs 11-man football games
