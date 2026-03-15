import { normalizeRecordSportContext, resolveSportContext } from "./sportContext.js";

const HISTORICAL_DATA_ORIGIN = "historical_season_summary";
const DIAMOND_SPORTS = new Set(["baseball", "softball"]);
const FAMILY_ORDER = Object.freeze([
  "pitching_summary",
  "pitching_against",
  "pitching_misc",
  "fielding",
  "baserunning",
  "batting_advanced",
  "batting_core",
  "unknown",
]);
const ATHLETE_NAME_KEYS = [
  "Athlete Full Name",
  "athlete_full_name",
  "Full Name",
  "full_name",
  "Player Name",
  "player_name",
  "Player",
  "player",
  "Athlete",
  "athlete",
  "Athlete Name",
  "athlete_name",
  "Name",
  "name",
];
const CLASS_SUFFIX_PATTERN = /\s*\((fr|so|jr|sr)\)\s*$/i;
const DATE_SEASON_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}$/i,
];
const GAME_CONTEXT_KEYS = new Set(
  [
    "Date",
    "Game Date",
    "Opponent",
    "Opp",
    "Result",
    "Location",
    "Venue",
    "Site",
    "Home",
    "Away",
  ].map(normalizeHeaderToken)
);
const META_KEYS = new Set(
  [
    ...ATHLETE_NAME_KEYS,
    "School",
    "school",
    "School Name",
    "school_name",
    "Team",
    "team",
    "Season",
    "season",
    "Year",
    "year",
    "Grade",
    "grade",
    "Class",
    "class",
    "Rank",
    "rank",
    "#",
    "No",
    "Number",
    "number",
    "Position",
    "position",
    "Jersey",
    "jersey",
  ].map(normalizeHeaderToken)
);

const FAMILY_FIELD_DEFINITIONS = buildFamilyFieldDefinitions({
  batting_core: [
    createField("games_played", ["GP"], ["GP", "Games Played", "Games"]),
    createField("games_started", ["GS"], ["GS", "Games Started"]),
    createField("plate_appearances", ["PA"], ["PA", "Plate Appearances"]),
    createField("at_bats", ["AB"], ["AB", "At Bats"]),
    createField("hits", ["H"], ["H", "Hits"]),
    createField("batting_average", ["AVG"], ["AVG", "Avg", "Average", "Batting Average", "BA"]),
    createField("runs", ["R"], ["R", "Runs"]),
    createField("rbi", ["RBI"], ["RBI", "Runs Batted In"]),
    createField("doubles", ["2B"], ["2B", "Doubles"]),
    createField("triples", ["3B"], ["3B", "Triples"]),
    createField("home_runs", ["HR"], ["HR", "Home Runs"]),
  ],
  batting_advanced: [
    createField("walks", ["BB"], ["BB", "Walks"]),
    createField("hit_by_pitch", ["HBP"], ["HBP", "Hit By Pitch", "Hit Batsman"]),
    createField("strikeouts_batting", ["SO", "K"], ["K", "SO", "Strikeouts"]),
    createField("left_on_base", ["LOB"], ["LOB", "Left On Base"]),
    createField("on_base_percentage", ["OBP"], ["OBP", "On Base Percentage"]),
    createField("ops", ["OPS"], ["OPS"]),
    createField("reached_on_error", ["ROE"], ["ROE", "Reached On Error"]),
    createField("fielders_choice", ["FC"], ["FC", "Fielders Choice"]),
    createField("sac_flies", ["SF"], ["SF", "Sacrifice Flies", "Sac Flies"]),
    createField("sac_hits_bunts", ["SH/B"], ["SH/B", "SH", "Sac Hits", "Sacrifice Hits", "Sac Bunts", "Sacrifice Bunts"]),
    createField("slugging_percentage", ["SLG"], ["SLG", "Slugging", "Slugging Percentage"]),
  ],
  baserunning: [
    createField("stolen_bases", ["SB"], ["SB", "Stolen Bases"]),
    createField("stolen_base_attempts", ["SBA"], ["SBA", "Stolen Base Attempts"]),
  ],
  fielding: [
    createField("putouts", ["PO"], ["PO", "Putouts"]),
    createField("assists", ["A"], ["A", "Assists"]),
    createField("errors", ["E"], ["E", "Errors"]),
    createField("total_chances", ["TC"], ["TC", "Total Chances"]),
    createField("fielding_percentage", ["FP"], ["FP", "Fielding Percentage", "Fielding Pct"]),
    createField("double_plays", ["DP"], ["DP", "Double Plays"]),
    createField("passed_balls", ["PB"], ["PB", "Passed Balls"]),
    createField("caught_stealing", ["CS"], ["CS", "Caught Stealing"]),
    createField("stolen_bases_allowed", ["SB_ALLOWED"], ["SB", "Stolen Bases Allowed"]),
    createField("stolen_base_attempts_allowed", ["SBA_ALLOWED"], ["SBA", "Stolen Base Attempts Allowed"]),
  ],
  pitching_summary: [
    createField("appearances", ["APP"], ["APP", "Appearances"]),
    createField("games_started", ["GS_PITCH"], ["GS", "Games Started"]),
    createField("wins", ["W"], ["W", "Wins"]),
    createField("losses", ["L"], ["L", "Losses"]),
    createField("saves", ["SV"], ["SV", "Saves"]),
    createField("earned_run_average", ["ERA"], ["ERA", "Earned Run Average"]),
    createField("complete_games", ["CG"], ["CG", "Complete Games"]),
    createField("win_percentage", ["WPCT"], ["W%", "Win %", "Winning Percentage", "W PCT"]),
  ],
  pitching_against: [
    createField("batters_faced", ["BF"], ["BF", "Batters Faced"]),
    createField("innings_pitched", ["IP"], ["IP", "Innings Pitched"]),
    createField("earned_runs_allowed", ["ER"], ["ER", "Earned Runs"]),
    createField("runs_allowed", ["RA"], ["R", "Runs"]),
    createField("hits_allowed", ["HA"], ["H", "Hits"]),
    createField("at_bats_against", ["ABA"], ["AB", "At Bats"]),
    createField("walks_allowed", ["BBA"], ["BB", "Walks"]),
    createField("strikeouts_pitched", ["SOP", "KP"], ["K", "SO", "Strikeouts"]),
    createField("home_runs_allowed", ["HRA"], ["HR", "Home Runs"]),
    createField("doubles_allowed", ["2BA"], ["2B", "Doubles"]),
    createField("triples_allowed", ["3BA"], ["3B", "Triples"]),
  ],
  pitching_misc: [
    createField("opponent_batting_average", ["OBA"], ["OBA", "Opponent Batting Average"]),
    createField("opponent_on_base_percentage", ["OPP_OBP"], ["OBP", "Opponent OBP", "Opponent On Base Percentage"]),
    createField("hit_batters", ["HBP_ALLOWED"], ["HBP", "Hit By Pitch", "Hit Batsman"]),
    createField("wild_pitches", ["WP"], ["WP", "Wild Pitches"]),
    createField("balks", ["BK"], ["BK", "Balks"]),
    createField("stolen_bases_allowed_misc", ["SB_ALLOWED_MISC"], ["SB", "Stolen Bases Allowed"]),
    createField("pickoffs", ["PO_PICKOFFS"], ["PO", "Pickoffs"]),
    createField("pitch_count", ["PITCH_COUNT"], ["#P", "Pitches", "Pitch Count"]),
  ],
});

function createField(publicKey, legacyKeys, aliases) {
  return {
    aliases: aliases || [],
    legacyKeys: legacyKeys || [],
    publicKey,
  };
}

function buildFamilyFieldDefinitions(definitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([family, fields]) => [
      family,
      fields.map((field) => ({
        ...field,
        normalizedAliases: uniqueTokens([...(field.aliases || []), ...(field.legacyKeys || [])]),
      })),
    ])
  );
}

function normalizeHeaderToken(value) {
  return String(value || "")
    .trim()
    .replace(/#/g, " number ")
    .replace(/%/g, " pct ")
    .replace(/\//g, " per ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeIdentityToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTokens(values) {
  return Array.from(new Set((values || []).map(normalizeHeaderToken).filter(Boolean)));
}

function cleanAthleteName(value) {
  return normalizeText(value).replace(CLASS_SUFFIX_PATTERN, "").trim();
}

function firstPresentValue(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function extractAthleteName(statRow) {
  return cleanAthleteName(firstPresentValue(statRow, ATHLETE_NAME_KEYS));
}

function normalizeStatValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim().replace(/,/g, "");
  if (!text) {
    return "";
  }

  const numeric = Number(text);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  const decimal = Number(text.replace(/^\./, "0."));
  if (!Number.isNaN(decimal)) {
    return decimal;
  }

  return String(value).trim();
}

function parseNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const normalized = normalizeStatValue(value);
  return typeof normalized === "number" ? normalized : Number.NaN;
}

function hasMeaningfulValue(value) {
  return !["", null, undefined].includes(value);
}

function getNonEmptyEntries(statRow) {
  if (!statRow || typeof statRow !== "object" || Array.isArray(statRow)) {
    return [];
  }

  return Object.entries(statRow).filter(([, value]) => hasMeaningfulValue(normalizeText(value)));
}

function buildKeySet(statRow) {
  return new Set(getNonEmptyEntries(statRow).map(([key]) => normalizeHeaderToken(key)));
}

function hasAnyKey(keySet, keys) {
  return (keys || []).some((key) => keySet.has(normalizeHeaderToken(key)));
}

function countKeys(keySet, keys) {
  return (keys || []).filter((key) => keySet.has(normalizeHeaderToken(key))).length;
}

function getHeaderValue(statRow, normalizedAliases) {
  if (!statRow || typeof statRow !== "object") {
    return "";
  }

  for (const [key, value] of Object.entries(statRow)) {
    if (!hasMeaningfulValue(normalizeText(value))) {
      continue;
    }

    if (normalizedAliases.includes(normalizeHeaderToken(key))) {
      return value;
    }
  }

  return "";
}

function normalizeUnknownPayload(statRow) {
  const payload = {};

  Object.entries(statRow || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeHeaderToken(key);
    if (!normalizedKey || META_KEYS.has(normalizedKey)) {
      return;
    }

    const normalizedValue = normalizeStatValue(value);
    if (!hasMeaningfulValue(normalizedValue)) {
      return;
    }

    payload[normalizedKey] = normalizedValue;
  });

  return payload;
}

function isLikelyDateSeason(value) {
  const text = normalizeText(value);
  return DATE_SEASON_PATTERNS.some((pattern) => pattern.test(text));
}

function hasGameContext(statRow) {
  return Array.from(buildKeySet(statRow)).some((key) => GAME_CONTEXT_KEYS.has(key));
}

function isPassThroughDiamondRow(row) {
  const statRow = row?.stat_row && typeof row.stat_row === "object" ? row.stat_row : {};

  if (row?.submission_scope && !["season_sheet", "", null, undefined].includes(row.submission_scope)) {
    return true;
  }

  if (isLikelyDateSeason(row?.season)) {
    return true;
  }

  if (hasGameContext(statRow)) {
    return true;
  }

  return false;
}

function classifyDiamondRow(statRow) {
  const keySet = buildKeySet(statRow);

  if (isPitchingSummaryRow(keySet)) return "pitching_summary";
  if (isPitchingAgainstRow(keySet)) return "pitching_against";
  if (isPitchingMiscRow(keySet)) return "pitching_misc";
  if (isFieldingRow(keySet)) return "fielding";
  if (isBaserunningRow(keySet)) return "baserunning";
  if (isBattingAdvancedRow(keySet)) return "batting_advanced";
  if (isBattingCoreRow(keySet)) return "batting_core";

  return "unknown";
}

function isPitchingSummaryRow(keySet) {
  return (
    hasAnyKey(keySet, ["APP"]) ||
    (countKeys(keySet, ["ERA", "W", "L", "SV", "CG", "W%", "Win %"]) >= 2 &&
      !hasAnyKey(keySet, ["BF", "IP", "ER"]))
  );
}

function isPitchingAgainstRow(keySet) {
  return (
    hasAnyKey(keySet, ["BF", "IP", "ER"]) &&
    countKeys(keySet, ["BF", "IP", "ER", "AB", "H", "BB", "K", "SO", "R", "HR", "2B", "3B"]) >= 3
  );
}

function isPitchingMiscRow(keySet) {
  return (
    hasAnyKey(keySet, ["#P", "Pitch Count", "OBA", "WP", "BK"]) ||
    (hasAnyKey(keySet, ["PO", "Pickoffs"]) && hasAnyKey(keySet, ["HBP", "OBP", "SB"]))
  );
}

function isFieldingRow(keySet) {
  return (
    hasAnyKey(keySet, ["PO", "A", "E", "TC", "FP", "DP", "PB", "CS"]) &&
    countKeys(keySet, ["PO", "A", "E", "TC", "FP", "DP", "PB", "CS", "SB", "SBA"]) >= 2
  );
}

function isBaserunningRow(keySet) {
  return hasAnyKey(keySet, ["SB"]) && !hasAnyKey(keySet, ["PO", "A", "E", "TC", "FP", "WP", "BK", "#P"]);
}

function isBattingAdvancedRow(keySet) {
  const advancedCount = countKeys(
    keySet,
    ["BB", "HBP", "K", "SO", "LOB", "OBP", "OPS", "ROE", "FC", "SF", "SH/B", "SH", "SLG"]
  );

  return advancedCount >= 2 || (hasAnyKey(keySet, ["OBP", "OPS", "SLG"]) && advancedCount >= 1);
}

function isBattingCoreRow(keySet) {
  return (
    countKeys(keySet, ["AB", "H", "PA", "AVG", "2B", "3B", "HR", "R", "RBI", "GP", "GS"]) >= 2 &&
    hasAnyKey(keySet, ["AB", "H", "PA", "AVG", "RBI", "HR"])
  );
}

function normalizeFamilyPayload(statRow, family) {
  if (family === "unknown") {
    return {
      invalidFields: [],
      payload: normalizeUnknownPayload(statRow),
    };
  }

  const definitions = FAMILY_FIELD_DEFINITIONS[family] || [];
  const payload = {};
  const invalidFields = [];

  definitions.forEach((definition) => {
    const rawValue = getHeaderValue(statRow, definition.normalizedAliases);
    const normalizedValue = normalizeStatValue(rawValue);

    if (!hasMeaningfulValue(normalizedValue)) {
      return;
    }

    if (typeof normalizedValue !== "number") {
      invalidFields.push(definition.publicKey);
      return;
    }

    payload[definition.publicKey] = normalizedValue;
  });

  return {
    invalidFields,
    payload,
  };
}

function buildPayloadSignature(payload) {
  return JSON.stringify(
    Object.entries(payload || {})
      .filter(([, value]) => hasMeaningfulValue(value))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function hasNegativeValue(payload) {
  return Object.values(payload || {}).some((value) => typeof value === "number" && value < 0);
}

function battingAverageMismatch(payload) {
  const atBats = payload.at_bats;
  const hits = payload.hits;
  const average = payload.batting_average;

  if (![atBats, hits, average].every((value) => typeof value === "number")) {
    return false;
  }

  if (atBats <= 0) {
    return false;
  }

  return Math.abs(average - hits / atBats) > 0.02;
}

function isZeroOnlyFamilyPayload(family, payload) {
  const values = Object.values(payload || {});
  const numericValues = values.filter((value) => typeof value === "number");
  if (!values.length) {
    return true;
  }

  if (family === "unknown") {
    return numericValues.length > 0 && numericValues.every((value) => value === 0);
  }

  if (!numericValues.length) {
    return true;
  }

  if (family === "pitching_summary") {
    return numericValues.every((value) => value === 0);
  }

  if (family === "pitching_against") {
    const innings = payload.innings_pitched;
    const inningsZero = typeof innings !== "number" || innings === 0;
    return inningsZero && numericValues.every((value) => value === 0);
  }

  return numericValues.every((value) => value === 0);
}

function validateFamilyPayload(family, payload, { athleteName = "", invalidFields = [] } = {}) {
  const flags = [];

  if (!athleteName) {
    flags.push("blank_athlete_name");
  }

  invalidFields.forEach((field) => {
    flags.push(`malformed_numeric:${family}:${field}`);
  });

  if (!Object.keys(payload || {}).length) {
    flags.push(`empty_family_payload:${family}`);
    return flags;
  }

  if (hasNegativeValue(payload)) {
    flags.push(`negative_values:${family}`);
  }

  if (family === "batting_core") {
    if (typeof payload.hits === "number" && typeof payload.at_bats === "number" && payload.hits > payload.at_bats) {
      flags.push("impossible_batting:hits_exceed_at_bats");
    }
    if (
      typeof payload.plate_appearances === "number" &&
      typeof payload.at_bats === "number" &&
      payload.plate_appearances < payload.at_bats
    ) {
      flags.push("impossible_batting:plate_appearances_below_at_bats");
    }
    if (battingAverageMismatch(payload)) {
      flags.push("impossible_batting:average_mismatch");
    }
  }

  if (family === "pitching_against") {
    if (
      typeof payload.hits_allowed === "number" &&
      typeof payload.at_bats_against === "number" &&
      payload.hits_allowed > payload.at_bats_against
    ) {
      flags.push("impossible_pitching:hits_allowed_exceed_at_bats_against");
    }
    if (
      typeof payload.batters_faced === "number" &&
      typeof payload.at_bats_against === "number" &&
      payload.batters_faced < payload.at_bats_against
    ) {
      flags.push("impossible_pitching:batters_faced_below_at_bats_against");
    }
    if (typeof payload.innings_pitched !== "number") {
      flags.push("impossible_pitching:innings_pitched_unparsable");
    }
    if (
      typeof payload.batters_faced === "number" &&
      typeof payload.hits_allowed === "number" &&
      payload.hits_allowed > payload.batters_faced
    ) {
      flags.push("impossible_pitching:hits_allowed_exceed_batters_faced");
    }
    if (
      typeof payload.runs_allowed === "number" &&
      typeof payload.earned_runs_allowed === "number" &&
      payload.earned_runs_allowed > payload.runs_allowed
    ) {
      flags.push("impossible_pitching:earned_runs_exceed_runs_allowed");
    }
  }

  return flags;
}

function isExcludedFromTotals(family, flags) {
  if (family === "unknown") {
    return true;
  }

  return (flags || []).some((flag) =>
    flag === "blank_athlete_name" ||
    flag.startsWith("malformed_numeric:") ||
    flag.startsWith("negative_values:") ||
    flag.startsWith("empty_family_payload:") ||
    flag.startsWith("impossible_batting:") ||
    flag.startsWith("impossible_pitching:")
  );
}

function valuesEquivalent(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    return parseNumericValue(left) === parseNumericValue(right);
  }

  return normalizeIdentityToken(left) === normalizeIdentityToken(right);
}

function mergeFamilyEntries(entries, family) {
  const definitions = FAMILY_FIELD_DEFINITIONS[family] || [];
  const definitionByKey = new Map(definitions.map((definition) => [definition.publicKey, definition]));
  const merged = {};
  const conflicts = [];
  const orderedEntries = [...entries].sort((left, right) => {
    if (right.payloadSize !== left.payloadSize) {
      return right.payloadSize - left.payloadSize;
    }

    return left.sourceIndex - right.sourceIndex;
  });

  orderedEntries.forEach((entry) => {
    Object.entries(entry.payload).forEach(([field, value]) => {
      if (!Object.prototype.hasOwnProperty.call(merged, field)) {
        merged[field] = value;
        return;
      }

      if (valuesEquivalent(merged[field], value)) {
        return;
      }

      const definition = definitionByKey.get(field);
      if (!conflicts.includes(`family_conflict:${family}:${field}`)) {
        conflicts.push(`family_conflict:${family}:${field}`);
      }

      if (definition?.publicKey === "batting_average" && typeof merged[field] === "number" && typeof value === "number") {
        merged[field] = Math.max(merged[field], value);
      }
    });
  });

  return {
    conflicts,
    merged,
  };
}

function safeDivide(numerator, denominator, digits = 3) {
  if (typeof numerator !== "number" || typeof denominator !== "number" || denominator <= 0) {
    return "";
  }

  return Number((numerator / denominator).toFixed(digits));
}

function deriveFamilyValues(families) {
  const batting = { ...(families.batting || {}) };
  const fielding = { ...(families.fielding || {}) };
  const pitchingSummary = { ...(families.pitching_summary || {}) };
  const pitchingAgainst = { ...(families.pitching_against || {}) };

  if (
    typeof batting.hits === "number" &&
    typeof batting.at_bats === "number" &&
    batting.at_bats > 0
  ) {
    batting.batting_average = safeDivide(batting.hits, batting.at_bats, 3);
  }

  if (
    typeof fielding.putouts === "number" &&
    typeof fielding.assists === "number" &&
    typeof fielding.total_chances === "number" &&
    fielding.total_chances > 0
  ) {
    fielding.fielding_percentage = safeDivide(
      fielding.putouts + fielding.assists,
      fielding.total_chances,
      3
    );
  }

  if (
    typeof pitchingSummary.wins === "number" &&
    typeof pitchingSummary.losses === "number" &&
    pitchingSummary.wins + pitchingSummary.losses > 0
  ) {
    pitchingSummary.win_percentage = safeDivide(
      pitchingSummary.wins,
      pitchingSummary.wins + pitchingSummary.losses,
      3
    );
  }

  const whip = safeDivide(
    (typeof pitchingAgainst.hits_allowed === "number" ? pitchingAgainst.hits_allowed : 0) +
      (typeof pitchingAgainst.walks_allowed === "number" ? pitchingAgainst.walks_allowed : 0),
    pitchingAgainst.innings_pitched,
    2
  );

  return {
    batting,
    fielding,
    pitchingAgainst,
    pitchingSummary: {
      ...pitchingSummary,
      whip,
    },
  };
}

function applyFields(statRow, values, definitions) {
  (definitions || []).forEach((definition) => {
    const value = values?.[definition.publicKey];
    if (!hasMeaningfulValue(value)) {
      return;
    }

    statRow[definition.publicKey] = value;
    (definition.legacyKeys || []).forEach((key) => {
      statRow[key] = value;
    });
  });
}

function buildDiamondStatRow(mergedRow) {
  const statRow = {
    "Athlete Name": mergedRow.athlete_name || "Unknown Athlete",
    School: mergedRow.school || "",
    Season: mergedRow.season || "",
  };

  const derivedFamilies = deriveFamilyValues({
    batting: mergedRow.batting,
    fielding: mergedRow.fielding,
    pitching_against: mergedRow.pitching_against,
    pitching_summary: mergedRow.pitching_summary,
  });

  applyFields(statRow, derivedFamilies.batting, FAMILY_FIELD_DEFINITIONS.batting_core);
  applyFields(statRow, mergedRow.batting_advanced, FAMILY_FIELD_DEFINITIONS.batting_advanced);
  applyFields(statRow, mergedRow.baserunning, FAMILY_FIELD_DEFINITIONS.baserunning);
  applyFields(statRow, derivedFamilies.fielding, FAMILY_FIELD_DEFINITIONS.fielding);
  applyFields(statRow, derivedFamilies.pitchingSummary, FAMILY_FIELD_DEFINITIONS.pitching_summary);
  applyFields(statRow, derivedFamilies.pitchingAgainst, FAMILY_FIELD_DEFINITIONS.pitching_against);
  applyFields(statRow, mergedRow.pitching_misc, FAMILY_FIELD_DEFINITIONS.pitching_misc);

  if (hasMeaningfulValue(derivedFamilies.pitchingSummary.whip)) {
    statRow.WHIP = derivedFamilies.pitchingSummary.whip;
    statRow.whip = derivedFamilies.pitchingSummary.whip;
  }

  return statRow;
}

function stripTemporaryFields(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  const { __sourceIndex, ...rest } = row;
  return rest;
}

function createBucketRow(entry) {
  return {
    anomaly_flags: [...entry.anomalyFlags],
    excluded_from_totals: entry.excludedFromTotals,
    family: entry.family,
    id: entry.row.id || null,
    normalized_payload: { ...entry.payload },
    source_index: entry.sourceIndex,
    stat_row: { ...(entry.row.stat_row || {}) },
  };
}

function createMergedDiamondRow(group, mergedFamilies, bucketMap, anomalyFlags) {
  const derivedFamilies = deriveFamilyValues({
    batting: mergedFamilies.batting_core?.merged || null,
    fielding: mergedFamilies.fielding?.merged || null,
    pitching_against: mergedFamilies.pitching_against?.merged || null,
    pitching_summary: mergedFamilies.pitching_summary?.merged || null,
  });
  const familyObjects = {
    batting: derivedFamilies.batting,
    batting_advanced: mergedFamilies.batting_advanced?.merged || null,
    baserunning: mergedFamilies.baserunning?.merged || null,
    fielding: derivedFamilies.fielding,
    pitching_summary: derivedFamilies.pitchingSummary,
    pitching_against: derivedFamilies.pitchingAgainst,
    pitching_misc: mergedFamilies.pitching_misc?.merged || null,
  };

  const baseRow = group.baseRow;
  const mergedRow = {
    ...baseRow,
    __sourceIndex: group.sourceIndex,
    anomaly_flags: anomalyFlags,
    athlete_name: group.displayName,
    baseball_softball_historical_normalized: true,
    batting: familyObjects.batting,
    batting_advanced: familyObjects.batting_advanced,
    baserunning: familyObjects.baserunning,
    data_origin: HISTORICAL_DATA_ORIGIN,
    diamond_category_buckets: bucketMap,
    fielding: familyObjects.fielding,
    pitching_against: familyObjects.pitching_against,
    pitching_misc: familyObjects.pitching_misc,
    pitching_summary: familyObjects.pitching_summary,
    school: group.school,
    school_id: group.school_id || baseRow.school_id || null,
    season: group.season,
    source_row_count: Object.values(bucketMap).reduce(
      (total, bucket) => total + Number((bucket || []).length),
      0
    ),
    sport: baseRow.sport,
    sport_display:
      baseRow.sport_display || resolveSportContext(baseRow.sport, baseRow.gender).competitionLabel,
    submission_scope: baseRow.submission_scope || "season_sheet",
  };

  mergedRow.stat_row = buildDiamondStatRow(mergedRow);
  return mergedRow;
}

function groupByDedupeKey(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const key = [
      entry.row.sport,
      normalizeText(entry.row.school_id || entry.row.school || "unknown-school").toLowerCase(),
      normalizeText(entry.row.season || "unknown-season").toLowerCase(),
      entry.athleteKey,
      entry.family,
      buildPayloadSignature(entry.payload),
    ].join("::");

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(entry);
  });

  return groups;
}

export function inspectBaseballSoftballHistoricalRows(rows = []) {
  const passthroughRows = [];
  const candidateRows = [];
  const stats = {
    blankAthleteNames: 0,
    impossibleBattingRows: 0,
    impossiblePitchingRows: 0,
    malformedRows: 0,
    mergedPlayerSeasons: {
      baseball: 0,
      softball: 0,
    },
    rawHistoricalRows: {
      baseball: 0,
      softball: 0,
    },
    unknownFamilyRows: 0,
    zeroOnlyRows: 0,
  };

  (Array.isArray(rows) ? rows : []).forEach((inputRow, sourceIndex) => {
    const row = normalizeRecordSportContext(inputRow);
    const context = resolveSportContext(row?.sport, row?.gender);

    if (!DIAMOND_SPORTS.has(context.sportKey) || row?.baseball_softball_historical_normalized) {
      passthroughRows.push({
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      });
      return;
    }

    if (isPassThroughDiamondRow(row)) {
      passthroughRows.push({
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      });
      return;
    }

    const statRow = row?.stat_row && typeof row.stat_row === "object" ? row.stat_row : {};
    const athleteName = extractAthleteName(statRow);
    const family = classifyDiamondRow(statRow);
    const { invalidFields, payload } = normalizeFamilyPayload(statRow, family);
    const anomalyFlags = validateFamilyPayload(family, payload, { athleteName, invalidFields });
    const zeroOnly = isZeroOnlyFamilyPayload(family, payload);

    stats.rawHistoricalRows[context.sportKey] += 1;

    if (!athleteName) {
      stats.blankAthleteNames += 1;
    }

    if (family === "unknown") {
      stats.unknownFamilyRows += 1;
    }

    if (
      family !== "unknown" &&
      anomalyFlags.some((flag) => flag.startsWith("malformed_numeric:") || flag.startsWith("empty_family_payload:"))
    ) {
      stats.malformedRows += 1;
    }

    if (anomalyFlags.some((flag) => flag.startsWith("impossible_batting:"))) {
      stats.impossibleBattingRows += 1;
    }

    if (anomalyFlags.some((flag) => flag.startsWith("impossible_pitching:"))) {
      stats.impossiblePitchingRows += 1;
    }

    if (zeroOnly || !Object.keys(payload).length) {
      stats.zeroOnlyRows += 1;
      return;
    }

    if (!athleteName) {
      return;
    }

    candidateRows.push({
      anomalyFlags,
      athleteKey: normalizeIdentityToken(athleteName) || "unknown-athlete",
      athleteName,
      excludedFromTotals: isExcludedFromTotals(family, anomalyFlags),
      family,
      payload,
      payloadSize: Object.keys(payload).length,
      row: {
        ...row,
        __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
      },
      sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
    });
  });

  const dedupeGroups = groupByDedupeKey(candidateRows);
  const duplicateGroups = Array.from(dedupeGroups.values()).filter((entries) => entries.length > 1);
  const dedupedRows = Array.from(dedupeGroups.values()).map((entries) =>
    [...entries].sort((left, right) => left.sourceIndex - right.sourceIndex)[0]
  );

  const playerSeasonGroups = new Map();
  dedupedRows.forEach((entry) => {
    const groupKey = [
      entry.row.sport,
      normalizeText(entry.row.school_id || entry.row.school || "unknown-school").toLowerCase(),
      normalizeText(entry.row.season || "unknown-season").toLowerCase(),
      entry.athleteKey,
    ].join("::");

    if (!playerSeasonGroups.has(groupKey)) {
      playerSeasonGroups.set(groupKey, {
        baseRow: entry.row,
        displayName: entry.athleteName,
        familyEntries: new Map(),
        school: entry.row.school || entry.row.stat_row?.School || "",
        school_id: entry.row.school_id || "",
        season: entry.row.season || entry.row.stat_row?.Season || "",
        sourceIndex: entry.sourceIndex,
      });
    }

    const group = playerSeasonGroups.get(groupKey);
    group.sourceIndex = Math.min(group.sourceIndex, entry.sourceIndex);
    if (!group.familyEntries.has(entry.family)) {
      group.familyEntries.set(entry.family, []);
    }
    group.familyEntries.get(entry.family).push(entry);
  });

  const mergedRows = [];

  Array.from(playerSeasonGroups.values()).forEach((group) => {
    const bucketMap = Object.fromEntries(FAMILY_ORDER.map((family) => [family, []]));
    const mergedFamilies = {};
    const groupFlags = new Set();

    FAMILY_ORDER.forEach((family) => {
      const entries = group.familyEntries.get(family) || [];
      bucketMap[family] = entries.map(createBucketRow);
      entries.forEach((entry) => entry.anomalyFlags.forEach((flag) => groupFlags.add(flag)));

      const validEntries = entries.filter((entry) => !entry.excludedFromTotals && family !== "unknown");
      if (!validEntries.length) {
        return;
      }

      const merged = mergeFamilyEntries(validEntries, family);
      merged.conflicts.forEach((flag) => groupFlags.add(flag));
      mergedFamilies[family] = merged;
    });

    if (!Object.keys(mergedFamilies).length) {
      return;
    }

    const mergedRow = createMergedDiamondRow(
      group,
      mergedFamilies,
      bucketMap,
      Array.from(groupFlags).sort()
    );

    stats.mergedPlayerSeasons[mergedRow.sport] += 1;
    mergedRows.push(mergedRow);
  });

  return {
    audit: {
      duplicateFamilyPayloadGroups: duplicateGroups.length,
      mergedPlayerSeasons: { ...stats.mergedPlayerSeasons },
      rawHistoricalRows: { ...stats.rawHistoricalRows },
      zeroOnlyRows: stats.zeroOnlyRows,
      blankAthleteNames: stats.blankAthleteNames,
      impossibleBattingRows: stats.impossibleBattingRows,
      impossiblePitchingRows: stats.impossiblePitchingRows,
      malformedRows: stats.malformedRows,
      unknownFamilyRows: stats.unknownFamilyRows,
    },
    dedupedRows,
    mergedRows,
    passthroughRows,
  };
}

export function normalizeHistoricalDiamondRows(rows = []) {
  const analysis = inspectBaseballSoftballHistoricalRows(rows);

  return [...analysis.passthroughRows, ...analysis.mergedRows]
    .sort((left, right) => (left.__sourceIndex || 0) - (right.__sourceIndex || 0))
    .map(stripTemporaryFields);
}
