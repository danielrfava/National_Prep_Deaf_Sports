import { supabase } from "../supabaseClient.js";

export async function formatForSupabase(parsedData, metadata) {
  console.log("🔄 Converting to Supabase JSON format...");

  const parsedSport = parsedData?.game?.sport || metadata?.sport || "basketball";
  const parsedGender = parsedData?.game?.gender ?? metadata?.gender ?? null;

  const homeSchoolId = await getSchoolId(parsedData?.game?.homeTeam);
  const awaySchoolId = await getSchoolId(parsedData?.game?.awayTeam);

  const supabaseJSON = {
    game_date: formatDate(parsedData?.game?.date),
    sport: normalizeSport(parsedSport),
    gender: parsedGender,

    home_team_id: homeSchoolId,
    away_team_id: awaySchoolId,
    home_score: parsedData?.game?.homeScore ?? null,
    away_score: parsedData?.game?.awayScore ?? null,
    location: parsedData?.game?.location || null,

    game_data: {
      version: parsedData?.submission_scope ? "2.0" : "1.0",
      parsed_at: new Date().toISOString(),
      source: metadata?.source || "unknown",
      submission_scope: parsedData?.submission_scope || "game_submission",

      game: {
        date: formatDate(parsedData?.game?.date),
        sport: normalizeSport(parsedSport),
        gender: parsedGender,
        location: parsedData?.game?.location || null,
        home_team: {
          id: homeSchoolId,
          name: parsedData?.game?.homeTeam || null,
          score: parsedData?.game?.homeScore ?? null,
        },
        away_team: {
          id: awaySchoolId,
          name: parsedData?.game?.awayTeam || null,
          score: parsedData?.game?.awayScore ?? null,
        },
      },

      players: formatPlayers(parsedData?.players || [], homeSchoolId, awaySchoolId, metadata),

      parse_review: parsedData?.parse_review || null,
      warnings: parsedData?.warnings || [],
    },

    submission_method: metadata?.submissionMethod || "csv_upload",
    original_data: metadata?.originalData || null,
    submitted_by: metadata?.userId,
    submitter_school_id: metadata?.schoolId,
  };

  return supabaseJSON;
}

function formatPlayers(players, homeSchoolId, awaySchoolId, metadata = {}) {
  return (players || []).map((player) => {
    const inferredSchoolId =
      player.school_id ||
      getSchoolIdFromName(player.team) ||
      metadata.defaultSchoolId ||
      homeSchoolId ||
      awaySchoolId ||
      null;

    return {
      name: player.name,
      school_id: inferredSchoolId,
      school_name: player.team || metadata.defaultSchoolName || null,
      stats: player.stats || {},
      meta: player.meta || null,
    };
  });
}

async function getSchoolId(schoolName) {
  if (!schoolName) return null;

  try {
    const { data, error } = await supabase
      .from("schools")
      .select("id, short_name, full_name")
      .or(`full_name.ilike.%${schoolName}%,short_name.ilike.%${schoolName}%`)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

function getSchoolIdFromName(schoolName) {
  if (!schoolName) return null;

  const schoolMap = {
    msd: "msd",
    maryland: "msd",
    mssd: "mssd",
    model: "mssd",
    isd: "isd",
    indiana: "isd",
    tsd: "tsd",
    texas: "tsd",
    csdf: "csd-fremont",
    csdr: "csd-riverside",
    "california fremont": "csd-fremont",
    "california riverside": "csd-riverside",
    nsd: "nsd",
    nation: "nsd",
  };

  const normalized = String(schoolName).toLowerCase().trim();

  for (const [key, id] of Object.entries(schoolMap)) {
    if (normalized.includes(key)) return id;
  }

  return null;
}

function normalizeSport(sport) {
  if (!sport) return "basketball";

  const sportMap = {
    basketball: "basketball",
    bball: "basketball",
    volleyball: "volleyball",
    football: "football",
    soccer: "soccer",
    baseball: "baseball",
    softball: "softball",
  };

  const normalized = String(sport).toLowerCase().trim();
  return sportMap[normalized] || normalized;
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().split("T")[0];
    }
    return date.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export async function submitToSupabase(formattedData) {
  try {
    const { data, error } = await supabase
      .from("game_submissions")
      .insert(formattedData)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      submissionId: data.id,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}