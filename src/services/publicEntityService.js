import { supabase } from "../supabaseClient.js";
import { normalizeRecordSportContext, resolveSportContext } from "../sportContext.js";

const SEARCH_ROW_SELECT_BASE = "id, school_id, school, sport, season, stat_row";
const SEARCH_ROW_SELECT = "id, school_id, school, sport, sport_variant, season, stat_row";
const CLASS_SUFFIX_PATTERN = /\s*\((fr|so|jr|sr)\)\s*$/i;
const DISPLAY_NAME_KEYS = [
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
const FIRST_NAME_KEYS = [
  "First Name",
  "first_name",
  "Athlete First Name",
  "athlete_first_name",
  "Player First Name",
  "player_first_name",
];
const LAST_NAME_KEYS = [
  "Last Name",
  "last_name",
  "Athlete Last Name",
  "athlete_last_name",
  "Player Last Name",
  "player_last_name",
];

function escapeLike(value) {
  return String(value || "").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isMissingRelationError(error, relationName) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  const relation = String(relationName || "").toLowerCase();

  return (
    message.includes(relation) &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("relation") ||
      message.includes("column"))
  );
}

async function runSearchRowsQuery(queryFactory) {
  const primaryResponse = await queryFactory(SEARCH_ROW_SELECT);
  if (!primaryResponse.error) {
    return normalizePublicEntityRows(primaryResponse.data || []);
  }

  if (!isMissingRelationError(primaryResponse.error, "sport_variant")) {
    throw primaryResponse.error;
  }

  const fallbackResponse = await queryFactory(SEARCH_ROW_SELECT_BASE);
  if (fallbackResponse.error) {
    throw fallbackResponse.error;
  }

  return normalizePublicEntityRows(
    (fallbackResponse.data || []).map((row) => ({
      ...row,
      sport_variant: null,
    }))
  );
}

function normalizePublicEntityRows(rows) {
  return (rows || [])
    .map((row) => {
      const context = resolveSportContext(row?.sport, row?.gender);
      if (context.isBasketball && !context.isVarsity) {
        return null;
      }

      return normalizeRecordSportContext(row);
    })
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function foldText(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeLookupText(value) {
  return foldText(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAthleteLikeFilters(term) {
  const safe = escapeLike(term);
  const like = `%${safe}%`;

  return [
    `stat_row->>Athlete Name.ilike.${like}`,
    `stat_row->>athlete_name.ilike.${like}`,
    `stat_row->>player_name.ilike.${like}`,
    `stat_row->>player.ilike.${like}`,
    `stat_row->>name.ilike.${like}`,
  ];
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => normalizeText(value)).filter(Boolean)));
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

function isInitialToken(value) {
  return normalizeText(value).replace(/[^A-Za-z]/g, "").length === 1;
}

function isInitialBasedIdentity(identityKey) {
  const [firstToken = ""] = normalizeText(identityKey).split(" ");
  return isInitialToken(firstToken);
}

function normalizeAthleteAlias(name) {
  const tokens = normalizeAthleteIdentity(name).split(" ").filter(Boolean);
  if (!tokens.length) {
    return "";
  }

  if (tokens.length === 1) {
    return tokens[0];
  }

  return [tokens[0].charAt(0), ...tokens.slice(1)].join(" ").trim();
}

function splitIdentityParts(identityKey) {
  const tokens = normalizeText(identityKey).split(" ").filter(Boolean);
  return {
    firstToken: tokens[0] || "",
    hasFullFirstName: Boolean(tokens[0] && tokens[0].length > 1),
    lastName: tokens[tokens.length - 1] || "",
    tokens,
  };
}

export function extractAthleteName(statRow) {
  if (!statRow || typeof statRow !== "object") {
    return "";
  }

  return normalizeText(
    statRow["Athlete Name"] ||
      statRow.athlete_name ||
      statRow.player_name ||
      statRow.player ||
      statRow.name ||
      ""
  );
}

export function cleanAthleteDisplayName(name) {
  return normalizeText(name).replace(CLASS_SUFFIX_PATTERN, "");
}

export function extractAthleteNameCandidates(statRow) {
  if (!statRow || typeof statRow !== "object") {
    return [];
  }

  const candidates = [];
  const rawName = extractAthleteName(statRow);
  if (rawName) {
    candidates.push(rawName);
  }

  DISPLAY_NAME_KEYS.forEach((key) => {
    const value = normalizeText(statRow[key]);
    if (value) {
      candidates.push(value);
    }
  });

  const firstName = firstPresentValue(statRow, FIRST_NAME_KEYS);
  const lastName = firstPresentValue(statRow, LAST_NAME_KEYS);
  if (firstName && lastName) {
    candidates.push(`${firstName} ${lastName}`);
  }

  return uniqueStrings(candidates).map(cleanAthleteDisplayName).filter(Boolean);
}

export function normalizeAthleteIdentity(name) {
  return normalizeLookupText(cleanAthleteDisplayName(name));
}

export function chooseAthleteDisplayName(names) {
  let bestName = "";
  let bestScore = -1;

  uniqueStrings(Array.isArray(names) ? names : [names]).forEach((name) => {
    const cleaned = cleanAthleteDisplayName(name);
    if (!cleaned) {
      return;
    }

    const tokens = cleaned.split(" ").filter(Boolean);
    const firstToken = tokens[0] || "";
    const lastToken = tokens[tokens.length - 1] || "";
    let score = cleaned.length;

    if (tokens.length >= 2) {
      score += 10;
    }
    if (firstToken && !isInitialToken(firstToken)) {
      score += 14;
    }
    if (lastToken && !isInitialToken(lastToken)) {
      score += 6;
    }
    if (CLASS_SUFFIX_PATTERN.test(name)) {
      score -= 2;
    }

    if (score > bestScore) {
      bestName = cleaned;
      bestScore = score;
    }
  });

  return bestName;
}

export function extractAthleteClassTag(statRow, displayName = "") {
  const suffixMatch = normalizeText(displayName).match(CLASS_SUFFIX_PATTERN);
  if (suffixMatch?.[1]) {
    return suffixMatch[1].charAt(0).toUpperCase() + suffixMatch[1].slice(1).toLowerCase();
  }

  const candidate = normalizeText(
    statRow?.Grade ||
      statRow?.grade ||
      statRow?.CLASS ||
      statRow?.class ||
      statRow?.Class ||
      ""
  );

  const normalized = candidate.toLowerCase();
  if (["fr", "freshman"].includes(normalized)) return "Fr";
  if (["so", "sophomore"].includes(normalized)) return "So";
  if (["jr", "junior"].includes(normalized)) return "Jr";
  if (["sr", "senior"].includes(normalized)) return "Sr";
  return "";
}

export function buildSeasonRange(seasons) {
  const clean = Array.from(new Set((seasons || []).map((value) => normalizeText(value)).filter(Boolean)))
    .sort(compareSeasonsDesc);

  if (!clean.length) {
    return "";
  }

  if (clean.length === 1) {
    return clean[0];
  }

  return `${clean[clean.length - 1]} - ${clean[0]}`;
}

function seasonSortValue(season) {
  const match = normalizeText(season).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

export function compareSeasonsDesc(left, right) {
  return seasonSortValue(right) - seasonSortValue(left);
}

function queryMatchScore(displayName, schoolName, query) {
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const athlete = normalizeLookupText(displayName);
  const school = normalizeLookupText(schoolName);

  if (athlete === normalizedQuery) return 100;
  if (athlete.startsWith(normalizedQuery)) return 85;
  if (athlete.includes(normalizedQuery)) return 70;
  if (school.includes(normalizedQuery)) return 40;
  return 0;
}

function athleteMatchesIdentity(statRow, targetIdentity) {
  const normalizedTarget = normalizeAthleteIdentity(targetIdentity);
  if (!normalizedTarget) {
    return false;
  }

  const candidateKeys = extractAthleteNameCandidates(statRow)
    .map((name) => normalizeAthleteIdentity(name))
    .filter(Boolean);

  if (!candidateKeys.length) {
    return false;
  }

  if (candidateKeys.includes(normalizedTarget)) {
    return true;
  }

  const targetAlias = normalizeAthleteAlias(normalizedTarget);
  if (!targetAlias) {
    return false;
  }

  const candidateAliases = candidateKeys.map((key) => normalizeAthleteAlias(key));
  if (!candidateAliases.includes(targetAlias)) {
    return false;
  }

  if (isInitialBasedIdentity(normalizedTarget)) {
    return true;
  }

  return candidateKeys.every((key) => isInitialBasedIdentity(key));
}

export function buildAthleteProfileHref(identity) {
  const displayName = cleanAthleteDisplayName(identity.displayName || identity.athlete || "");
  const normalizedIdentity = identity.identityKey || normalizeAthleteIdentity(displayName);
  const params = new URLSearchParams({
    identity: normalizedIdentity,
    school: identity.school || "",
  });

  if (displayName) {
    params.set("name", displayName);
  }

  if (identity.schoolId) {
    params.set("school_id", identity.schoolId);
  }

  return `athlete.html?${params.toString()}`;
}

export function groupAthleteSearchResults(rows, { query = "", limit = 12 } = {}) {
  const grouped = new Map();
  const aliasIndex = new Map();

  (rows || []).forEach((row) => {
    const candidateNames = extractAthleteNameCandidates(row.stat_row);
    const preferredName = chooseAthleteDisplayName(candidateNames);
    const identityKey = normalizeAthleteIdentity(preferredName);
    const aliasKey = normalizeAthleteAlias(preferredName);
    const school = normalizeText(row.school || "Unknown School");
    const schoolId = normalizeText(row.school_id);
    const schoolKey = schoolId || school.toLowerCase();

    if (!identityKey || !schoolKey) {
      return;
    }

    let groupKey = `${identityKey}::${schoolKey}`;
    const aliasLookupKey = `${aliasKey}::${schoolKey}`;
    const aliasGroups = aliasIndex.get(aliasLookupKey) || [];

    if (!grouped.has(groupKey) && aliasGroups.length === 1) {
      const existingKey = aliasGroups[0];
      const existingGroup = grouped.get(existingKey);
      if (existingGroup) {
        const incomingIsInitial = isInitialBasedIdentity(identityKey);
        const existingIsInitial = isInitialBasedIdentity(existingGroup.identityKey);
        if (incomingIsInitial || existingIsInitial) {
          groupKey = existingKey;
        }
      }
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        athleteNames: [],
        classTags: new Set(),
        identityKey,
        latestSeason: "",
        rowCount: 0,
        school,
        schoolId,
        seasons: new Set(),
        sports: new Set(),
      });
    }

    if (!aliasGroups.includes(groupKey)) {
      aliasIndex.set(aliasLookupKey, [...aliasGroups, groupKey]);
    }

    const item = grouped.get(groupKey);
    item.athleteNames.push(...candidateNames);
    item.rowCount += 1;
    if (!item.schoolId && schoolId) {
      item.schoolId = schoolId;
    }
    if (row.sport) {
      item.sports.add(normalizeText(row.sport));
    }
    if (row.season) {
      const season = normalizeText(row.season);
      item.seasons.add(season);
      if (!item.latestSeason || compareSeasonsDesc(season, item.latestSeason) < 0) {
        item.latestSeason = season;
      }
    }

    if (isInitialBasedIdentity(item.identityKey) && !isInitialBasedIdentity(identityKey)) {
      item.identityKey = identityKey;
    }

    const classTag = extractAthleteClassTag(row.stat_row, extractAthleteName(row.stat_row));
    if (classTag) {
      item.classTags.add(classTag);
    }
  });

  return Array.from(grouped.values())
    .map((item) => {
      const sports = Array.from(item.sports).sort((left, right) => left.localeCompare(right));
      const seasons = Array.from(item.seasons).sort(compareSeasonsDesc);
      const athlete = chooseAthleteDisplayName(item.athleteNames);
      const classTags = Array.from(item.classTags);
      const finalIdentity = normalizeAthleteIdentity(athlete) || item.identityKey;

      return {
        athlete,
        classTag: classTags[0] || "",
        displayName: athlete,
        identityKey: finalIdentity,
        latestSeason: item.latestSeason,
        rowCount: item.rowCount,
        school: item.school,
        schoolId: item.schoolId,
        seasonRange: buildSeasonRange(seasons),
        seasons,
        sports,
        matchScore: queryMatchScore(athlete, item.school, query),
      };
    })
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }
      if (right.rowCount !== left.rowCount) {
        return right.rowCount - left.rowCount;
      }
      return left.athlete.localeCompare(right.athlete);
    })
    .slice(0, limit);
}

export function groupSchoolSearchResults(rows, { limit = 12 } = {}) {
  const grouped = new Map();

  (rows || []).forEach((row) => {
    const school = normalizeText(row.school);
    const schoolId = normalizeText(row.school_id);
    if (!school) {
      return;
    }

    const key = schoolId || school.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        latestSeason: "",
        school,
        schoolId,
        seasons: new Set(),
        sports: new Set(),
      });
    }

    const item = grouped.get(key);
    if (!item.schoolId && schoolId) {
      item.schoolId = schoolId;
    }
    if (row.sport) {
      item.sports.add(normalizeText(row.sport));
    }
    if (row.season) {
      const season = normalizeText(row.season);
      item.seasons.add(season);
      if (!item.latestSeason || compareSeasonsDesc(season, item.latestSeason) < 0) {
        item.latestSeason = season;
      }
    }
  });

  return Array.from(grouped.values())
    .map((item) => {
      const sports = Array.from(item.sports).sort((left, right) => left.localeCompare(right));
      const seasons = Array.from(item.seasons).sort(compareSeasonsDesc);
      return {
        latestSeason: item.latestSeason,
        school: item.school,
        schoolId: item.schoolId,
        seasonRange: buildSeasonRange(seasons),
        seasons,
        sports,
      };
    })
    .sort((left, right) => left.school.localeCompare(right.school))
    .slice(0, limit);
}

export async function fetchPublicSearchRows(query, { limit = 90 } = {}) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  return runSearchRowsQuery((selectColumns) =>
    supabase
      .from("raw_stat_rows")
      .select(selectColumns)
      .order("season", { ascending: false })
      .limit(limit)
      .or(
        [
          `school.ilike.%${escapeLike(normalizedQuery)}%`,
          `sport.ilike.%${escapeLike(normalizedQuery)}%`,
          `season.ilike.%${escapeLike(normalizedQuery)}%`,
          ...buildAthleteLikeFilters(normalizedQuery),
        ].join(",")
      )
  );
}

export async function fetchAthleteProfileRows({
  name = "",
  schoolId = "",
  schoolName = "",
  identityKey = "",
  limit = 500,
} = {}) {
  const displayName = cleanAthleteDisplayName(name);
  const normalizedSchoolId = normalizeText(schoolId);
  const normalizedSchoolName = normalizeText(schoolName);
  const normalizedIdentity = normalizeAthleteIdentity(identityKey || displayName);
  const identityParts = splitIdentityParts(normalizedIdentity);
  const broadTerms = uniqueStrings([
    identityParts.lastName,
    identityParts.hasFullFirstName ? identityParts.firstToken : "",
  ]);

  if (!displayName && !normalizedIdentity) {
    return [];
  }

  const rows = await runSearchRowsQuery((selectColumns) => {
    let request = supabase
      .from("raw_stat_rows")
      .select(selectColumns)
      .order("season", { ascending: false })
      .limit(limit);

    if (normalizedSchoolId) {
      request = request.eq("school_id", normalizedSchoolId);
    } else if (normalizedSchoolName) {
      request = request.ilike("school", normalizedSchoolName);
    }

    const searchTerms = broadTerms.length ? broadTerms : uniqueStrings([displayName, normalizedIdentity]);
    if (searchTerms.length) {
      request = request.or(searchTerms.flatMap((term) => buildAthleteLikeFilters(term)).join(","));
    }

    return request;
  });

  return rows.filter((row) => athleteMatchesIdentity(row.stat_row, normalizedIdentity));
}
