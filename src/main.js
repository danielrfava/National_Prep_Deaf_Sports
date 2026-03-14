import { fetchSchools, fetchSportsList, fetchSportsRecords, fetchSeasonsList } from "./services/sportsService.js";
import { renderRecords } from "./components/renderRecords.js";
import { mountPublicTopNav } from "./components/publicTopNav.js";

const filterInput = document.querySelector("#athleteFilter");
const status = document.querySelector("#status");
const recordsContainer = document.querySelector("#records");
const schoolFilter = document.querySelector("#schoolFilter");
const divisionFilter = document.querySelector("#divisionFilter");
const sportFilter = document.querySelector("#sportFilter");
const seasonFilter = document.querySelector("#seasonFilter");
const footballVariantFilter = document.querySelector("#footballVariantFilter");
const footballVariantFilterField = document.querySelector("#footballVariantFilterField");
const statsViewFilter = document.querySelector("#statsViewFilter");
const applyFiltersBtn = document.querySelector("#applyFiltersBtn");

let activeRequest = 0;
let allSchools = [];
let hasAppliedFilters = false;

mountPublicTopNav({ active: "research" });

window.addEventListener("DOMContentLoaded", init);

function updateStatus(message) {
  if (status) {
    status.textContent = message;
  }
}

function buildFilters() {
  return {
    schoolId: schoolFilter?.value || "",
    sport: sportFilter?.value || "",
    division: divisionFilter?.value || "",
    season: seasonFilter?.value || "",
    footballVariant: footballVariantFilter?.value || "",
    maxRows: 3000,
  };
}

function hasMeaningfulFilters(query, filters) {
  return Boolean(
    query ||
      filters.schoolId ||
      filters.sport ||
      filters.division ||
      filters.season ||
      filters.footballVariant
  );
}

function renderResearchEmptyState(message = "Select filters, then click Explore Records.") {
  if (!recordsContainer) return;

  recordsContainer.innerHTML = `
    <div class="public-empty">
      ${escapeHtml(message)}
    </div>
  `;
}

function toggleFootballVariantFilter() {
  if (!footballVariantFilterField || !sportFilter) return;

  const selectedSport = String(sportFilter.value || "").toLowerCase();
  const isFootball = selectedSport.includes("football");

  footballVariantFilterField.style.display = isFootball ? "flex" : "none";

  if (!isFootball && footballVariantFilter) {
    footballVariantFilter.value = "";
  }
}

function onFiltersChanged() {
  hasAppliedFilters = false;
  updateStatus("Select filters, then click Explore Records.");
  renderResearchEmptyState("Select filters, then click Explore Records.");
}

async function runSearch({ force = false } = {}) {
  const query = (filterInput?.value || "").trim();
  const filters = buildFilters();

  if (!hasMeaningfulFilters(query, filters)) {
    hasAppliedFilters = false;
    updateStatus("Select filters, then click Explore Records.");
    renderResearchEmptyState("Select filters, then click Explore Records.");
    return;
  }

  if (!hasAppliedFilters && !force) {
    updateStatus("Click Explore Records to load results.");
    return;
  }

  hasAppliedFilters = true;

  const requestId = ++activeRequest;
  updateStatus("Loading records...");

  try {
    const records = await fetchSportsRecords(query, filters);

    if (requestId !== activeRequest) {
      return;
    }

    const statsView = statsViewFilter ? statsViewFilter.value : "season";
    const renderSummary = renderRecords(recordsContainer, statsView, filters, records);

    if (!renderSummary?.renderedCount) {
      updateStatus("No records found.");
      return;
    }

    updateStatus(`${renderSummary.renderedCount} record(s) shown.`);
  } catch (error) {
    if (requestId !== activeRequest) {
      return;
    }

    console.error(error);
    updateStatus("Unable to load records right now.");
    renderResearchEmptyState("Could not load records.");
  }
}

function updateSchoolFilter() {
  if (!schoolFilter) return;

  const prevValue = schoolFilter.value;
  schoolFilter.innerHTML = '<option value="">All schools</option>';

  let filteredSchools = allSchools;
  if (divisionFilter && divisionFilter.value) {
    filteredSchools = allSchools.filter(
      (school) => String(school.division || "").toLowerCase() === divisionFilter.value.toLowerCase()
    );
  }

  filteredSchools.forEach((school) => {
    const option = document.createElement("option");
    option.value = school.id;
    option.textContent = school.full_name || school.short_name || school.id;
    schoolFilter.appendChild(option);
  });

  if (prevValue) {
    schoolFilter.value = prevValue;
  }
}

function populateSimpleSelect(select, values, placeholder) {
  if (!select) return;

  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function applyInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const initialQuery = (params.get("q") || "").trim();
  const initialSchool = (params.get("school") || "").trim();
  const initialSport = (params.get("sport") || "").trim();
  const initialSeason = (params.get("season") || "").trim();

  if (initialQuery && filterInput) {
    filterInput.value = initialQuery;
  }

  if (initialSchool && schoolFilter) {
    schoolFilter.value = initialSchool;
  }

  if (initialSport && sportFilter) {
    sportFilter.value = initialSport;
    toggleFootballVariantFilter();
  }

  if (initialSeason && seasonFilter) {
    seasonFilter.value = initialSeason;
  }

}

async function init() {
  updateStatus("Loading filters...");

  try {
    const [schools, sports, seasons] = await Promise.all([
      fetchSchools(),
      fetchSportsList(),
      fetchSeasonsList(),
    ]);

    allSchools = schools || [];
    updateSchoolFilter();

    populateSimpleSelect(sportFilter, sports || [], "All sports");
    populateSimpleSelect(seasonFilter, seasons || [], "All seasons");

    applyInitialParams();

    hasAppliedFilters = false;
    updateStatus("Select filters, then click Explore Records.");
    renderResearchEmptyState("Select filters, then click Explore Records.");
  } catch (error) {
    console.error(error);
    updateStatus("Could not load filters.");
    renderResearchEmptyState("Filter setup failed.");
  }
}

if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener("click", () => {
    runSearch({ force: true });
  });
}

if (filterInput) {
  filterInput.addEventListener("input", onFiltersChanged);
}

if (schoolFilter) {
  schoolFilter.addEventListener("change", onFiltersChanged);
}

if (sportFilter) {
  sportFilter.addEventListener("change", () => {
    toggleFootballVariantFilter();
    onFiltersChanged();
  });
}

if (seasonFilter) {
  seasonFilter.addEventListener("change", onFiltersChanged);
}

if (divisionFilter) {
  divisionFilter.addEventListener("change", () => {
    updateSchoolFilter();
    onFiltersChanged();
  });
}

if (footballVariantFilter) {
  footballVariantFilter.addEventListener("change", onFiltersChanged);
}

if (statsViewFilter) {
  statsViewFilter.addEventListener("change", () => {
    if (hasAppliedFilters) {
      runSearch({ force: true });
      return;
    }

    onFiltersChanged();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
