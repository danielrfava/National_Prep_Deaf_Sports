import { supabase } from "../supabaseClient.js";

export function attachSearchAutocomplete(input, options = {}) {
  if (!input) return { destroy: () => {} };

  const {
    maxRows = 8,
    minChars = 2,
    onSelect = defaultSelectHandler,
  } = options;

  const form = input.closest("form") || input.parentElement;
  if (!form) return { destroy: () => {} };

  let wrap = input.closest(".search-preview-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "search-preview-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  let dropdown = null;
  let debounceId = null;
  let latestRequest = 0;

  async function onInput() {
    const query = String(input.value || "").trim();
    if (query.length < minChars) {
      clearDropdown();
      return;
    }

    if (debounceId) {
      window.clearTimeout(debounceId);
    }

    debounceId = window.setTimeout(async () => {
      const requestId = ++latestRequest;
      const results = await fetchPreviewResults(query, maxRows);
      if (requestId !== latestRequest) return;

      renderDropdown(query, results);
    }, 180);
  }

  function onBlur() {
    window.setTimeout(() => clearDropdown(), 120);
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      clearDropdown();
    }
  }

  input.addEventListener("input", onInput);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKeydown);

  function clearDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }

  function renderDropdown(query, results) {
    clearDropdown();

    if (!results.length) {
      return;
    }

    dropdown = document.createElement("div");
    dropdown.className = "search-preview-dropdown";

    const list = document.createElement("ul");
    list.className = "search-preview-list";

    results.forEach((result) => {
      const li = document.createElement("li");
      li.className = "search-preview-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-preview-button";
      btn.innerHTML = `
        <span class="search-preview-type">${escapeHtml(result.typeLabel)}</span>
        <span class="search-preview-title">${escapeHtml(result.title)}</span>
        <span class="search-preview-meta">${escapeHtml(result.meta)}</span>
      `;
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => {
        clearDropdown();
        onSelect(result);
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    dropdown.appendChild(list);

    const footer = document.createElement("div");
    footer.className = "search-preview-footer";
    footer.innerHTML = `
      <a class="search-preview-view-all" href="search.html?q=${encodeURIComponent(query)}">View all results for "${escapeHtml(
        query
      )}"</a>
    `;
    dropdown.appendChild(footer);

    wrap.appendChild(dropdown);
  }

  return {
    destroy() {
      input.removeEventListener("input", onInput);
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKeydown);
      clearDropdown();
    },
  };
}

async function fetchPreviewResults(query, maxRows) {
  const safe = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${safe}%`;

  const filters = [
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

  let response = await baseQuery().or(filters);
  if (response.error) {
    response = await baseQuery().or(
      [`school.ilike.${like}`, `sport.ilike.${like}`, `season.ilike.${like}`].join(",")
    );
  }

  if (response.error) {
    console.error(response.error);
    return [];
  }

  const rows = response.data || [];
  const athleteItems = buildAthleteItems(rows);
  const schoolItems = buildSchoolItems(rows);
  const recordItems = buildRecordItems(rows);

  return [...athleteItems, ...schoolItems, ...recordItems].slice(0, maxRows);
}

function buildAthleteItems(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const athlete = extractAthleteName(row.stat_row);
    if (!athlete) return;

    const school = String(row.school || "Unknown School").trim();
    const key = `${athlete.toLowerCase()}::${school.toLowerCase()}`;

    if (!groups.has(key)) {
      groups.set(key, {
        type: "athlete",
        typeLabel: "Athlete",
        title: athlete,
        school,
        schoolId: row.school_id || "",
        sports: new Set(),
        seasons: new Set(),
      });
    }

    const item = groups.get(key);
    if (row.sport) item.sports.add(row.sport);
    if (row.season) item.seasons.add(row.season);
  });

  return Array.from(groups.values())
    .map((item) => {
      const sports = Array.from(item.sports).slice(0, 3).join(" | ") || "Sport unknown";
      const seasons = buildSeasonRange(Array.from(item.seasons));
      return {
        ...item,
        meta: `${item.school} | ${sports}${seasons ? ` | ${seasons}` : ""}`,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 5);
}

function buildSchoolItems(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const school = String(row.school || "").trim();
    if (!school) return;

    const key = school.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        type: "school",
        typeLabel: "School",
        title: school,
        schoolId: row.school_id || "",
        sports: new Set(),
      });
    }

    const item = groups.get(key);
    if (!item.schoolId && row.school_id) item.schoolId = row.school_id;
    if (row.sport) item.sports.add(row.sport);
  });

  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      meta: item.sports.size
        ? `Sports: ${Array.from(item.sports).slice(0, 3).join(", ")}`
        : "School records",
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 2);
}

function buildRecordItems(rows) {
  return rows
    .slice(0, 3)
    .map((row) => {
      const athlete = extractAthleteName(row.stat_row) || "Unknown athlete";
      const sport = row.sport || "Unknown sport";
      const school = row.school || "Unknown school";
      const season = row.season || "";
      return {
        type: "record",
        typeLabel: "Record",
        title: athlete,
        query: athlete,
        schoolId: row.school_id || "",
        meta: `${school} | ${sport}${season ? ` | ${season}` : ""}`,
      };
    });
}

function buildSeasonRange(seasons) {
  const clean = seasons
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort();

  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  return `${clean[0]}-${clean[clean.length - 1]}`;
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

function defaultSelectHandler(result) {
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
  window.location.href = `search.html?q=${encodeURIComponent(query)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

