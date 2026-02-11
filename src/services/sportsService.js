import { supabase } from "../supabaseClient.js";

function buildSearchFilter(query) {
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${escaped}%`;
  const parts = [
    `name.ilike.${like}`,
    `sport.ilike.${like}`,
    `location.ilike.${like}`,
    `team.ilike.${like}`,
    `school_name.ilike.${like}`
  ];

  if (/^\d{2,4}$/.test(query)) {
    parts.push(`year.eq.${query}`);
  }

  return parts.join(",");
}

export async function fetchSportsRecords(query = "", filters = {}) {
  let request = supabase
    .from("sports")
    .select("*")
    .limit(100);

  if (query) {
    request = request.or(buildSearchFilter(query));
  }

  if (filters.schoolId) {
    request = request.eq("school_id", filters.schoolId);
  }

  if (filters.division) {
    request = request.eq("division", filters.division);
  }

  if (filters.sport) {
    request = request.eq("sport", filters.sport);
  }

  if (filters.gender) {
    request = request.eq("gender", filters.gender);
  }

  if (filters.deaflympics !== "") {
    request = request.eq("deaflympics", filters.deaflympics === "true");
  }

  if (filters.recordScope) {
    request = request.eq("record_scope", filters.recordScope);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function fetchSchools() {
  const { data, error } = await supabase
    .from("schools")
    .select("id, short_name, full_name")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function fetchSportsList() {
  const { data, error } = await supabase.from("sports").select("sport").limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  const uniqueSports = new Set();
  (data || []).forEach((row) => {
    if (row?.sport) {
      uniqueSports.add(row.sport);
    }
  });

  return Array.from(uniqueSports).sort();
}
