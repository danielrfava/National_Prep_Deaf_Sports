import { supabase } from "../supabaseClient.js";
import { calculateRenderedRecordSummary } from "../components/renderRecords.js";
import { normalizeRecordSportContext, resolveSportContext } from "../sportContext.js";

const RAW_SELECT_BASE = "id, school_id, school, sport, season, stat_row";
const RAW_SELECT_EXTENDED = `${RAW_SELECT_BASE}, source_url, history_url`;
const PAGE_SIZE = 1000;

const ATHLETE_NAME_KEYS = [
  "Athlete Name",
  "athlete_name",
  "Player Name",
  "player_name",
  "Player",
  "player",
  "Name",
  "name",
];

const META_ROW_KEYS = new Set([
  "athlete name",
  "athlete_name",
  "player name",
  "player_name",
  "player",
  "name",
  "school",
  "school_id",
  "season",
  "gender",
  "sport",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeToken(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAthleteName(statRow) {
  if (!statRow || typeof statRow !== "object" || Array.isArray(statRow)) {
    return "";
  }

  for (const key of ATHLETE_NAME_KEYS) {
    const value = cleanText(statRow[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeAthleteName(value) {
  return normalizeToken(value.replace(/\((fr|so|jr|sr)\)/gi, ""));
}

function getNumericStatEntries(statRow) {
  if (!statRow || typeof statRow !== "object" || Array.isArray(statRow)) {
    return [];
  }

  return Object.entries(statRow)
    .map(([key, value]) => {
      const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
      return {
        key,
        numeric,
      };
    })
    .filter((entry) => Number.isFinite(entry.numeric) && !META_ROW_KEYS.has(normalizeToken(entry.key)));
}

function hasOnlyZeroStats(statRow) {
  const entries = getNumericStatEntries(statRow);
  return entries.length > 0 && entries.every((entry) => entry.numeric === 0);
}

function isMalformedStatRow(statRow) {
  if (!statRow || typeof statRow !== "object" || Array.isArray(statRow)) {
    return true;
  }

  const keys = Object.keys(statRow);
  if (!keys.length) {
    return true;
  }

  const athleteName = extractAthleteName(statRow);
  const numericEntries = getNumericStatEntries(statRow);
  return !athleteName && numericEntries.length === 0;
}

function buildStatFingerprint(statRow) {
  if (!statRow || typeof statRow !== "object" || Array.isArray(statRow)) {
    return "__invalid__";
  }

  return Object.entries(statRow)
    .filter(([key, value]) => {
      const normalizedKey = normalizeToken(key);
      if (META_ROW_KEYS.has(normalizedKey)) {
        return false;
      }

      return value !== null && value !== undefined && String(value).trim() !== "";
    })
    .map(([key, value]) => `${normalizeToken(key)}=${String(value).trim()}`)
    .sort()
    .join("|");
}

function buildSchoolLookupMap(schools) {
  const map = new Map();

  (schools || []).forEach((school) => {
    const id = cleanText(school?.id);
    if (!id) {
      return;
    }

    map.set(id, {
      fullName: cleanText(school?.full_name),
      shortName: cleanText(school?.short_name),
    });
  });

  return map;
}

function hasSchoolMismatch(row, schoolsById) {
  const schoolId = cleanText(row?.school_id);
  const schoolLabel = normalizeToken(row?.school);
  if (!schoolId || !schoolLabel || !schoolsById.has(schoolId)) {
    return false;
  }

  const school = schoolsById.get(schoolId);
  const candidates = [
    schoolId,
    normalizeToken(school.fullName),
    normalizeToken(school.shortName),
  ].filter(Boolean);

  return !candidates.some((candidate) => schoolLabel === candidate || schoolLabel.includes(candidate));
}

function isCanonicalBasketballLabel(value) {
  const normalized = normalizeToken(value);
  return normalized === "boys basketball" || normalized === "girls basketball";
}

async function fetchPagedRows(selectColumns) {
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select(selectColumns)
      .ilike("sport", "%basketball%")
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;
  }

  return { data: rows, error: null };
}

async function fetchBasketballRawRows() {
  const extended = await fetchPagedRows(RAW_SELECT_EXTENDED);
  if (!extended.error) {
    return extended.data || [];
  }

  const message = `${extended.error?.message || ""} ${extended.error?.details || ""}`.toLowerCase();
  if (!message.includes("source_url") && !message.includes("history_url")) {
    throw extended.error;
  }

  const fallback = await fetchPagedRows(RAW_SELECT_BASE);
  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data || []).map((row) => ({
    ...row,
    history_url: null,
    source_url: null,
  }));
}

async function fetchSchools() {
  const { data, error } = await supabase
    .from("schools")
    .select("id, full_name, short_name");

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchBasketballGames() {
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from("games")
      .select("id, sport, gender")
      .eq("sport", "basketball")
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;
  }

  return rows;
}

async function countPlayerStatsForGameIds(gameIds) {
  if (!gameIds.length) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < gameIds.length; index += 250) {
    const chunk = gameIds.slice(index, index + 250);
    const { count, error } = await supabase
      .from("player_stats")
      .select("id", { count: "exact", head: true })
      .in("game_id", chunk);

    if (error) {
      throw error;
    }

    total += Number(count || 0);
  }

  return total;
}

function buildGenderBreakdown(rows) {
  return {
    boys: rows.filter((row) => row.gender === "boys").length,
    girls: rows.filter((row) => row.gender === "girls").length,
    unknown: rows.filter((row) => !row.gender).length,
  };
}

export async function runBasketballAudit() {
  const [rawRows, schools, games] = await Promise.all([
    fetchBasketballRawRows(),
    fetchSchools(),
    fetchBasketballGames(),
  ]);

  const normalizedRawRows = rawRows
    .map((row) => {
      const context = resolveSportContext(row?.sport, row?.gender);
      return {
        ...normalizeRecordSportContext(row),
        _context: context,
        _rawSport: cleanText(row?.sport),
      };
    });

  const varsityRows = normalizedRawRows.filter((row) => row._context.isBasketball && row._context.isVarsity);
  const subVarsityRows = normalizedRawRows.filter(
    (row) => row._context.isBasketball && (row._context.isJuniorVarsity || row._context.isSubVarsity)
  );
  const schoolsById = buildSchoolLookupMap(schools);

  const duplicateGroups = new Map();
  const repeatedImportGroups = new Map();
  const driftCounts = new Map();

  let blankAthleteNames = 0;
  let zeroOnlyRows = 0;
  let malformedRows = 0;
  let schoolMismatches = 0;

  varsityRows.forEach((row) => {
    const athleteName = normalizeAthleteName(extractAthleteName(row.stat_row));
    const schoolKey = cleanText(row.school_id) || normalizeToken(row.school);
    const seasonKey = cleanText(row.season) || "unknown";
    const genderKey = cleanText(row.gender) || "unknown";
    const compositeKey = [athleteName || "__blank__", schoolKey || "__school__", genderKey, seasonKey].join("|");
    const fingerprintKey = [compositeKey, buildStatFingerprint(row.stat_row)].join("|");

    duplicateGroups.set(compositeKey, (duplicateGroups.get(compositeKey) || 0) + 1);
    repeatedImportGroups.set(fingerprintKey, (repeatedImportGroups.get(fingerprintKey) || 0) + 1);

    if (!athleteName) {
      blankAthleteNames += 1;
    }

    if (hasOnlyZeroStats(row.stat_row)) {
      zeroOnlyRows += 1;
    }

    if (isMalformedStatRow(row.stat_row)) {
      malformedRows += 1;
    }

    if (hasSchoolMismatch(row, schoolsById)) {
      schoolMismatches += 1;
    }

    if (!isCanonicalBasketballLabel(row._rawSport)) {
      driftCounts.set(row._rawSport || "(blank)", (driftCounts.get(row._rawSport || "(blank)") || 0) + 1);
    }
  });

  const duplicateAthleteSeasonRows = Array.from(duplicateGroups.values()).filter((count) => count > 1).length;
  const repeatedImportRows = Array.from(repeatedImportGroups.values()).filter((count) => count > 1).length;
  const sportDriftRows = Array.from(driftCounts.values()).reduce((sum, count) => sum + count, 0);

  const varsityGames = games
    .map((game) => normalizeRecordSportContext(game))
    .filter((game) => resolveSportContext(game.sport, game.gender).isBasketball);

  const boysGameIds = varsityGames.filter((game) => game.gender === "boys").map((game) => game.id);
  const girlsGameIds = varsityGames.filter((game) => game.gender === "girls").map((game) => game.id);

  const [boysPlayerStatsCount, girlsPlayerStatsCount] = await Promise.all([
    countPlayerStatsForGameIds(boysGameIds),
    countPlayerStatsForGameIds(girlsGameIds),
  ]);

  const boysRendered = calculateRenderedRecordSummary(
    varsityRows.filter((row) => row.gender === "boys"),
    { statsView: "season" }
  );
  const girlsRendered = calculateRenderedRecordSummary(
    varsityRows.filter((row) => row.gender === "girls"),
    { statsView: "season" }
  );
  const totalRendered = calculateRenderedRecordSummary(varsityRows, { statsView: "season" });

  return {
    counts: {
      raw: {
        total: varsityRows.length,
        ...buildGenderBreakdown(varsityRows),
      },
      normalized: {
        games: varsityGames.length,
        playerStatsTotal: boysPlayerStatsCount + girlsPlayerStatsCount,
        boysPlayerStats: boysPlayerStatsCount,
        girlsPlayerStats: girlsPlayerStatsCount,
      },
      publicRendered: {
        total: totalRendered.renderedCount,
        boys: boysRendered.renderedCount,
        girls: girlsRendered.renderedCount,
      },
    },
    issues: {
      blankAthleteNames,
      duplicateAthleteSeasonRows,
      malformedRows,
      repeatedImportRows,
      schoolMismatches,
      sportDriftRows,
      subVarsityRows: subVarsityRows.length,
      zeroOnlyRows,
    },
    driftExamples: Array.from(driftCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count })),
  };
}
