import { supabase } from "../supabaseClient.js";
import { normalizeFootballFormat } from "../footballFormat.js";

const RECORD_SELECT_BASE = "id, school_id, school, sport, season, stat_row";
const RECORD_SELECT = "id, school_id, school, sport, sport_variant, season, stat_row";
const DEFAULT_RECORD_LIMIT = 800;
const MAX_RECORD_LIMIT = 1500;

let visibleSchoolsCache = null;
let visibleSportsCache = null;
let visibleSeasonsCache = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSchoolToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
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

  const response = await supabase
    .from("vw_public_visible_sports")
    .select("sport")
    .order("sport", { ascending: true });

  if (!response.error) {
    visibleSportsCache = Array.from(
      new Set((response.data || []).map((row) => normalizeText(row.sport)).filter(Boolean))
    );
    return visibleSportsCache;
  }

  if (!isMissingRelationError(response.error, "vw_public_visible_sports")) {
    throw new Error(response.error.message);
  }

  const fallback = await supabase.from("vw_sports").select("sport");
  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  visibleSportsCache = Array.from(
    new Set((fallback.data || []).map((row) => normalizeText(row.sport)).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));

  return visibleSportsCache;
}

async function fetchVisibleSeasons() {
  if (visibleSeasonsCache) {
    return visibleSeasonsCache;
  }

  const response = await supabase
    .from("vw_public_visible_seasons")
    .select("season")
    .order("season", { ascending: false });

  if (!response.error) {
    visibleSeasonsCache = Array.from(
      new Set((response.data || []).map((row) => normalizeText(row.season)).filter(Boolean))
    );
    return visibleSeasonsCache;
  }

  if (!isMissingRelationError(response.error, "vw_public_visible_seasons")) {
    throw new Error(response.error.message);
  }

  const fallback = await supabase
    .from("raw_stat_rows")
    .select("season")
    .not("season", "is", null)
    .order("season", { ascending: false })
    .limit(500);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  visibleSeasonsCache = Array.from(
    new Set((fallback.data || []).map((row) => normalizeText(row.season)).filter(Boolean))
  );

  return visibleSeasonsCache;
}

function filterSchoolsByDivision(schools, division) {
  const normalizedDivision = normalizeText(division).toLowerCase();
  if (!normalizedDivision) {
    return schools;
  }

  return (schools || []).filter(
    (school) => normalizeText(school.division).toLowerCase() === normalizedDivision
  );
}

export async function fetchSchools() {
  return fetchVisibleSchools();
}

export async function fetchPublicSchoolDirectory() {
  return fetchVisibleSchools();
}

export async function fetchSportsRecords(query = "", filters = {}) {
  const normalizedQuery = normalizeText(query);
  const normalizedSchoolId = normalizeText(filters.schoolId);
  const normalizedSport = normalizeText(filters.sport);
  const normalizedSeason = normalizeText(filters.season);
  const normalizedDivision = normalizeText(filters.division);
  const normalizedFootballVariant = normalizeFootballFormat(
    filters.footballFormat || filters.footballVariant,
    { allowBlank: true }
  );
  const hasFilters = Boolean(
    normalizedQuery ||
      normalizedSchoolId ||
      normalizedSport ||
      normalizedSeason ||
      normalizedDivision ||
      normalizedFootballVariant
  );

  if (!hasFilters) {
    return [];
  }

  async function buildRecordsRequest(selectColumns, { includeFootballVariant = true } = {}) {
    let request = supabase
      .from("raw_stat_rows")
      .select(selectColumns)
      .order("season", { ascending: false })
      .limit(Math.min(Number(filters.maxRows) || DEFAULT_RECORD_LIMIT, MAX_RECORD_LIMIT));

    if (normalizedQuery) {
      request = request.or(buildSearchFilter(normalizedQuery));
    }

    if (normalizedSchoolId) {
      request = request.eq("school_id", normalizedSchoolId);
    }

    if (normalizedDivision) {
      const visibleSchools = await fetchVisibleSchools();
      const schoolsInDivision = filterSchoolsByDivision(visibleSchools, normalizedDivision);
      const schoolIds = schoolsInDivision.map((school) => school.id).filter(Boolean);
      const schoolNames = schoolsInDivision.map((school) => school.full_name).filter(Boolean);

      if (!schoolIds.length && !schoolNames.length) {
        return null;
      }

      if (schoolIds.length) {
        request = request.in("school_id", schoolIds);
      } else {
        request = request.in("school", schoolNames);
      }
    }

    if (normalizedSport) {
      request = request.eq("sport", normalizedSport);
    }

    if (normalizedSeason) {
      request = request.eq("season", normalizedSeason);
    }

    if (normalizedFootballVariant && includeFootballVariant) {
      request = request.eq("sport_variant", normalizedFootballVariant);
    }

    return request;
  }

  const primaryRequest = await buildRecordsRequest(RECORD_SELECT);
  if (!primaryRequest) {
    return [];
  }

  const { data, error } = await primaryRequest;
  if (error) {
    if (isMissingRelationError(error, "sport_variant")) {
      if (normalizedFootballVariant) {
        throw new Error("Football format filtering requires the latest football format storage migration.");
      }

      const fallbackRequest = await buildRecordsRequest(RECORD_SELECT_BASE, {
        includeFootballVariant: false,
      });
      if (!fallbackRequest) {
        return [];
      }

      const fallbackResponse = await fallbackRequest;
      if (fallbackResponse.error) {
        throw new Error(fallbackResponse.error.message);
      }

      return (fallbackResponse.data || []).map((row) => ({
        ...row,
        sport_variant: null,
      }));
    }

    throw new Error(error.message);
  }

  return data || [];
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
