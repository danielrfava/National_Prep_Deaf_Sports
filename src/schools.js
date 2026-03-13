import { fetchPublicSchoolDirectory } from "./services/sportsService.js";
import { mountPublicTopNav } from "./components/publicTopNav.js";

mountPublicTopNav({ active: "schools" });

const statusLine = document.getElementById("schoolsStatus");
const schoolsGrid = document.getElementById("schoolsGrid");

loadSchools();

async function loadSchools() {
  statusLine.textContent = "Loading schools...";

  try {
    const schools = await fetchPublicSchoolDirectory();
    statusLine.textContent = `${schools.length} public school(s)`;

    if (!schools.length) {
      schoolsGrid.innerHTML = `<div class="public-empty">No public schools available.</div>`;
      return;
    }

    schoolsGrid.innerHTML = schools
      .map((school) => {
        const name = school.full_name || school.short_name || school.id;
        const division = school.division ? `Division ${String(school.division).toUpperCase()}` : "Division N/A";
        const hasRealSchoolId = school.id && !String(school.id).startsWith("signal:");
        const href = hasRealSchoolId
          ? `stats.html?school=${encodeURIComponent(school.id)}`
          : `stats.html?q=${encodeURIComponent(name)}`;

        return `
          <a class="public-result-card public-link-card" href="${href}">
            <h3>${escapeHtml(name)}</h3>
            <p class="muted">${escapeHtml(division)}</p>
          </a>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Could not load schools.";
    schoolsGrid.innerHTML = `<div class="public-empty">School directory unavailable right now.</div>`;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
