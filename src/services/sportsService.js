// sportsService.js
import { supabase } from "../supabaseClient.js";

/** ---------- Helpers ---------- */

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  const col = String(columnName || "").toLowerCase();
  return message.includes(col) && (
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("column")
  );
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
  const parts = [
    `school.ilike.${like}`,
    `sport.ilike.${like}`,
    `season.ilike.${like}`,
  ];
  return parts.join(",");
}

async function fetchPaginatedRows({ pageSize = 1000, fetchPage, onError, onPageData }) {
  const allRows = [];
  let page = 0;

  while (true) {
    const { data, error } = await fetchPage(page, pageSize);

    if (error) {
      if (onError) {
        const action = await onError({ error, page, allRows });
        if (action === "retry") continue;
        if (action === "stop") break;
      }
      throw new Error(error.message);
    }

    const rows = data || [];

    if (onPageData) {
      const action = await onPageData({ data: rows, page, allRows });
      if (action === "retry") continue;
      if (action === "stop") break;
    }

    if (rows.length === 0) break;

    allRows.push(...rows);

    if (rows.length < pageSize) break;

    page++;
  }

  return allRows;
}

async function fetchUniqueColumnValues(columnName) {
  const rows = await fetchPaginatedRows({
    pageSize: 1000,
    fetchPage: (page, pageSize) =>
      supabase
        .from("raw_stat_rows")
        .select(columnName)
        .range(page * pageSize, (page + 1) * pageSize - 1),
  });

  const uniqueValues = new Set();
  rows.forEach((row) => {
    const value = row?.[columnName];
    if (value) uniqueValues.add(value);
  });

  return Array.from(uniqueValues).sort();
}

/**
 * Pull schools from metadata table (NOT raw_stat_rows).
 * Uses is_active if present (so fake NSD can exist but be hidden from rankings).
 */
async function fetchSchoolsFromMetadata() {
  let useIsActive = true;

  // Try with is_active first; if column missing, retry without it.
  const attempt = async () => {
    let q = supabase
      .from("schools")
      .select("id, full_name, short_name, division, is_active")
      .order("full_name", { ascending: true });

    if (useIsActive) q = q.eq("is_active", true);
    const { data, error } = await q;
    return { data, error };
  };

  let { data, error } = await attempt();

  if (error && useIsActive && isMissingIsActiveColumnError(error)) {
    console.warn("schools.is_active missing; retrying without is_active filter.");
    useIsActive = false;
    ({ data, error } = await attempt());
  }

  if (error) throw new Error(error.message);
  return data || [];
}

async function getFullNameBySchoolId(schoolId) {
  if (!schoolId) return null;

  // Try to fetch full_name by id; if not found, return null.
  let useIsActive = true;

  const attempt = async () => {
    let q = supabase
      .from("schools")
      .select("id, full_name, is_active")
      .eq("id", schoolId)
      .limit(1);

    if (useIsActive) q = q.eq("is_active", true);

    const { data, error } = await q;
    return { data, error };
  };

  let { data, error } = await attempt();

  if (error && useIsActive && isMissingIsActiveColumnError(error)) {
    useIsActive = false;
    ({ data, error } = await attempt());
  }

  if (error) throw new Error(error.message);
  const row = (data || [])[0];
  return row?.full_name || null;
}

async function getDivisionFullNameList(division) {
  if (!division) return null;

  let useIsActive = true;

  const attempt = async () => {
    let q = supabase
      .from("schools")
      .select("full_name, is_active")
      .eq("division", division);

    if (useIsActive) q = q.eq("is_active", true);

    const { data, error } = await q;
    return { data, error };
  };

  let { data, error } = await attempt();

  if (error && useIsActive && isMissingIsActiveColumnError(error)) {
    console.warn("schools.is_active missing; retrying division fetch without is_active filter.");
    useIsActive = false;
    ({ data, error } = await attempt());
  }

  if (error) throw new Error(error.message);

  const list = (data || [])
    .map((r) => r?.full_name)
    .filter(Boolean);

  return list;
}

/** ---------- Main API ---------- */

export async function fetchSportsRecords(query = "", filters = {}) {
  console.log("fetchSportsRecords called with:", { query, filters });

  // Football variant mode: prefer sport_variant; fallback to sport text matching if column missing.
  let footballVariantFilterMode = filters.footballVariant ? "sport_variant" : "none";

  // Precompute division & school filters (metadata-driven)
  let divisionFullNames = null;
  if (filters.division && filters.division !== "") {
    divisionFullNames = await getDivisionFullNameList(filters.division);
    console.log(`Division ${filters.division} schools (full_name) count:`, divisionFullNames?.length || 0);
  }

  let selectedSchoolFullName = null;
  if (filters.schoolId && filters.schoolId !== "" && filters.schoolId !== "all") {
    selectedSchoolFullName = await getFullNameBySchoolId(filters.schoolId);
    console.log("Resolved schoolId -> full_name:", { schoolId: filters.schoolId, full_name: selectedSchoolFullName });
  }

  const allData = await fetchPaginatedRows({
    pageSize: 1000,
    fetchPage: (page, pageSize) => {
      let request = supabase
        .from("raw_stat_rows")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      // Search
      if (query) {
        request = request.or(`${buildSearchFilter(query)},stat_row->>Athlete Name.ilike.%${query}%`);
      }

      // Division filter (uses schools metadata full_name list)
      if (divisionFullNames && divisionFullNames.length > 0) {
        request = request.in("school", divisionFullNames);
      }

      // School filter (uses schoolId -> schools.full_name -> raw_stat_rows.school)
      if (selectedSchoolFullName) {
        request = request.eq("school", selectedSchoolFullName);
      }

      // Sport filter
      if (filters.sport && filters.sport !== "" && filters.sport !== "all") {
        request = request.eq("sport", filters.sport);
      }

      // Season filter (if you use it)
      if (filters.season && filters.season !== "" && filters.season !== "all") {
        request = request.eq("season", filters.season);
      }

      // Football variant filter
      if (filters.footballVariant) {
        if (footballVariantFilterMode === "sport_variant") {
          request = request.eq("sport_variant", filters.footballVariant);
        } else {
          request = request.ilike("sport", `%${filters.footballVariant}%`);
        }
      }

      return request;
    },

    onError: ({ error }) => {
      // Fallback if sport_variant column missing
      if (
        filters.footballVariant &&
        footballVariantFilterMode === "sport_variant" &&
        isMissingSportVariantColumnError(error)
      ) {
        console.warn(
          "sport_variant column missing on raw_stat_rows, falling back to sport text matching for football variant filter."
        );
        footballVariantFilterMode = "sport_text";
        return "retry";
      }

      console.error("Supabase error:", error);
      return null;
    },

    onPageData: ({ data, page, allRows }) => {
      if (
        filters.footballVariant &&
        footballVariantFilterMode === "sport_variant" &&
        page === 0 &&
        allRows.length === 0 &&
        data.length === 0
      ) {
        console.warn("No football variant rows found via sport_variant, retrying with legacy sport text matching.");
        footballVariantFilterMode = "sport_text";
        return "retry";
      }
      return null;
    },
  });

  console.log(`Fetched ${allData?.length || 0} records`);
  if (allData && allData.length > 0) {
    console.log("Sample record:", allData[0]);
    console.log("Unique schools in result:", [...new Set(allData.map((r) => r.school))]);

    // Sort by PTS descending (optional)
    allData.sort((a, b) => {
      const ptsA = parseFloat(a.stat_row?.PTS) || 0;
      const ptsB = parseFloat(b.stat_row?.PTS) || 0;
      return ptsB - ptsA;
    });
  }

  return allData || [];
}

/**
 * Schools list for dropdowns (uses metadata table, includes short_name + division).
 * id = schools.id (stable), full_name displayed (or short_name if you want).
 */
export async function fetchSchools() {
  const rows = await fetchSchoolsFromMetadata();
  console.log("Total schools from metadata:", rows.length);

  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    short_name: r.short_name,
    division: r.division,
  }));
}

/**
 * Sports list for dropdowns (still from raw_stat_rows; fine).
 */
export async function fetchSportsList() {
  const sports = await fetchUniqueColumnValues("sport");
  console.log("Total unique sports found:", sports.length);
  return sports;
}

/**
 * Season dropdown (auto-populated from Supabase distinct seasons).
 */
export async function fetchSeasonsList() {
  const seasons = await fetchUniqueColumnValues("season");
  console.log("Total unique seasons found:", seasons.length);
  return seasons;
}