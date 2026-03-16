import { supabase } from "../supabaseClient.js";
import { normalizeFootballFormat } from "../footballFormat.js";
import { normalizePublicRecordRows } from "../publicRecordNormalizer.js";
import { normalizeSportKey, resolveSportContext } from "../sportContext.js";

const RECORD_SELECT_BASE = "id, school_id, school, sport, season, stat_row";
const RECORD_SELECT = "id, school_id, school, sport, sport_variant, season, stat_row";
const METADATA_SELECT_BASE = "id, school_id, school, sport, season";
const PUBLIC_QUERY_PAGE_SIZE = 1000;
const PUBLIC_SPORT_FAMILY_ORDER = ["baseball", "basketball", "football", "soccer", "softball", "volleyball"];

let visibleSchoolsCache = null;
let visibleSportsCache = null;
let visibleSeasonsCache = null;
let publicMetadataRowsCache = null;
let publicMetadataRowsPromise = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSchoolToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

function parseSeasonStartYear(value) {
  const text = normalizeText(value);
  const rangeMatch = text.match(/^(\d{2,4})\s*[-/]\s*(\d{2,4})$/);
  if (rangeMatch) {
    const start = rangeMatch[1];
    if (start.length === 4) {
      return Number(start);
    }
    if (start.length === 2) {
      const numeric = Number(start);
      if (Number.isInteger(numeric)) {
        return numeric > 50 ? 1900 + numeric : 2000 + numeric;
      }
    }
  }

  const singleYearMatch = text.match(/(19|20)\d{2}/);
  return singleYearMatch ? Number(singleYearMatch[0]) : 0;
}

function compareSeasonLabelsDesc(left, right) {
  const leftYear = parseSeasonStartYear(left);
  const rightYear = parseSeasonStartYear(right);

  if (leftYear !== rightYear) {
    return rightYear - leftYear;
  }

  return String(right || "").localeCompare(String(left || ""));
}

function isMeaningfulPublicRow(row, { requireStatRow = true } = {}) {
  const hasSchool = Boolean(normalizeText(row?.school_id) || normalizeText(row?.school));
  const hasSport = Boolean(normalizeText(row?.sport));
  const hasSeason = Boolean(normalizeText(row?.season));

  if (!hasSchool || !hasSport || !hasSeason) {
    return false;
  }

  if (!requireStatRow) {
    return true;
  }

  return Boolean(row?.stat_row && typeof row.stat_row === "object" && !Array.isArray(row.stat_row));
}

function mapPublicSportOption(row) {
  const context = resolveSportContext(row?.sport, row?.gender);

  if (!context.sportKey) {
    return null;
  }

  if (context.isBasketball && !context.isVarsity) {
    return null;
  }

  return {
    label: context.sportLabel || row?.sport_display || normalizeText(row?.sport),
    sportKey: context.sportKey,
    value: context.sportKey,
  };
}

function normalizeMetadataSportRows(rows) {
  return (rows || [])
    .filter((row) => isMeaningfulPublicRow(row, { requireStatRow: false }))
    .map((row) => {
      const context = resolveSportContext(row?.sport, row?.gender);

      if (!context.sportKey || (context.isBasketball && !context.isVarsity)) {
        return null;
      }

      return {
        ...row,
        competition_level: context.levelKey || null,
        gender: context.genderKey || null,
        sport: context.sportKey,
        sport_key: context.sportKey,
        sport_label: context.sportLabel || normalizeText(row?.sport),
        sport_display: context.competitionLabel || context.sportLabel || normalizeText(row?.sport),
      };
    })
    .filter(Boolean);
}

function parseSportFilterValue(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) {
    return {
      sportKey: "",
      value: "",
    };
  }

  return {
    sportKey: normalizeSportKey(rawValue),
    value: rawValue,
  };
}

function normalizePublicDivisionValue(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "boys" || normalized === "girls") {
    return normalized;
  }

  return "";
}

function matchesSportFilter(row, sportFilter, publicDivision = "") {
  if (!sportFilter?.sportKey) {
    return true;
  }

  const context = resolveSportContext(row?.sport, row?.gender);
  if (context.sportKey !== sportFilter.sportKey) {
    return false;
  }

  if (sportFilter.sportKey === "basketball" && publicDivision && context.genderKey !== publicDivision) {
    return false;
  }

  return true;
}

async function fetchPagedPublicRows(selectColumns, buildRequest, { pageSize = PUBLIC_QUERY_PAGE_SIZE } = {}) {
  const rows = [];
  let start = 0;

  while (true) {
    const request = buildRequest(
      supabase
        .from("raw_stat_rows")
        .select(selectColumns)
        .order("id", { ascending: true })
        .range(start, start + pageSize - 1)
    );

    if (!request) {
      return rows;
    }

    const { data, error } = await request;
    if (error) {
      throw error;
    }

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return rows;
}

async function fetchPagedPublicRowsWithFallback(
  primarySelect,
  fallbackSelect,
  buildRequest,
  { requireSportVariant = false } = {}
) {
  try {
    return await fetchPagedPublicRows(primarySelect, buildRequest);
  } catch (error) {
    if (!isMissingRelationError(error, "sport_variant")) {
      throw error;
    }

    if (requireSportVariant) {
      throw new Error("Football format filtering requires the latest football format storage migration.");
    }

    const fallbackRows = await fetchPagedPublicRows(fallbackSelect, buildRequest);
    return fallbackRows.map((row) => ({
      ...row,
      sport_variant: null,
    }));
  }
}

async function fetchPublicMetadataRows() {
  if (publicMetadataRowsCache) {
    return publicMetadataRowsCache;
  }

  if (!publicMetadataRowsPromise) {
    publicMetadataRowsPromise = fetchPagedPublicRows(METADATA_SELECT_BASE, (request) =>
      request
        .not("sport", "is", null)
        .not("season", "is", null)
        .not("stat_row", "is", null)
    )
      .then((rows) => {
        publicMetadataRowsCache = normalizeMetadataSportRows(rows);
        return publicMetadataRowsCache;
      })
      .finally(() => {
        publicMetadataRowsPromise = null;
      });
  }

  return publicMetadataRowsPromise;
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

function buildSearchFilter(query) {
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${escaped}%`;

  return [
    `school.ilike.${like}`,
    `sport.ilike.${like}`,
    `season.ilike.${like}`,
    `stat_row->>Athlete Name.ilike.${like}`,
    `stat_row->>athlete_name.ilike.${like}`,
    `stat_row->>player_name.ilike.${like}`,
    `stat_row->>player.ilike.${like}`,
    `stat_row->>name.ilike.${like}`,
  ].join(",");
}

function applySportFilter(request, sportKey) {
  const normalizedSport = normalizeSportKey(sportKey);
  if (!normalizedSport) {
    return request;
  }

  return request.ilike("sport", `%${normalizedSport}%`);
}

function dedupeVisibleSchools(rows) {
  const deduped = new Map();

  (rows || []).forEach((row) => {
    const id = normalizeText(row?.id);
    const fullName = normalizeText(row?.full_name);
    const shortName = normalizeText(row?.short_name);
    const division = normalizeText(row?.division);

    if (!id || !fullName) {
      return;
    }

    if (!deduped.has(id)) {
      deduped.set(id, { id, full_name: fullName, short_name: shortName, division });
    }
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.full_name.localeCompare(right.full_name)
  );
}

async function fetchMeaningfulSchoolRowsFallback() {
  const schoolsResponse = await supabase
    .from("schools")
    .select("id, full_name, short_name, division")
    .order("full_name", { ascending: true });

  if (schoolsResponse.error) {
    throw new Error(schoolsResponse.error.message);
  }

  const schools = schoolsResponse.data || [];
  const visibleRows = [];

  for (const school of schools) {
    const schoolId = normalizeText(school.id);
    const fullName = normalizeText(school.full_name);
    const shortName = normalizeText(school.short_name);

    if (!schoolId) {
      continue;
    }

    const probes = [
      supabase
        .from("raw_stat_rows")
        .select("id", { head: true, count: "exact" })
        .eq("school_id", schoolId)
        .not("sport", "is", null)
        .not("season", "is", null)
        .not("stat_row", "is", null),
    ];

    if (fullName) {
      probes.push(
        supabase
          .from("raw_stat_rows")
          .select("id", { head: true, count: "exact" })
          .ilike("school", fullName)
          .not("sport", "is", null)
          .not("season", "is", null)
          .not("stat_row", "is", null)
      );
    }

    if (shortName && shortName !== fullName) {
      probes.push(
        supabase
          .from("raw_stat_rows")
          .select("id", { head: true, count: "exact" })
          .ilike("school", shortName)
          .not("sport", "is", null)
          .not("season", "is", null)
          .not("stat_row", "is", null)
      );
    }

    const results = await Promise.all(probes);
    const hasVisibleData = results.some((result) => !result.error && Number(result.count || 0) > 0);

    if (hasVisibleData) {
      visibleRows.push(school);
    }
  }

  return dedupeVisibleSchools(visibleRows);
}

async function fetchVisibleSchools() {
  if (visibleSchoolsCache) {
    return visibleSchoolsCache;
  }

  const response = await supabase
    .from("vw_public_visible_schools")
    .select("id, full_name, short_name, division")
    .order("full_name", { ascending: true });

  if (!response.error) {
    visibleSchoolsCache = dedupeVisibleSchools(response.data || []);
    return visibleSchoolsCache;
  }

  if (!isMissingRelationError(response.error, "vw_public_visible_schools")) {
    throw new Error(response.error.message);
  }

  visibleSchoolsCache = await fetchMeaningfulSchoolRowsFallback();
  return visibleSchoolsCache;
}

async function fetchVisibleSports() {
  if (visibleSportsCache) {
    return visibleSportsCache;
  }

  const metadataRows = await fetchPublicMetadataRows();
  const deduped = new Map();

  metadataRows.forEach((row) => {
    const option = mapPublicSportOption(row);
    if (!option || !option.value || !option.label) {
      return;
    }

    if (!deduped.has(option.sportKey)) {
      deduped.set(option.sportKey, option);
    }
  });

  const sortIndex = new Map(PUBLIC_SPORT_FAMILY_ORDER.map((sportKey, index) => [sportKey, index]));
  visibleSportsCache = Array.from(deduped.values()).sort((left, right) => {
    const leftIndex = sortIndex.get(left.sportKey);
    const rightIndex = sortIndex.get(right.sportKey);
    if (leftIndex !== undefined || rightIndex !== undefined) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
    }

    return left.label.localeCompare(right.label);
  });

  return visibleSportsCache;
}

async function fetchVisibleSeasons() {
  if (visibleSeasonsCache) {
    return visibleSeasonsCache;
  }

  const metadataRows = await fetchPublicMetadataRows();
  visibleSeasonsCache = Array.from(
    new Set(metadataRows.map((row) => normalizeText(row.season)).filter(Boolean))
  ).sort(compareSeasonLabelsDesc);

  return visibleSeasonsCache;
}

export async function fetchSchools() {
  return fetchVisibleSchools();
}

export async function fetchPublicSchoolDirectory() {
  return fetchVisibleSchools();
}

export async function fetchStatsFilterMetadata() {
  const metadataRows = await fetchPublicMetadataRows();

  return metadataRows.map((row) => {
    const context = resolveSportContext(row?.sport, row?.gender);

    return {
      competitionLevel: context.levelKey || "",
      genderKey: context.genderKey || "",
      genderLabel: context.genderLabel || "",
      school: normalizeText(row?.school),
      schoolId: normalizeText(row?.school_id),
      season: normalizeText(row?.season),
      sportDisplay: context.competitionLabel || context.sportLabel || normalizeText(row?.sport),
      sportFamilyLabel: context.sportLabel || normalizeText(row?.sport),
      sportKey: context.sportKey || "",
    };
  });
}

export async function fetchSportsRecords(query = "", filters = {}) {
  const normalizedQuery = normalizeText(query);
  const normalizedSchoolId = normalizeText(filters.schoolId);
  const sportFilter = parseSportFilterValue(filters.sport);
  const normalizedSeason = normalizeText(filters.season);
  const normalizedDivision =
    sportFilter.sportKey === "basketball" ? normalizePublicDivisionValue(filters.division) : "";
  const normalizedFootballVariant = normalizeFootballFormat(
    filters.footballFormat || filters.footballVariant,
    { allowBlank: true }
  );
  const hasFilters = Boolean(
    normalizedQuery ||
      normalizedSchoolId ||
      sportFilter.sportKey ||
      normalizedSeason ||
      normalizedDivision ||
      normalizedFootballVariant
  );

  if (!hasFilters) {
    return [];
  }

  function buildRecordsRequest(request, { includeFootballVariant = true } = {}) {
    let nextRequest = request
      .not("sport", "is", null)
      .not("season", "is", null)
      .not("stat_row", "is", null);

    if (normalizedQuery) {
      nextRequest = nextRequest.or(buildSearchFilter(normalizedQuery));
    }

    if (normalizedSchoolId) {
      nextRequest = nextRequest.eq("school_id", normalizedSchoolId);
    }

    if (sportFilter.sportKey) {
      nextRequest = applySportFilter(nextRequest, sportFilter.sportKey);
    }

    if (normalizedSeason) {
      nextRequest = nextRequest.eq("season", normalizedSeason);
    }

    if (normalizedFootballVariant && includeFootballVariant) {
      nextRequest = nextRequest.eq("sport_variant", normalizedFootballVariant);
    }

    return nextRequest;
  }

  const rawRows = await fetchPagedPublicRowsWithFallback(
    RECORD_SELECT,
    RECORD_SELECT_BASE,
    (request) => buildRecordsRequest(request, { includeFootballVariant: true }),
    { requireSportVariant: Boolean(normalizedFootballVariant) }
  );

  return normalizePublicRecordRows(rawRows).filter((row) =>
    matchesSportFilter(row, sportFilter, normalizedDivision)
  );
}

export async function fetchSportsList() {
  return fetchVisibleSports();
}

export async function fetchSeasonsList() {
  return fetchVisibleSeasons();
}

export function normalizePublicSchoolToken(value) {
  return normalizeSchoolToken(value);
}
