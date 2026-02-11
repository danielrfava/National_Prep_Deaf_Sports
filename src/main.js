import { fetchSchools, fetchSportsList, fetchSportsRecords } from "./services/sportsService.js";
import { renderRecords } from "./components/renderRecords.js";

const filterInput = document.querySelector("#athleteFilter");
const status = document.querySelector("#status");
const recordsContainer = document.querySelector("#records");
const schoolFilter = document.querySelector("#schoolFilter");
const divisionFilter = document.querySelector("#divisionFilter");
const sportFilter = document.querySelector("#sportFilter");
const genderFilter = document.querySelector("#genderFilter");
const deaflympicsFilter = document.querySelector("#deaflympicsFilter");
const recordScopeFilter = document.querySelector("#recordScopeFilter");
const sportsMenu = document.querySelector("#sportsMenu");
const sportsMenuGrid = document.querySelector("#sportsMenuGrid");

let activeRequest = 0;
let debounceId = null;

function updateStatus(message) {
  status.textContent = message;
}

function getNavData() {
  return {
    sportsTabs: [
      {
        label: "Basketball",
        key: "basketball",
        items: [
          { label: "HS Boys", href: "/sports/basketball/hs-boys" },
          { label: "HS Girls (Phase 2)", href: "/sports/basketball/hs-girls" },
          { label: "Collegiate Men (Future)", href: "/sports/basketball/collegiate/men" },
          { label: "Collegiate Women (Future)", href: "/sports/basketball/collegiate/women" }
        ]
      },
      {
        label: "Volleyball",
        key: "volleyball",
        items: [
          { label: "HS Boys (Phase 2)", href: "/sports/volleyball/hs-boys" },
          { label: "HS Girls (Phase 2)", href: "/sports/volleyball/hs-girls" }
        ]
      },
      {
        label: "Football",
        key: "football",
        items: [
          { label: "8-Man (Future)", href: "/sports/football/8-man" },
          { label: "11-Man (Archived)", href: "/sports/football/11-man" }
        ]
      },
      {
        label: "Wrestling",
        key: "wrestling",
        items: [{ label: "Overview (Phase 2)", href: "/sports/wrestling" }]
      },
      {
        label: "Track & Field",
        key: "track",
        items: [
          { label: "HS Boys (Phase 2)", href: "/sports/track/hs-boys" },
          { label: "HS Girls (Phase 2)", href: "/sports/track/hs-girls" }
        ]
      },
      {
        label: "Softball",
        key: "softball",
        items: [{ label: "Overview (Phase 2)", href: "/sports/softball" }]
      },
      {
        label: "Cheerleading",
        key: "cheerleading",
        items: [{ label: "Overview (Phase 2)", href: "/sports/cheerleading" }]
      },
      {
        label: "More Sports",
        key: "more",
        items: [
          { label: "Baseball (Future)", href: "/sports/baseball" },
          { label: "Soccer (Future)", href: "/sports/soccer" },
          { label: "Cross Country (Future)", href: "/sports/cross-country" }
        ]
      }
    ]
  };
}

function renderSportsMenu(navData) {
  if (!sportsMenuGrid) {
    return;
  }

  sportsMenuGrid.innerHTML = navData.sportsTabs
    .map((sport) => {
      const items = sport.items
        .map((item) => `<li><a class="menu-link" href="${item.href}">${item.label}</a></li>`)
        .join("");

      return `
        <div class="col">
          <div class="col-title">${sport.label}</div>
          <ul class="link-list">${items}</ul>
        </div>
      `;
    })
    .join("");
}

function setupSportsMenu() {
  renderSportsMenu(getNavData());

  if (!sportsMenu) {
    return;
  }

  document.addEventListener("pointerdown", (event) => {
    if (!sportsMenu.open) {
      return;
    }

    if (!sportsMenu.contains(event.target)) {
      sportsMenu.open = false;
    }
  });

  sportsMenu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      sportsMenu.open = false;
    }
  });
}

function buildFilters() {
  return {
    schoolId: schoolFilter.value,
    division: divisionFilter.value,
    sport: sportFilter.value,
    gender: genderFilter.value,
    deaflympics: deaflympicsFilter.value,
    recordScope: recordScopeFilter.value
  };
}

function setOptions(select, options, getLabel) {
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = getLabel(option);
    select.appendChild(item);
  });
}

async function runSearch(query) {
  const requestId = ++activeRequest;
  updateStatus(query ? "Searching..." : "Loading records...");

  try {
    const filters = buildFilters();
    const records = await fetchSportsRecords(query, filters);

    if (requestId !== activeRequest) {
      return;
    }

    renderRecords(records, recordsContainer);
    updateStatus(query ? `${records.length} record(s) match.` : "");
  } catch (error) {
    if (requestId !== activeRequest) {
      return;
    }

    updateStatus("Unable to load records. Check Supabase connection.");
    console.error(error);
  }
}

function applyFilter() {
  const query = filterInput.value.trim();

  if (debounceId) {
    window.clearTimeout(debounceId);
  }

  debounceId = window.setTimeout(() => {
    runSearch(query);
  }, 300);
}

async function init() {
  setupSportsMenu();
  updateStatus("Loading filters...");

  try {
    const [schools, sports] = await Promise.all([fetchSchools(), fetchSportsList()]);

    setOptions(
      schoolFilter,
      schools.map((school) => ({
        value: school.id,
        label: school.full_name || school.short_name || school.id
      })),
      (option) => option.label
    );

    setOptions(
      sportFilter,
      sports.map((sport) => ({ value: sport, label: sport })),
      (option) => option.label
    );
  } catch (error) {
    console.error(error);
  }

  runSearch("");
}

filterInput.addEventListener("input", applyFilter);
schoolFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
divisionFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
sportFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
genderFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
deaflympicsFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
recordScopeFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));

init();
