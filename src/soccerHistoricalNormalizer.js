import { normalizeRecordSportContext, resolveSportContext } from "./sportContext.js";

export const SOCCER_PUBLIC_REVIEW_MARKER = "\u2021";

const HISTORICAL_DATA_ORIGIN = "historical_season_summary";
const SOCCER_REVIEW_FLAGS = new Set(["mirrored_cross_sport_payload", "historical_source_review"]);
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
const META_KEYS = new Set(
  [
    ...ATHLETE_NAME_KEYS,
    "School",
    "school",
    "School Name",
    "school_name",
    "Season",
    "season",
    "Year",
    "year",
    "Team",
    "team",
    "Gender",
    "gender",
    "Sport",
    "sport",
    "Grade",
    "grade",
    "Class",
    "class",
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
const SUMMARY_STAT_KEYS = ["GP", "G", "A", "SOG", "GA", "SV", "SHO", "PK", "PKG"];
const CLASS_SUFFIX_PATTERN = /\s*\((fr|so|jr|sr)\)\s*$/i;
const DATE_SEASON_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}$/i,
];

export function normalizeHistoricalSoccerRows(rows = []) {
  const passthroughRows = [];
  const candidateRows = [];

  (Array.isArray(rows) ? rows : []).forEach((inputRow, sourceIndex) => {
    const row = normalizeRecordSportContext(inputRow);
    const withIndex = {
      ...row,
      __sourceIndex: typeof row?.__sourceIndex === "number" ? row.__sourceIndex : sourceIndex,
    };
    const context = resolveSportContext(withIndex?.sport, withIndex?.gender);

    if (context.sportKey !== "soccer" || withIndex?.soccer_historical_review_normalized) {
      passthroughRows.push(withIndex);
      return;
    }

    if (!isLikelyHistoricalSoccerRow(withIndex)) {
      passthroughRows.push(withIndex);
      return;
    }

    candidateRows.push({
      athleteKey: extractAthleteIdentityKey(withIndex?.stat_row),
      row: withIndex,
      sourceFlags: new Set(getSoccerSourceFlags(withIndex)),
      sourceIndex: withIndex.__sourceIndex,
      sourcePayloadSignature: buildPayloadSignature(withIndex?.stat_row),
      sourceSchoolKey: normalizeText(withIndex.school_id || withIndex.school || "unknown-school").toLowerCase(),
      sourceSeasonKey: normalizeText(withIndex.season || "unknown-season").toLowerCase(),
      sourceGenderKey: context.genderKey || "unknown",
    });
  });

  const mirroredGroups = new Map();

  candidateRows.forEach((entry) => {
    const mirrorKey = [
      entry.sourceSchoolKey,
      entry.sourceSeasonKey,
      entry.athleteKey || "unknown-athlete",
      entry.sourcePayloadSignature,
    ].join("::");

    if (!mirroredGroups.has(mirrorKey)) {
      mirroredGroups.set(mirrorKey, []);
    }

    mirroredGroups.get(mirrorKey).push(entry);
  });

  mirroredGroups.forEach((entries) => {
    const genderKeys = new Set(entries.map((entry) => entry.sourceGenderKey).filter(Boolean));
    if (genderKeys.size > 1) {
      entries.forEach((entry) => entry.sourceFlags.add("mirrored_cross_sport_payload"));
    }
  });

  const normalizedRows = candidateRows.map((entry) => {
    const sourceFlags = Array.from(entry.sourceFlags).sort();

    return {
      ...entry.row,
      data_origin: entry.row.data_origin || HISTORICAL_DATA_ORIGIN,
      soccer_historical_review_normalized: true,
      source_flags: sourceFlags,
    };
  });

  return [...passthroughRows, ...normalizedRows]
    .sort((left, right) => (left.__sourceIndex || 0) - (right.__sourceIndex || 0))
    .map(stripTemporaryFields)
    .map(applySoccerPublicReviewFields);
}

export function applySoccerPublicReviewFields(row) {
  const context = resolveSportContext(row?.sport, row?.gender);

  if (context.sportKey !== "soccer") {
    return row;
  }

  const isHistorical =
    row?.data_origin === HISTORICAL_DATA_ORIGIN ||
    row?.soccer_historical_review_normalized ||
    isLikelyHistoricalSoccerRow(row);

  if (!isHistorical) {
    return {
      ...row,
      is_flagged_for_review: false,
      public_source_marker: "",
    };
  }

  const publicFlags = getSoccerSourceFlags(row);
  const isFlagged = publicFlags.some((flag) => SOCCER_REVIEW_FLAGS.has(flag));

  return {
    ...row,
    is_flagged_for_review: isFlagged,
    public_source_marker: isFlagged ? SOCCER_PUBLIC_REVIEW_MARKER : "",
    source_flags: mergeFlagLists(row?.source_flags, publicFlags),
  };
}

export function getSoccerSourceFlags(row) {
  const sourceFlags = extractFlagStrings(row?.source_flags);
  const anomalyFlags = extractFlagStrings(row?.anomaly_flags);
  const combined = [...sourceFlags, ...anomalyFlags];
  const publicFlags = new Set();

  combined.forEach((flag) => {
    if (SOCCER_REVIEW_FLAGS.has(flag)) {
      publicFlags.add(flag);
    }
  });

  if (!publicFlags.size && combined.length) {
    publicFlags.add("historical_source_review");
  }

  if (row?.is_flagged_for_review || row?.public_source_marker === SOCCER_PUBLIC_REVIEW_MARKER) {
    publicFlags.add("historical_source_review");
  }

  return Array.from(publicFlags).sort();
}

export function isSoccerRowFlaggedForReview(row) {
  return Boolean(applySoccerPublicReviewFields(row)?.is_flagged_for_review);
}

function isLikelyHistoricalSoccerRow(row) {
  const statRow = row?.stat_row && typeof row.stat_row === "object" ? row.stat_row : {};

  if (row?.data_origin === HISTORICAL_DATA_ORIGIN) {
    return true;
  }

  if (row?.submission_scope && !["season_sheet", "", null, undefined].includes(row.submission_scope)) {
    return false;
  }

  if (isLikelyDateSeason(row?.season) || hasGameContext(statRow)) {
    return false;
  }

  const keySet = buildKeySet(statRow);
  return SUMMARY_STAT_KEYS.filter((key) => keySet.has(normalizeHeaderToken(key))).length >= 2;
}

function buildKeySet(statRow) {
  return new Set(
    Object.entries(statRow || {})
      .filter(([, value]) => hasMeaningfulValue(normalizeText(value)))
      .map(([key]) => normalizeHeaderToken(key))
  );
}

function hasGameContext(statRow) {
  return Array.from(buildKeySet(statRow)).some((key) => GAME_CONTEXT_KEYS.has(key));
}

function buildPayloadSignature(statRow) {
  return JSON.stringify(
    Object.entries(statRow || {})
      .map(([key, value]) => [normalizeHeaderToken(key), normalizeStatValue(value)])
      .filter(([key, value]) => key && !META_KEYS.has(key) && hasMeaningfulValue(value))
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function extractAthleteIdentityKey(statRow) {
  const athleteName = cleanAthleteName(
    ATHLETE_NAME_KEYS.map((key) => normalizeText(statRow?.[key])).find(Boolean) || ""
  );

  return normalizeIdentityToken(athleteName);
}

function extractFlagStrings(value) {
  if (Array.isArray(value)) {
    return value.map((flag) => normalizeText(flag)).filter(Boolean);
  }

  const singleValue = normalizeText(value);
  return singleValue ? [singleValue] : [];
}

function mergeFlagLists(...flagGroups) {
  return Array.from(
    new Set(
      flagGroups.flatMap((group) => extractFlagStrings(group))
    )
  ).sort();
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeIdentityToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['â€™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function hasMeaningfulValue(value) {
  return !["", null, undefined].includes(value);
}

function cleanAthleteName(value) {
  return normalizeText(value).replace(CLASS_SUFFIX_PATTERN, "").trim();
}

function isLikelyDateSeason(value) {
  const text = normalizeText(value);
  return DATE_SEASON_PATTERNS.some((pattern) => pattern.test(text));
}

function stripTemporaryFields(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  const { __sourceIndex, ...rest } = row;
  return rest;
}
