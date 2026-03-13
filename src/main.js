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
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
const modePanels = Array.from(document.querySelectorAll("[data-mode-panel]"));

let activeRequest = 0;
let currentMode = "individual";
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

function renderResearchEmptyState(message = "Choose filters to explore records.") {
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

function setMode(mode) {
  currentMode = mode;

  modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  modePanels.forEach((panel) => {
    panel.hidden = panel.dataset.modePanel !== mode;
  });

  if (mode !== "individual") {
    updateStatus("");
    return;
  }

  if (!hasAppliedFilters) {
    updateStatus("Choose filters, then click Explore Records.");
    renderResearchEmptyState();
  }
}

function setupModeTabs() {
  if (!modeTabs.length || !modePanels.length) return;

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;
      if (!mode || mode === currentMode) {
        return;
      }

      setMode(mode);
    });
  });
}

function onFiltersChanged() {
  if (currentMode !== "individual") {
    return;
  }

  hasAppliedFilters = false;
  updateStatus("Filters updated. Click Explore Records.");
  renderResearchEmptyState("Select sport, school, season, or search text, then click Explore Records.");
}

async function runSearch({ force = false } = {}) {
  if (currentMode !== "individual") {
    return;
  }

  const query = (filterInput?.value || "").trim();
  const filters = buildFilters();

  if (!hasMeaningfulFilters(query, filters)) {
    hasAppliedFilters = false;
    updateStatus("Choose filters to explore records.");
    renderResearchEmptyState();
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
    renderRecords(recordsContainer, statsView, filters, records);
    updateStatus(`${records.length} record(s) loaded.`);
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

  return Boolean(initialQuery || initialSchool || initialSport || initialSeason);
}

async function init() {
  setupModeTabs();
  setMode("individual");
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

    const shouldAutoRun = applyInitialParams();

    if (shouldAutoRun) {
      hasAppliedFilters = true;
      await runSearch({ force: true });
      return;
    }

    hasAppliedFilters = false;
    updateStatus("Choose filters, then click Explore Records.");
    renderResearchEmptyState();
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
