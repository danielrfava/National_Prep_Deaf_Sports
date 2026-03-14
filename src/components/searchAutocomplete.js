import {
  buildAthleteProfileHref,
  fetchPublicSearchRows,
  groupAthleteSearchResults,
  groupSchoolSearchResults,
} from "../services/publicEntityService.js";

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
  try {
    const rows = await fetchPublicSearchRows(query, { limit: 60 });
    const athleteItems = buildAthleteItems(rows, query);
    const schoolItems = buildSchoolItems(rows);
    return [...athleteItems, ...schoolItems].slice(0, maxRows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function buildAthleteItems(rows, query) {
  return groupAthleteSearchResults(rows, { query, limit: 5 }).map((item) => ({
    ...item,
    type: "athlete",
    typeLabel: "Athlete",
    title: item.displayName || item.athlete,
    meta: `${item.school} | ${item.sports.slice(0, 3).join(" | ") || "Sport unknown"}${
      item.seasonRange ? ` | ${item.seasonRange}` : ""
    }${item.classTag ? ` | ${item.classTag}` : ""}`,
  }));
}

function buildSchoolItems(rows) {
  return groupSchoolSearchResults(rows, { limit: 2 }).map((item) => ({
    ...item,
    type: "school",
    typeLabel: "School",
    title: item.school,
    meta: item.sports.length
      ? `Sports: ${item.sports.slice(0, 3).join(", ")}${item.seasonRange ? ` | ${item.seasonRange}` : ""}`
      : "School records",
  }));
}

function defaultSelectHandler(result) {
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

