import { mountPublicTopNav } from "./components/publicTopNav.js";
import { attachSearchAutocomplete } from "./components/searchAutocomplete.js";
import {
  buildAthleteProfileHref,
  fetchPublicSearchRows,
  groupAthleteSearchResults,
  groupSchoolSearchResults,
} from "./services/publicEntityService.js";

const searchInput = document.getElementById("publicSearchInput");
const searchForm = document.getElementById("publicSearchForm");
const statusLine = document.getElementById("searchStatus");
const athletesContainer = document.getElementById("athleteResults");
const schoolsContainer = document.getElementById("schoolResults");

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
      window.location.href = buildAthleteProfileHref(result);
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
    const rows = await fetchPublicSearchRows(query, { limit: 90 });
    const athleteRows = groupAthleteSearchResults(rows, { query, limit: 12 });
    const schoolRows = groupSchoolSearchResults(rows, { limit: 12 });

    statusLine.textContent = `${athleteRows.length} athlete match(es) and ${schoolRows.length} school match(es)`;
    renderAthletes(athleteRows);
    renderSchools(schoolRows);
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Could not run search right now.";
    renderErrorState();
  }
}

function renderAthletes(rows) {
  if (!rows.length) {
    athletesContainer.innerHTML = `<div class="public-empty">No athlete matches.</div>`;
    return;
  }

  athletesContainer.innerHTML = rows
    .map((row) => {
      const sports = row.sports.length ? row.sports.slice(0, 3).join(" | ") : "Sport data pending";
      const seasons = row.seasonRange || "Season unknown";
      const classTag = row.classTag ? ` | ${row.classTag}` : "";

      return `
        <a class="public-result-card public-link-card" href="${buildAthleteProfileHref(row)}">
          <h3>${escapeHtml(row.displayName || row.athlete)}</h3>
          <p>${escapeHtml(row.school)}</p>
          <p class="muted">${escapeHtml(`${sports} | ${seasons}${classTag}`)}</p>
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
      const seasons = row.seasonRange || "No seasons yet";
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

function renderEmptyState() {
  const empty = `<div class="public-empty">Start typing to search.</div>`;
  athletesContainer.innerHTML = empty;
  schoolsContainer.innerHTML = empty;
}

function renderErrorState() {
  const empty = `<div class="public-empty">Search unavailable right now.</div>`;
  athletesContainer.innerHTML = empty;
  schoolsContainer.innerHTML = empty;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

