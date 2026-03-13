// sportsService.js
import { supabase } from "../supabaseClient.js";

let publicSchoolSignalsCache = null;

/* ---------------- Helpers ---------------- */

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  const col = String(columnName || "").toLowerCase();
  return message.includes(col) &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("column"));
}

function isMissingSportVariantColumnError(error) {
  return isMissingColumnError(error, "sport_variant");
}

function isMissingIsActiveColumnError(error) {
  return isMissingColumnError(error, "is_active");
}

function buildSearchFilter(query) {
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${escaped}%`;
  return [
    `school.ilike.${like}`,
    `sport.ilike.${like}`,
    `season.ilike.${like}`,
  ].join(",");
}

function normalizeSchoolToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

function tokenizeSchoolToken(value) {
  const STOP_WORDS = new Set(["school", "for", "the", "of", "deaf", "high", "prep", "academy"]);
  return normalizeSchoolToken(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !STOP_WORDS.has(part));
}

function hasTokenOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  const left = tokenizeSchoolToken(a);
  const right = tokenizeSchoolToken(b);
  if (!left.length || !right.length) return false;

  const rightSet = new Set(right);
  const overlapCount = left.filter((token) => rightSet.has(token)).length;
  const minimum = Math.min(left.length, right.length) >= 3 ? 2 : 1;

  return overlapCount >= minimum;
}

/* ---------------- Pagination Helper ---------------- */

async function fetchPaginatedRows({ pageSize = 1000, maxRows = Number.POSITIVE_INFINITY, fetchPage }) {
  const allRows = [];
  let page = 0;

  while (true) {
    const { data, error } = await fetchPage(page, pageSize);

    if (error) throw new Error(error.message);

    const rows = data || [];

    if (rows.length === 0) break;

    allRows.push(...rows);

    if (rows.length < pageSize) break;

    if (allRows.length >= maxRows) break;

    page++;
  }

  return allRows.slice(0, maxRows);
}

/* ---------------- Metadata ---------------- */

export async function fetchSchools() {
  let request = supabase
    .from("schools")
    .select("id, full_name, short_name, division, is_active")
    .order("full_name", { ascending: true });

  let { data, error } = await request;

  if (error && isMissingIsActiveColumnError(error)) {
    const fallback = await supabase
      .from("schools")
      .select("id, full_name, short_name, division")
      .order("full_name", { ascending: true });

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  const schools = data || [];
  const visibilitySignals = await fetchPublicSchoolSignals();
  const aliasSignals = await fetchSchoolAliasSignals();
  const signalTokens = Array.from(visibilitySignals.schoolNames || []);
  const visibleSchools = [];

  schools.forEach((school) => {
    const fullNameToken = normalizeSchoolToken(school.full_name);
    const shortNameToken = normalizeSchoolToken(school.short_name);
    const aliasTokens = aliasSignals.get(school.id) || [];
    const candidateTokens = [fullNameToken, shortNameToken, ...aliasTokens].filter(Boolean);

    let hasSignalMatch = false;
    let matchedToken = "";

    if (visibilitySignals.schoolIds.has(school.id)) {
      hasSignalMatch = true;
    } else {
      for (const token of candidateTokens) {
        if (visibilitySignals.schoolNames.has(token)) {
          hasSignalMatch = true;
          matchedToken = token;
          break;
        }
      }

      if (!hasSignalMatch) {
        for (const token of candidateTokens) {
          const overlap = signalTokens.find((signalToken) => hasTokenOverlap(token, signalToken));
          if (overlap) {
            hasSignalMatch = true;
            matchedToken = overlap;
            break;
          }
        }
      }
    }

    if (!hasSignalMatch) {
      return;
    }

    visibleSchools.push(school);
  });

  const deduped = new Map();
  visibleSchools.forEach((school) => {
    const key = school.id || normalizeSchoolToken(school.full_name);
    if (!deduped.has(key)) {
      deduped.set(key, school);
    }
  });

  return Array.from(deduped.values()).sort((a, b) =>
    String(a.full_name || "").localeCompare(String(b.full_name || ""))
  );
}

export async function fetchPublicSchoolDirectory() {
  const schools = await fetchSchools();
  const visibilitySignals = await fetchPublicSchoolSignals();
  const results = [...schools];

  const knownTokens = new Set();
  schools.forEach((school) => {
    const fullNameToken = normalizeSchoolToken(school.full_name);
    const shortNameToken = normalizeSchoolToken(school.short_name);
    if (fullNameToken) knownTokens.add(fullNameToken);
    if (shortNameToken) knownTokens.add(shortNameToken);
  });

  Array.from(visibilitySignals.schoolNames || []).forEach((signalToken) => {
    const alreadyKnown = Array.from(knownTokens).some((token) =>
      token === signalToken || hasTokenOverlap(token, signalToken)
    );

    if (alreadyKnown) {
      return;
    }

    const displayName = visibilitySignals.schoolNameDisplay.get(signalToken) || signalToken;
    results.push({
      id: `signal:${signalToken}`,
      full_name: displayName,
      short_name: "",
      division: "",
      is_signal_only: true,
    });
    knownTokens.add(signalToken);
  });

  const deduped = new Map();
  results.forEach((school) => {
    const key = normalizeSchoolToken(school.full_name) || school.id;
    if (!deduped.has(key)) {
      deduped.set(key, school);
    }
  });

  return Array.from(deduped.values()).sort((a, b) =>
    String(a.full_name || "").localeCompare(String(b.full_name || ""))
  );
}

async function fetchPublicSchoolSignals() {
  if (publicSchoolSignalsCache) {
    return publicSchoolSignalsCache;
  }

  const rows = await fetchPaginatedRows({
    pageSize: 5000,
    fetchPage: (page, pageSize) => supabase
      .from("raw_stat_rows")
      .select("school_id, school")
      .order("id", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1),
  });

  const schoolIds = new Set();
  const schoolNames = new Set();
  const schoolNameDisplay = new Map();

  (rows || []).forEach((row) => {
    if (row.school_id) {
      schoolIds.add(row.school_id);
    }

    const displayName = String(row.school || "").trim();
    const token = normalizeSchoolToken(displayName);
    if (token) {
      schoolNames.add(token);
      if (!schoolNameDisplay.has(token)) {
        schoolNameDisplay.set(token, displayName);
      }
    }
  });

  publicSchoolSignalsCache = { schoolIds, schoolNames, schoolNameDisplay };
  return publicSchoolSignalsCache;
}

async function fetchSchoolAliasSignals() {
  const aliasMap = new Map();

  const { data, error } = await supabase
    .from("school_aliases")
    .select("*");

  if (error) {
    return aliasMap;
  }

  (data || []).forEach((row) => {
    const schoolId = row.school_id || row.schoolId || "";
    if (!schoolId) return;

    const aliasValue =
      row.alias ||
      row.alias_name ||
      row.alias_value ||
      row.name ||
      "";

    const token = normalizeSchoolToken(aliasValue);
    if (!token) return;

    const list = aliasMap.get(schoolId) || [];
    list.push(token);
    aliasMap.set(schoolId, list);
  });

  return aliasMap;
}

async function getFullNameBySchoolId(schoolId) {
  if (!schoolId) return null;

  const { data, error } = await supabase
    .from("schools")
    .select("full_name")
    .eq("id", schoolId)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.full_name || null;
}

async function getDivisionFullNameList(division) {
  if (!division) return null;

  let request = supabase
    .from("schools")
    .select("full_name")
    .eq("division", division)
    .eq("is_active", true);

  let { data, error } = await request;

  if (error && isMissingIsActiveColumnError(error)) {
    const fallback = await supabase
      .from("schools")
      .select("full_name")
      .eq("division", division);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  return (data || []).map((r) => r.full_name);
}

/* ---------------- Main API ---------------- */

export async function fetchSportsRecords(query = "", filters = {}) {
  const hasFilters = Boolean(
    query ||
      filters.schoolId ||
      filters.sport ||
      filters.division ||
      filters.season ||
      filters.footballVariant
  );

  if (!hasFilters) {
    return [];
  }

  let divisionFullNames = null;
  if (filters.division) {
    divisionFullNames = await getDivisionFullNameList(filters.division);
  }

  let selectedSchoolFullName = null;
  if (filters.schoolId && filters.schoolId !== "all") {
    selectedSchoolFullName = await getFullNameBySchoolId(filters.schoolId);
  }

  const allData = await fetchPaginatedRows({
    pageSize: 1000,
    maxRows: Number(filters.maxRows || 3000),
    fetchPage: (page, pageSize) => {
      const escapedQuery = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const like = `%${escapedQuery}%`;

      let request = supabase
        .from("raw_stat_rows")
        .select("*")
        .order("season", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (query) {
        request = request.or([
          buildSearchFilter(query),
          `stat_row->>Athlete Name.ilike.${like}`,
          `stat_row->>athlete_name.ilike.${like}`,
          `stat_row->>name.ilike.${like}`,
        ].join(","));
      }

      if (divisionFullNames?.length) {
        request = request.in("school", divisionFullNames);
      }

      if (filters.schoolId && filters.schoolId !== "all") {
        request = selectedSchoolFullName
          ? request.eq("school", selectedSchoolFullName)
          : request.eq("school_id", filters.schoolId);
      }

      if (filters.sport && filters.sport !== "all") {
        request = request.eq("sport", filters.sport);
      }

      if (filters.season && filters.season !== "all") {
        request = request.eq("season", filters.season);
      }

      return request;
    },
  });

  return allData || [];
}

/* ---------------- Dropdown APIs ---------------- */

export async function fetchSportsList() {
  const { data, error } = await supabase
    .from("vw_sports")
    .select("sport");

  if (error) throw new Error(error.message);

  return (data || []).map(r => r.sport);
}

export async function fetchSeasonsList() {
  const rows = await fetchPaginatedRows({
    pageSize: 1500,
    maxRows: 12000,
    fetchPage: (page, pageSize) =>
      supabase
        .from("raw_stat_rows")
        .select("season")
        .order("season", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1),
  });

  return Array.from(
    new Set(
      (rows || [])
        .map((row) => String(row.season || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => (a < b ? 1 : -1));
}
