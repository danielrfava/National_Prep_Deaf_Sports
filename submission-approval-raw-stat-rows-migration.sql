-- ============================================
-- NPDS APPROVAL PIPELINE UPGRADE
-- ============================================
-- Run this in Supabase SQL Editor.
--
-- Purpose:
-- 1. Keep the existing approval RPC name: approve_game_submission(...)
-- 2. Write approved player rows into raw_stat_rows for public research pages
-- 3. Only create a games row when a real scored matchup exists
-- 4. Avoid NOT NULL failures for season-sheet style submissions

create or replace function public.approve_game_submission(submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.game_submissions%rowtype;
  submission_json jsonb;
  game_payload jsonb;
  parse_review jsonb;
  player_record jsonb;
  raw_row jsonb;
  season_value text;
  school_name_value text;
  school_id_value text;
  home_team_name text;
  away_team_name text;
  sport_variant_value text;
  new_game_id uuid;
  home_score integer;
  away_score integer;
  has_game_score boolean;
  has_real_matchup boolean;
  has_games_sport_variant boolean;
  has_raw_school_id boolean;
  has_raw_source_url boolean;
  has_raw_history_url boolean;
  has_raw_sport_variant boolean;
  insert_columns text[];
  insert_values text[];
  insert_sql text;
begin
  select *
  into submission_record
  from public.game_submissions
  where id = submission_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  if submission_record.status = 'approved' then
    return;
  end if;

  submission_json := to_jsonb(submission_record);
  game_payload := coalesce(submission_record.game_data -> 'game', '{}'::jsonb);
  parse_review := coalesce(submission_record.game_data -> 'parse_review', '{}'::jsonb);

  home_team_name := coalesce(
    nullif(game_payload -> 'home_team' ->> 'name', ''),
    (select s.full_name from public.schools s where s.id = submission_record.home_team_id),
    nullif(submission_record.home_team_id, '')
  );

  away_team_name := coalesce(
    nullif(game_payload -> 'away_team' ->> 'name', ''),
    (select s.full_name from public.schools s where s.id = submission_record.away_team_id),
    nullif(submission_record.away_team_id, '')
  );

  if coalesce(game_payload -> 'home_team' ->> 'score', submission_json ->> 'home_score', '') ~ '^-?[0-9]+$' then
    home_score := coalesce(game_payload -> 'home_team' ->> 'score', submission_json ->> 'home_score')::integer;
  else
    home_score := null;
  end if;

  if coalesce(game_payload -> 'away_team' ->> 'score', submission_json ->> 'away_score', '') ~ '^-?[0-9]+$' then
    away_score := coalesce(game_payload -> 'away_team' ->> 'score', submission_json ->> 'away_score')::integer;
  else
    away_score := null;
  end if;

  has_game_score := home_score is not null and away_score is not null;
  has_real_matchup :=
    coalesce(home_team_name, '') <> ''
    and coalesce(away_team_name, '') <> ''
    and lower(home_team_name) not in ('home', 'away', 'unknown', 'n/a')
    and lower(away_team_name) not in ('home', 'away', 'unknown', 'n/a');

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'sport_variant'
  )
  into has_games_sport_variant;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_stat_rows'
      and column_name = 'school_id'
  )
  into has_raw_school_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_stat_rows'
      and column_name = 'source_url'
  )
  into has_raw_source_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_stat_rows'
      and column_name = 'history_url'
  )
  into has_raw_history_url;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_stat_rows'
      and column_name = 'sport_variant'
  )
  into has_raw_sport_variant;

  sport_variant_value := coalesce(
    nullif(submission_json ->> 'sport_variant', ''),
    nullif(submission_record.game_data ->> 'football_format', ''),
    nullif(game_payload ->> 'football_format', ''),
    nullif(parse_review ->> 'football_format', '')
  );

  if has_real_matchup and has_game_score then
    if has_games_sport_variant then
      insert into public.games (
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
      values (
        submission_record.id,
        coalesce(submission_record.game_date, current_date),
        submission_record.sport,
        submission_record.gender,
        sport_variant_value,
        submission_record.home_team_id,
        home_team_name,
        submission_record.away_team_id,
        away_team_name,
        home_score,
        away_score,
        coalesce(submission_record.location, nullif(game_payload ->> 'location', ''))
      )
      returning id into new_game_id;
    else
      insert into public.games (
        submission_id,
        game_date,
        sport,
        gender,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name,
        home_score,
        away_score,
        location
      )
      values (
        submission_record.id,
        coalesce(submission_record.game_date, current_date),
        submission_record.sport,
        submission_record.gender,
        submission_record.home_team_id,
        home_team_name,
        submission_record.away_team_id,
        away_team_name,
        home_score,
        away_score,
        coalesce(submission_record.location, nullif(game_payload ->> 'location', ''))
      )
      returning id into new_game_id;
    end if;
  end if;

  for player_record in
    select value
    from jsonb_array_elements(coalesce(submission_record.game_data -> 'players', '[]'::jsonb))
  loop
    season_value := coalesce(
      nullif(player_record -> 'meta' ->> 'season', ''),
      nullif(parse_review -> 'detected_seasons' ->> 0, ''),
      nullif(submission_record.game_date::text, ''),
      'Unknown'
    );

    school_name_value := coalesce(
      nullif(player_record ->> 'school_name', ''),
      nullif(player_record ->> 'team', ''),
      home_team_name,
      away_team_name,
      nullif(submission_record.submitter_school_id, ''),
      'Unknown'
    );

    school_id_value := coalesce(
      nullif(player_record ->> 'school_id', ''),
      nullif(submission_record.submitter_school_id, '')
    );

    raw_row := coalesce(player_record -> 'stats', '{}'::jsonb)
      || jsonb_build_object('Athlete Name', coalesce(nullif(player_record ->> 'name', ''), 'Unknown'));

    if season_value is not null and season_value <> '' then
      raw_row := raw_row || jsonb_build_object('Season', season_value);
    end if;

    if school_name_value is not null and school_name_value <> '' then
      raw_row := raw_row || jsonb_build_object('School', school_name_value);
    end if;

    if sport_variant_value is not null and sport_variant_value <> '' then
      raw_row := raw_row || jsonb_build_object('Football Format', sport_variant_value);
    end if;

    insert_columns := array['school', 'sport', 'season', 'stat_row'];
    insert_values := array[
      format('%L', school_name_value),
      format('%L', coalesce(submission_record.sport, game_payload ->> 'sport', 'unknown')),
      format('%L', season_value),
      format('%L::jsonb', raw_row::text)
    ];

    if has_raw_school_id then
      insert_columns := array_append(insert_columns, 'school_id');
      insert_values := array_append(insert_values, format('%L', school_id_value));
    end if;

    if has_raw_source_url then
      insert_columns := array_append(insert_columns, 'source_url');
      insert_values := array_append(insert_values, format('%L', coalesce(submission_record.original_data, submission_record.id::text)));
    end if;

    if has_raw_history_url then
      insert_columns := array_append(insert_columns, 'history_url');
      insert_values := array_append(insert_values, 'null');
    end if;

    if has_raw_sport_variant then
      insert_columns := array_append(insert_columns, 'sport_variant');
      insert_values := array_append(insert_values, format('%L', sport_variant_value));
    end if;

    insert_sql := format(
      'insert into public.raw_stat_rows (%s) values (%s)',
      array_to_string(insert_columns, ', '),
      array_to_string(insert_values, ', ')
    );

    execute insert_sql;

    if new_game_id is not null then
      insert into public.player_stats (
        game_id,
        player_name,
        school_id,
        school_name,
        stats,
        points,
        rebounds,
        assists
      )
      values (
        new_game_id,
        coalesce(nullif(player_record ->> 'name', ''), 'Unknown'),
        school_id_value,
        school_name_value,
        coalesce(player_record -> 'stats', '{}'::jsonb),
        case
          when coalesce(player_record -> 'stats' ->> 'PTS', player_record -> 'stats' ->> 'points', '') ~ '^-?[0-9]+$'
            then coalesce(player_record -> 'stats' ->> 'PTS', player_record -> 'stats' ->> 'points')::integer
          else null
        end,
        case
          when coalesce(player_record -> 'stats' ->> 'REB', player_record -> 'stats' ->> 'rebounds', '') ~ '^-?[0-9]+$'
            then coalesce(player_record -> 'stats' ->> 'REB', player_record -> 'stats' ->> 'rebounds')::integer
          else null
        end,
        case
          when coalesce(player_record -> 'stats' ->> 'AST', player_record -> 'stats' ->> 'assists', '') ~ '^-?[0-9]+$'
            then coalesce(player_record -> 'stats' ->> 'AST', player_record -> 'stats' ->> 'assists')::integer
          else null
        end
      );
    end if;
  end loop;

  update public.game_submissions
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = submission_id;
end;
$$;
