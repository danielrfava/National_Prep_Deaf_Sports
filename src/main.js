import { fetchSchools, fetchSportsList, fetchSportsRecords } from "./services/sportsService.js";
import { renderRecords } from "./components/renderRecords.js";

const filterInput = document.querySelector("#athleteFilter");
const status = document.querySelector("#status");
const recordsContainer = document.querySelector("#records");
const schoolFilter = document.querySelector("#schoolFilter");
const divisionFilter = document.querySelector("#divisionFilter");
const sportFilter = document.querySelector("#sportFilter");
const footballVariantFilter = document.querySelector("#footballVariantFilter");
const footballVariantFilterField = document.querySelector("#footballVariantFilterField");
const statsViewFilter = document.querySelector("#statsViewFilter");
const sportsMenu = document.querySelector("#sportsMenu");
const sportsMenuGrid = document.querySelector("#sportsMenuGrid");
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
const modePanels = Array.from(document.querySelectorAll("[data-mode-panel]"));

let activeRequest = 0;
let debounceId = null;
let currentMode = "individual";

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
  const filters = {
    schoolId: schoolFilter.value,
    sport: sportFilter.value,
    division: divisionFilter.value,
    footballVariant: footballVariantFilter ? footballVariantFilter.value : ''
  };
  console.log('Built filters:', filters);
  console.log('  schoolFilter.value = "' + schoolFilter.value + '" (length: ' + schoolFilter.value.length + ')');
  console.log('  sportFilter.value = "' + sportFilter.value + '" (length: ' + sportFilter.value.length + ')');
  return filters;
}

function toggleFootballVariantFilter() {
  if (!footballVariantFilterField || !sportFilter) return;
  
  const selectedSport = sportFilter.value.toLowerCase();
  const isFootball = selectedSport.includes('football');
  
  footballVariantFilterField.style.display = isFootball ? 'flex' : 'none';
  
  // Reset filter when hiding
  if (!isFootball && footballVariantFilter) {
    footballVariantFilter.value = '';
  }
}

function setOptions(select, options, getLabel) {
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = getLabel(option);
    select.appendChild(item);
  });
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

  if (mode === "individual") {
    runSearch(filterInput.value.trim());
    return;
  }

  updateStatus("");
}

function setupModeTabs() {
  if (!modeTabs.length || !modePanels.length) {
    return;
  }

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

async function runSearch(query) {
  if (currentMode !== "individual") {
    return;
  }

  const requestId = ++activeRequest;
  updateStatus(query ? "Searching..." : "Loading records...");

  try {
    const filters = buildFilters();
    const records = await fetchSportsRecords(query, filters);

    if (requestId !== activeRequest) {
      return;
    }

     const statsView = statsViewFilter ? statsViewFilter.value : 'season';
    // 🔥 store original raw data
      renderRecords(recordsContainer, statsView, filters, records);

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


let allSchools = [];

async function init() {
  setupSportsMenu();
  setupModeTabs();
  setMode("individual");
  updateStatus("Loading filters...");

  try {
    const [schools, sports] = await Promise.all([fetchSchools(), fetchSportsList()]);
    allSchools = schools;
    updateSchoolFilter();

    // Populate sports dropdown
    sportFilter.innerHTML = "<option value=''>All sports</option>";
    sports.forEach(sport => {
      const item = document.createElement("option");
      item.value = sport;
      item.textContent = sport;
      sportFilter.appendChild(item);
    });

    // School filter population by division
    function updateSchoolOptions() {
      const division = divisionFilter.value;
      let filteredSchools = schools;
      if (division === "d1") {
        // Division 1 schools (Big 6)
        filteredSchools = schools.filter(school => [
          "msd", "mssd", "csd-fremont", "csd-riverside", "isd", "tsd"
        ].includes(school.id));
      } else if (division === "d2") {
        filteredSchools = schools.filter(school => school.division === "d2");
      }
      // Always include 'All schools' as the first option
      schoolFilter.innerHTML = "<option value=''>All schools</option>";
      filteredSchools.forEach(school => {
        const item = document.createElement("option");
        item.value = school.id;
        item.textContent = school.full_name || school.short_name || school.id;
        schoolFilter.appendChild(item);
      });
    }
    // Initial population
    updateSchoolOptions();
    // Division filter event
    divisionFilter.addEventListener("change", () => {
      updateSchoolOptions();
      schoolFilter.selectedIndex = 0;
      runSearch(filterInput.value.trim());
    });
    // Ensure filters are reset to "All" after loading options
    setTimeout(() => {
      schoolFilter.selectedIndex = 0; // Select first option ("All schools")
      sportFilter.selectedIndex = 0; // Select first option ("All sports")
      runSearch("");
    }, 100);
  } catch (error) {
    console.error(error);
  }
}

function updateSchoolFilter() {
  // Save current selection
  const prevValue = schoolFilter.value;
  // Clear options
  schoolFilter.innerHTML = '<option value="">All schools</option>';
  let filteredSchools = allSchools;
  if (divisionFilter && divisionFilter.value) {
    filteredSchools = allSchools.filter(s => (s.division || '').toLowerCase() === divisionFilter.value.toLowerCase());
  }
  filteredSchools.forEach((school) => {
    const option = document.createElement('option');
    option.value = school.id;
    option.textContent = school.full_name || school.short_name || school.id;
    schoolFilter.appendChild(option);
  });
  // Try to restore previous selection if possible
  if (prevValue) {
    schoolFilter.value = prevValue;
  }
}


filterInput.addEventListener("input", applyFilter);
schoolFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
sportFilter.addEventListener("change", () => {
  toggleFootballVariantFilter();
  runSearch(filterInput.value.trim());
});
if (divisionFilter) {
  divisionFilter.addEventListener("change", () => {
    updateSchoolFilter();
    runSearch(filterInput.value.trim());
  });
}
if (footballVariantFilter) {
  footballVariantFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
}
if (statsViewFilter) {
  statsViewFilter.addEventListener("change", () => runSearch(filterInput.value.trim()));
}

init();
