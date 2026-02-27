// sportsService.js
import { supabase } from "../supabaseClient.js";

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

/* ---------------- Pagination Helper ---------------- */

async function fetchPaginatedRows({ pageSize = 1000, fetchPage }) {
  const allRows = [];
  let page = 0;

  while (true) {
    const { data, error } = await fetchPage(page, pageSize);

    if (error) throw new Error(error.message);

    const rows = data || [];
    if (rows.length === 0) break;

    allRows.push(...rows);
    if (rows.length < pageSize) break;

    page++;
  }

  return allRows;
}

/* ---------------- Metadata ---------------- */

async function fetchSchoolsFromMetadata() {
  const { data, error } = await supabase
    .from("schools")
    .select("id, full_name, short_name, division, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
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

  const { data, error } = await supabase
    .from("schools")
    .select("full_name")
    .eq("division", division)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  return (data || []).map((r) => r.full_name);
}

/* ---------------- Main API ---------------- */

export async function fetchSportsRecords(query = "", filters = {}) {
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
    fetchPage: (page, pageSize) => {
      let request = supabase
        .from("raw_stat_rows")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (query) {
        request = request.or(
          `${buildSearchFilter(query)},stat_row->>Athlete Name.ilike.%${query}%`
        );
      }

      if (divisionFullNames?.length) {
        request = request.in("school", divisionFullNames);
      }

      if (selectedSchoolFullName) {
        request = request.eq("school", selectedSchoolFullName);
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
  // Read every page from raw_stat_rows but only the 'sport' column (lightweight)
  const PAGE_SIZE = 10000; // ~61,603 rows -> ~7 pages today; scales as you grow

  const allRows = await fetchPaginatedRows({
    pageSize: PAGE_SIZE,
    fetchPage: (page, pageSize) =>
      supabase
        .from("raw_stat_rows")
        .select("sport")
        .not("sport", "is", null) // ignore nulls
        .range(page * pageSize, (page + 1) * pageSize - 1)
  });

  // Normalize + de-duplicate (case-insensitive) + sort
  const seen = new Set();
  const out = [];
  for (const r of allRows || []) {
    const label = String(r?.sport || "").trim();
    if (!label) continue;                // drop blanks
    const key = label.toLowerCase();     // case-insensitive uniqueness
    if (!seen.has(key)) {
      seen.add(key);
      out.push(label);
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}