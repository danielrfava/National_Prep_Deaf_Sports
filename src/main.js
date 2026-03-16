import {
  fetchSchools,
  fetchSportsList,
  fetchSportsRecords,
  fetchSeasonsList,
  fetchStatsFilterMetadata,
} from "./services/sportsService.js";
import { renderRecords } from "./components/renderRecords.js";
import { mountPublicTopNav } from "./components/publicTopNav.js";
import { isFootballSportValue, populateFootballFormatSelect } from "./footballFormat.js";
import { resolveSportContext } from "./sportContext.js";

const filterInput = document.querySelector("#athleteFilter");
const status = document.querySelector("#status");
const recordsContainer = document.querySelector("#records");
const schoolFilter = document.querySelector("#schoolFilter");
const divisionFilter = document.querySelector("#divisionFilter");
const sportFilter = document.querySelector("#sportFilter");
const seasonFilter = document.querySelector("#seasonFilter");
const footballFormatFilter = document.querySelector("#footballFormatFilter");
const footballFormatFilterField = document.querySelector("#footballFormatFilterField");
const statsViewFilter = document.querySelector("#statsViewFilter");
const applyFiltersBtn = document.querySelector("#applyFiltersBtn");

let activeRequest = 0;
let allSchools = [];
let allMetadataRows = [];
let allSportOptions = [];
let hasAppliedFilters = false;

mountPublicTopNav({ active: "research" });

window.addEventListener("DOMContentLoaded", init);

function updateStatus(message) {
  if (status) {
    status.textContent = message;
  }
}

function parseSeasonStartYear(value) {
  const text = String(value || "").trim();
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

function buildFilters() {
  const sport = sportFilter?.value || "";
  const isFootball = isFootballSportValue(sport);

  return {
    schoolId: schoolFilter?.value || "",
    sport,
    division: normalizeDivisionValue(divisionFilter?.value),
    season: seasonFilter?.value || "",
    footballFormat: isFootball ? footballFormatFilter?.value || "" : "",
  };
}

function hasMeaningfulFilters(query, filters) {
  return Boolean(
    query ||
      filters.schoolId ||
      filters.sport ||
      filters.division ||
      filters.season ||
      filters.footballFormat
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

function toggleFootballFormatFilter() {
  if (!footballFormatFilterField || !sportFilter) return;

  const selectedSport = String(sportFilter.value || "");
  const isFootball = isFootballSportValue(selectedSport);

  footballFormatFilterField.style.display = isFootball ? "flex" : "none";

  if (!isFootball && footballFormatFilter) {
    footballFormatFilter.value = "";
  }
}

function normalizeDivisionValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["d1", "division 1", "division1", "1"].includes(normalized)) {
    return "d1";
  }

  if (["d2", "division 2", "division2", "2"].includes(normalized)) {
    return "d2";
  }

  return "";
}

function getSelectedSportOption(value = sportFilter?.value || "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    allSportOptions.find((option) => String(option?.value || "").trim().toLowerCase() === normalized) || null
  );
}

function getSelectedDivisionSchoolIds() {
  const normalizedDivision = normalizeDivisionValue(divisionFilter?.value);
  if (!normalizedDivision) {
    return null;
  }

  return new Set(
    allSchools
      .filter((school) => normalizeDivisionValue(school?.division) === normalizedDivision)
      .map((school) => String(school?.id || "").trim())
      .filter(Boolean)
  );
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

function getSelectedMetadataRows() {
  const selectedSportOption = getSelectedSportOption();
  const divisionSchoolIds = getSelectedDivisionSchoolIds();

  return (allMetadataRows || []).filter((row) => {
    if (selectedSportOption) {
      if (
        String(row?.sportKey || "").trim().toLowerCase() !==
        String(selectedSportOption.sportKey || "").trim().toLowerCase()
      ) {
        return false;
      }

      if (
        selectedSportOption.genderKey &&
        String(row?.genderKey || "").trim().toLowerCase() !==
          String(selectedSportOption.genderKey || "").trim().toLowerCase()
      ) {
        return false;
      }
    }

    if (divisionSchoolIds && !divisionSchoolIds.has(String(row?.schoolId || "").trim())) {
      return false;
    }

    return true;
  });
}

function updateSchoolFilter(metadataRows = []) {
  if (!schoolFilter) return;

  const prevValue = schoolFilter.value;
  schoolFilter.innerHTML = '<option value="">All schools</option>';

  const scopedRows = Array.isArray(metadataRows) ? metadataRows : [];
  const shouldScopeSchools = Boolean(getSelectedSportOption() || normalizeDivisionValue(divisionFilter?.value));
  const visibleSchoolIds = new Set(scopedRows.map((row) => String(row?.schoolId || "").trim()).filter(Boolean));
  const filteredSchools = shouldScopeSchools
    ? allSchools.filter((school) => visibleSchoolIds.has(String(school?.id || "").trim()))
    : allSchools;

  filteredSchools.forEach((school) => {
    const option = document.createElement("option");
    option.value = school.id;
    option.textContent = school.full_name || school.short_name || school.id;
    schoolFilter.appendChild(option);
  });

  if (prevValue && Array.from(schoolFilter.options).some((option) => option.value === prevValue)) {
    schoolFilter.value = prevValue;
  }
}

function updateSeasonFilter(metadataRows = []) {
  if (!seasonFilter) return;

  const shouldScopeSeasons = Boolean(getSelectedSportOption() || normalizeDivisionValue(divisionFilter?.value));
  const scopedRows = shouldScopeSeasons
    ? (Array.isArray(metadataRows) ? metadataRows : [])
    : allMetadataRows;
  const seasons = Array.from(
    new Set(scopedRows.map((row) => String(row?.season || "").trim()).filter(Boolean))
  ).sort(compareSeasonLabelsDesc);

  populateSimpleSelect(seasonFilter, seasons, "All seasons");
}

function refreshScopedFilterOptions() {
  const metadataRows = getSelectedMetadataRows();
  updateSchoolFilter(metadataRows);
  updateSeasonFilter(metadataRows);
}

function populateSimpleSelect(select, values, placeholder) {
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    if (value && typeof value === "object") {
      option.value = value.value ?? "";
      option.textContent = value.label ?? value.value ?? "";
    } else {
      option.value = value;
      option.textContent = value;
    }
    select.appendChild(option);
  });

  if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function resolveInitialSportSelection(initialSport, legacyBasketballGender = "") {
  const normalized = String(initialSport || "").trim().toLowerCase();
  if (!normalized) {
    return { sportValue: "" };
  }

  const exactMatch = allSportOptions.find((option) => {
    const optionValue = String(option?.value || "").trim().toLowerCase();
    const optionLabel = String(option?.label || "").trim().toLowerCase();
    return optionValue === normalized || optionLabel === normalized;
  });

  if (exactMatch?.value) {
    return { sportValue: exactMatch.value };
  }

  const context = resolveSportContext(initialSport);
  if (context.sportKey === "basketball") {
    const explicitBasketballOption = allSportOptions.find((option) => {
      return (
        String(option?.sportKey || "").trim().toLowerCase() === "basketball" &&
        String(option?.genderKey || "").trim().toLowerCase() ===
          String(context.genderKey || legacyBasketballGender || "").trim().toLowerCase()
      );
    });

    return {
      sportValue: explicitBasketballOption?.value || "",
    };
  }

  return {
    sportValue: context.sportKey || "",
  };
}

function applyInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const initialQuery = (params.get("q") || "").trim();
  const initialSchool = (params.get("school") || "").trim();
  const initialSport = (params.get("sport") || "").trim();
  const initialDivisionRaw = (params.get("division") || "").trim().toLowerCase();
  const initialDivision = normalizeDivisionValue(initialDivisionRaw);
  const legacyBasketballGender = ["boys", "girls"].includes(initialDivisionRaw) ? initialDivisionRaw : "";
  const initialSeason = (params.get("season") || "").trim();
  const initialFootballFormat =
    (params.get("football_format") || params.get("footballFormat") || params.get("footballVariant") || "").trim();

  if (initialQuery && filterInput) {
    filterInput.value = initialQuery;
  }

  if (initialSchool && schoolFilter) {
    schoolFilter.value = initialSchool;
  }

  if (initialSport && sportFilter) {
    const resolvedSportSelection = resolveInitialSportSelection(initialSport, legacyBasketballGender);
    if (resolvedSportSelection.sportValue) {
      sportFilter.value = resolvedSportSelection.sportValue;
    }

    toggleFootballFormatFilter();
  }

  if (initialDivision && divisionFilter) {
    divisionFilter.value = initialDivision;
  }

  if (initialSeason && seasonFilter) {
    seasonFilter.value = initialSeason;
  }

  if (initialFootballFormat && footballFormatFilter) {
    footballFormatFilter.value = initialFootballFormat;
  }

}

async function init() {
  updateStatus("Loading filters...");

  try {
    const [schools, sports, seasons, metadataRows] = await Promise.all([
      fetchSchools(),
      fetchSportsList(),
      fetchSeasonsList(),
      fetchStatsFilterMetadata(),
    ]);

    allSchools = schools || [];
    allMetadataRows = metadataRows || [];
    allSportOptions = sports || [];
    updateSchoolFilter(allMetadataRows);

    populateSimpleSelect(sportFilter, allSportOptions, "All sports");
    populateSimpleSelect(seasonFilter, seasons || [], "All seasons");
    populateFootballFormatSelect(footballFormatFilter, {
      includeBlank: false,
      includeAll: true,
      allLabel: "All Football Formats",
    });

    applyInitialParams();
    refreshScopedFilterOptions();
    toggleFootballFormatFilter();

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
    refreshScopedFilterOptions();
    toggleFootballFormatFilter();
    onFiltersChanged();
  });
}

if (seasonFilter) {
  seasonFilter.addEventListener("change", onFiltersChanged);
}

if (divisionFilter) {
  divisionFilter.addEventListener("change", () => {
    refreshScopedFilterOptions();
    onFiltersChanged();
  });
}

if (footballFormatFilter) {
  footballFormatFilter.addEventListener("change", onFiltersChanged);
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
