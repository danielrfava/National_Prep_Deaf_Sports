import { supabase } from "./supabaseClient.js";
import { mountPublicTopNav } from "./components/publicTopNav.js";
import { attachSearchAutocomplete } from "./components/searchAutocomplete.js";

const searchInput = document.getElementById("publicSearchInput");
const searchForm = document.getElementById("publicSearchForm");
const statusLine = document.getElementById("searchStatus");
const athletesContainer = document.getElementById("athleteResults");
const schoolsContainer = document.getElementById("schoolResults");
const recordsContainer = document.getElementById("recordResults");

let debounceId = null;

mountPublicTopNav({ active: "search" });

const params = new URLSearchParams(window.location.search);
const initialQuery = (params.get("q") || "").trim();

if (initialQuery) {
  searchInput.value = initialQuery;
}

runSearch(initialQuery);

searchInput.addEventListener("input", () => {
  if (debounceId) {
    window.clearTimeout(debounceId);
  }

  debounceId = window.setTimeout(() => {
    const query = searchInput.value.trim();
    setQueryInUrl(query);
    runSearch(query);
  }, 260);
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  setQueryInUrl(query);
  runSearch(query);
});

attachSearchAutocomplete(searchInput, {
  onSelect(result) {
    if (result.type === "athlete") {
      const params = new URLSearchParams({
        name: result.title,
        school: result.school || "",
      });
      if (result.schoolId) {
        params.set("school_id", result.schoolId);
      }
      window.location.href = `athlete.html?${params.toString()}`;
      return;
    }

    if (result.type === "school") {
      if (result.schoolId) {
        window.location.href = `stats.html?school=${encodeURIComponent(result.schoolId)}`;
        return;
      }

      const schoolQuery = result.title || result.query || "";
      window.location.href = `stats.html${schoolQuery ? `?q=${encodeURIComponent(schoolQuery)}` : ""}`;
      return;
    }

    const query = result.query || result.title || "";
    searchInput.value = query;
    setQueryInUrl(query);
    runSearch(query);
  },
});

function setQueryInUrl(query) {
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set("q", query);
  } else {
    url.searchParams.delete("q");
  }
  window.history.replaceState({}, "", url.toString());
}

async function runSearch(query) {
  if (!query) {
    statusLine.textContent = "Type a name, school, sport, or season.";
    renderEmptyState();
    return;
  }

  statusLine.textContent = "Searching...";

  try {
    const rows = await fetchSearchRows(query);
    const athleteRows = extractAthleteGroups(rows);
    const schoolRows = extractSchoolGroups(rows);
    const recordRows = rows.slice(0, 12);

    statusLine.textContent = `${rows.length} record(s) found`;
    renderAthletes(athleteRows);
    renderSchools(schoolRows);
    renderRecords(recordRows);
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Could not run search right now.";
    renderErrorState();
  }
}

async function fetchSearchRows(query) {
  const safe = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${safe}%`;
  const richFilter = [
    `school.ilike.${like}`,
    `sport.ilike.${like}`,
    `season.ilike.${like}`,
    `stat_row->>Athlete Name.ilike.${like}`,
    `stat_row->>athlete_name.ilike.${like}`,
    `stat_row->>name.ilike.${like}`,
  ].join(",");

  const baseQuery = () =>
    supabase
      .from("raw_stat_rows")
      .select("id, school_id, school, sport, season, stat_row")
      .order("season", { ascending: false })
      .limit(120);

  let response = await baseQuery().or(richFilter);

  if (response.error) {
    const fallbackFilter = [
      `school.ilike.${like}`,
      `sport.ilike.${like}`,
      `season.ilike.${like}`,
    ].join(",");
    response = await baseQuery().or(fallbackFilter);
  }

  if (response.error) {
    throw response.error;
  }

  return response.data || [];
}

function extractAthleteName(statRow) {
  if (!statRow || typeof statRow !== "object") return "";

  return String(
    statRow["Athlete Name"] ||
      statRow.athlete_name ||
      statRow.player_name ||
      statRow.player ||
      statRow.name ||
      ""
  ).trim();
}

function extractAthleteGroups(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const athlete = extractAthleteName(row.stat_row);
    if (!athlete) return;

    const school = String(row.school || "Unknown School");
    const key = `${athlete.toLowerCase()}::${school.toLowerCase()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        athlete,
        school,
        sports: new Set(),
        seasons: new Set(),
      });
    }

    const item = grouped.get(key);
    if (row.sport) item.sports.add(row.sport);
    if (row.season) item.seasons.add(row.season);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      athlete: item.athlete,
      school: item.school,
      sports: Array.from(item.sports).slice(0, 3),
      seasons: Array.from(item.seasons).sort().slice(-2),
    }))
    .sort((a, b) => a.athlete.localeCompare(b.athlete))
    .slice(0, 12);
}

function extractSchoolGroups(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const school = String(row.school || "").trim();
    if (!school) return;

    if (!grouped.has(school.toLowerCase())) {
      grouped.set(school.toLowerCase(), {
        school,
        sports: new Set(),
        seasons: new Set(),
        schoolId: row.school_id || "",
      });
    }

    const item = grouped.get(school.toLowerCase());
    if (!item.schoolId && row.school_id) item.schoolId = row.school_id;
    if (row.sport) item.sports.add(row.sport);
    if (row.season) item.seasons.add(row.season);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      school: item.school,
      schoolId: item.schoolId,
      sports: Array.from(item.sports).slice(0, 3),
      seasons: Array.from(item.seasons).sort().slice(-2),
    }))
    .sort((a, b) => a.school.localeCompare(b.school))
    .slice(0, 12);
}

function renderAthletes(rows) {
  if (!rows.length) {
    athletesContainer.innerHTML = `<div class="public-empty">No athlete matches.</div>`;
    return;
  }

  athletesContainer.innerHTML = rows
    .map((row) => {
      const sports = row.sports.length ? row.sports.join(" | ") : "Sport data pending";
      const seasons = row.seasons.length ? row.seasons.join(", ") : "Season unknown";
      const params = new URLSearchParams({
        name: row.athlete,
        school: row.school,
      });
      if (row.schoolId) {
        params.set("school_id", row.schoolId);
      }

      return `
        <a class="public-result-card public-link-card" href="athlete.html?${params.toString()}">
          <h3>${escapeHtml(row.athlete)}</h3>
          <p>${escapeHtml(row.school)}</p>
          <p class="muted">${escapeHtml(`${sports} | ${seasons}`)}</p>
        </a>
      `;
    })
    .join("");
}

function renderSchools(rows) {
  if (!rows.length) {
    schoolsContainer.innerHTML = `<div class="public-empty">No school matches.</div>`;
    return;
  }

  schoolsContainer.innerHTML = rows
    .map((row) => {
      const sports = row.sports.length ? row.sports.join(", ") : "No sports yet";
      const seasons = row.seasons.length ? row.seasons.join(", ") : "No seasons yet";
      const href = row.schoolId
        ? `stats.html?school=${encodeURIComponent(row.schoolId)}`
        : `stats.html?q=${encodeURIComponent(row.school)}`;

      return `
        <a class="public-result-card public-link-card" href="${href}">
          <h3>${escapeHtml(row.school)}</h3>
          <p class="muted">Sports: ${escapeHtml(sports)}</p>
          <p class="muted">Seasons: ${escapeHtml(seasons)}</p>
        </a>
      `;
    })
    .join("");
}

function renderRecords(rows) {
  if (!rows.length) {
    recordsContainer.innerHTML = `<div class="public-empty">No record matches.</div>`;
    return;
  }

  recordsContainer.innerHTML = rows
    .map((row) => {
      const athlete = extractAthleteName(row.stat_row) || "Unknown athlete";
      const sport = row.sport || "Unknown sport";
      const school = row.school || "Unknown school";
      const season = row.season || "Unknown season";
      const href = `stats.html?q=${encodeURIComponent(athlete)}${row.school_id ? `&school=${encodeURIComponent(row.school_id)}` : ""}`;

      return `
        <a class="public-result-card public-link-card" href="${href}">
          <h3>${escapeHtml(athlete)}</h3>
          <p>${escapeHtml(`${school} | ${sport}`)}</p>
          <p class="muted">${escapeHtml(`Season: ${season}`)}</p>
        </a>
      `;
    })
    .join("");
}

function renderEmptyState() {
  const empty = `<div class="public-empty">Start typing to search.</div>`;
  athletesContainer.innerHTML = empty;
  schoolsContainer.innerHTML = empty;
  recordsContainer.innerHTML = empty;
}

function renderErrorState() {
  const empty = `<div class="public-empty">Search unavailable right now.</div>`;
  athletesContainer.innerHTML = empty;
  schoolsContainer.innerHTML = empty;
  recordsContainer.innerHTML = empty;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

