import { supabase } from "./supabaseClient.js";
import { mountPublicTopNav } from "./components/publicTopNav.js";

mountPublicTopNav({ active: "search" });

const athleteNameEl = document.getElementById("athleteName");
const athleteMetaEl = document.getElementById("athleteMeta");
const athleteChipsEl = document.getElementById("athleteChips");
const sportsContainerEl = document.getElementById("sportsContainer");
const rankingsSectionEl = document.getElementById("rankingsSection");
const rankingsListEl = document.getElementById("rankingsList");

const params = new URLSearchParams(window.location.search);
const targetName = (params.get("name") || "").trim();
const targetSchoolId = (params.get("school_id") || "").trim();
const targetSchool = (params.get("school") || "").trim();

if (!targetName) {
  renderMissingProfile("Athlete not specified.");
} else {
  loadAthleteProfile().catch((error) => {
    console.error(error);
    renderMissingProfile("Could not load athlete profile.");
  });
}

async function loadAthleteProfile() {
  const rows = await fetchAthleteRows(targetName, targetSchoolId, targetSchool);
  if (!rows.length) {
    renderMissingProfile("No athlete records found.");
    return;
  }

  const profile = buildProfile(rows, targetName, targetSchool, targetSchoolId);
  renderProfile(profile);
}

async function fetchAthleteRows(name, schoolId, schoolName) {
  const safe = name.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${safe}%`;

  const athleteFilter = [
    `stat_row->>Athlete Name.ilike.${like}`,
    `stat_row->>athlete_name.ilike.${like}`,
    `stat_row->>name.ilike.${like}`,
    `stat_row->>player_name.ilike.${like}`,
  ].join(",");

  let request = supabase
    .from("raw_stat_rows")
    .select("id, school_id, school, sport, season, stat_row")
    .or(athleteFilter)
    .order("season", { ascending: true })
    .limit(600);

  if (schoolId) {
    request = request.eq("school_id", schoolId);
  } else if (schoolName) {
    request = request.ilike("school", schoolName);
  }

  let { data, error } = await request;

  if (error) {
    const fallback = await supabase
      .from("raw_stat_rows")
      .select("id, school_id, school, sport, season, stat_row")
      .order("season", { ascending: true })
      .limit(600);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  const lowerName = name.toLowerCase();
  return (data || []).filter((row) => extractAthleteName(row.stat_row).toLowerCase().includes(lowerName));
}

function buildProfile(rows, requestedName, requestedSchool, requestedSchoolId) {
  const nameCounts = new Map();
  const schoolCounts = new Map();
  const sportsMap = new Map();
  const rankings = new Set();
  const seasonsSeen = new Set();

  rows.forEach((row) => {
    const athlete = extractAthleteName(row.stat_row) || requestedName;
    const school = String(row.school || requestedSchool || "Unknown School");
    const sport = normalizeSport(row.sport);
    const season = String(row.season || "Unknown season");
    const stats = row.stat_row && typeof row.stat_row === "object" ? row.stat_row : {};

    nameCounts.set(athlete, (nameCounts.get(athlete) || 0) + 1);
    schoolCounts.set(school, (schoolCounts.get(school) || 0) + 1);
    seasonsSeen.add(season);

    if (!sportsMap.has(sport)) {
      sportsMap.set(sport, { sport, seasons: new Map() });
    }

    const sportItem = sportsMap.get(sport);
    const existing = sportItem.seasons.get(season);
    if (!existing || Number(row.id || 0) > Number(existing.id || 0)) {
      sportItem.seasons.set(season, {
        id: row.id,
        season,
        stats,
        grade: extractGrade(stats),
      });
    }

    extractRankingEntries(stats).forEach((entry) => rankings.add(entry));
  });

  const athleteName = mostFrequentKey(nameCounts) || requestedName;
  const schoolName = requestedSchool || mostFrequentKey(schoolCounts) || "Unknown School";
  const sports = Array.from(sportsMap.values())
    .map((item) => ({
      sport: item.sport,
      seasons: Array.from(item.seasons.values()).sort((a, b) => compareSeasonsDesc(a.season, b.season)),
    }))
    .sort((a, b) => a.sport.localeCompare(b.sport));

  const activeYears = buildActiveYearRange(Array.from(seasonsSeen));
  const classYear = inferClassYear(rows.map((row) => row.stat_row));

  return {
    athleteName,
    schoolName,
    requestedSchoolId,
    sports,
    activeYears,
    classYear,
    rankings: Array.from(rankings).slice(0, 12),
    seasonCount: seasonsSeen.size,
  };
}

function renderProfile(profile) {
  athleteNameEl.textContent = profile.athleteName;

  const sportsList = profile.sports.map((item) => titleCase(item.sport)).join(" | ");
  const activeLine = profile.activeYears ? `Active: ${profile.activeYears}` : "Active years: N/A";
  const classLine = profile.classYear ? ` | ${profile.classYear}` : "";
  athleteMetaEl.textContent = `${profile.schoolName} | ${sportsList || "Sport data pending"} | ${activeLine}${classLine}`;

  athleteChipsEl.innerHTML = `
    <span class="athlete-chip">${profile.sports.length} sport${profile.sports.length === 1 ? "" : "s"}</span>
    <span class="athlete-chip">${profile.seasonCount} season${profile.seasonCount === 1 ? "" : "s"}</span>
    <span class="athlete-chip">${profile.rankings.length} ranking${profile.rankings.length === 1 ? "" : "s"}</span>
  `;

  renderSports(profile.sports);
  renderRankings(profile.rankings);
}

function renderSports(sports) {
  if (!sports.length) {
    sportsContainerEl.innerHTML = `<div class="public-empty">No sport sections available for this athlete.</div>`;
    return;
  }

  sportsContainerEl.innerHTML = "";

  sports.forEach((sportItem) => {
    const section = document.createElement("section");
    section.className = "sport-section";
    section.dataset.sport = sportItem.sport;

    const tabsHtml = sportItem.seasons
      .map((season, index) => {
        const label = `${season.season}${season.grade ? ` - ${season.grade}` : ""}`;
        return `<button type="button" class="season-tab${index === 0 ? " active" : ""}" data-season="${escapeHtml(
          season.season
        )}">${escapeHtml(label)}</button>`;
      })
      .join("");

    section.innerHTML = `
      <div class="sport-head">
        <h2>${escapeHtml(titleCase(sportItem.sport))}</h2>
      </div>
      <div class="season-tabs">${tabsHtml}</div>
      <div class="season-table-wrap" data-season-table></div>
    `;

    const tableWrap = section.querySelector("[data-season-table]");
    const tabs = Array.from(section.querySelectorAll(".season-tab"));

    function renderSeasonTable(seasonKey) {
      const seasonData = sportItem.seasons.find((item) => item.season === seasonKey) || sportItem.seasons[0];
      const { columns, values } = buildSeasonTableData(sportItem.sport, seasonData.stats);

      tableWrap.innerHTML = `
        <table class="season-table">
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            <tr>${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>
          </tbody>
        </table>
      `;
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((node) => node.classList.remove("active"));
        tab.classList.add("active");
        renderSeasonTable(tab.dataset.season || "");
      });
    });

    renderSeasonTable(sportItem.seasons[0]?.season || "");
    sportsContainerEl.appendChild(section);
  });
}

function renderRankings(rankings) {
  if (!rankings.length) {
    rankingsSectionEl.hidden = true;
    return;
  }

  rankingsSectionEl.hidden = false;
  rankingsListEl.innerHTML = rankings.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
}

function buildSeasonTableData(sport, stats) {
  const preferred = getPreferredColumnsForSport(sport);
  const normalized = buildNormalizedStatMap(stats);

  const selected = preferred
    .map((label) => {
      const aliases = getStatAliases(label);
      const key = aliases.find((alias) => normalized.has(alias));
      if (!key) return null;
      return [label, normalizeStatValue(normalized.get(key))];
    })
    .filter(Boolean);

  if (selected.length) {
    return {
      columns: selected.map((item) => item[0]),
      values: selected.map((item) => item[1]),
    };
  }

  const fallbackEntries = Object.entries(stats || {})
    .filter(([key]) => !isMetadataKey(key))
    .slice(0, 8)
    .map(([key, value]) => [key, normalizeStatValue(value)]);

  if (!fallbackEntries.length) {
    return {
      columns: ["No stats"],
      values: ["N/A"],
    };
  }

  return {
    columns: fallbackEntries.map((entry) => entry[0]),
    values: fallbackEntries.map((entry) => entry[1]),
  };
}

function buildNormalizedStatMap(stats) {
  const map = new Map();
  Object.entries(stats || {}).forEach(([key, value]) => {
    map.set(normalizeStatKey(key), value);
  });
  return map;
}

function normalizeStatKey(key) {
  return String(key || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeStatValue(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
}

function isMetadataKey(key) {
  const normalized = normalizeStatKey(key);
  return ["ATHLETENAME", "ATHLETE", "PLAYER", "NAME", "SCHOOL", "SCHOOLNAME", "SEASON"].includes(normalized);
}

function getPreferredColumnsForSport(sport) {
  const key = normalizeSport(sport);
  const map = {
    basketball: ["GP", "PTS", "REB", "AST", "STL", "BLK", "FG%", "FT%"],
    football: ["GP", "Pass Yds", "Rush Yds", "TD", "Tackles", "INT"],
    volleyball: ["GP", "K", "DIG", "AST", "BLK", "ACE"],
    baseball: ["GP", "AVG", "AB", "H", "HR", "RBI"],
    softball: ["GP", "AVG", "AB", "H", "HR", "RBI"],
    soccer: ["GP", "G", "A", "SOG"],
  };

  return map[key] || ["GP", "PTS", "REB", "AST"];
}

function getStatAliases(label) {
  const normalized = normalizeStatKey(label);
  const aliases = {
    GP: ["GP", "GAMESPLAYED"],
    PTS: ["PTS", "POINTS"],
    REB: ["REB", "REBOUNDS"],
    AST: ["AST", "ASSISTS"],
    STL: ["STL", "STEALS"],
    BLK: ["BLK", "BLOCKS"],
    "FG%": ["FG", "FGPCT", "FGPERCENT"],
    "FT%": ["FT", "FTPCT", "FTPERCENT"],
    "PASS YDS": ["PASSYDS", "PASSINGYARDS", "YDS"],
    "RUSH YDS": ["RUSHYDS", "RUSHINGYARDS"],
    TD: ["TD", "TOUCHDOWNS"],
    TACKLES: ["TACKLES", "TCK"],
    INT: ["INT", "INTERCEPTIONS"],
    K: ["K", "KILLS"],
    DIG: ["DIG", "DIGS"],
    ACE: ["ACE", "SERVICEACES"],
    AVG: ["AVG", "AVERAGE"],
    AB: ["AB", "ATBATS"],
    H: ["H", "HITS"],
    HR: ["HR", "HOMERUNS"],
    RBI: ["RBI", "RUNSBATTEDIN"],
    G: ["G", "GOALS"],
    A: ["A", "ASSISTS"],
    SOG: ["SOG", "SHOTSONGOAL"],
  };

  return aliases[normalized] || [normalized];
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

function extractGrade(stats) {
  const value =
    stats?.Grade ||
    stats?.grade ||
    stats?.CLASS ||
    stats?.class ||
    "";
  return String(value || "").trim();
}

function extractRankingEntries(stats) {
  return Object.entries(stats || {})
    .filter(([key, value]) => /rank|top/i.test(String(key)) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${value}`);
}

function inferClassYear(statRows) {
  const candidates = [];
  statRows.forEach((stats) => {
    if (!stats || typeof stats !== "object") return;
    const value =
      stats["Class Year"] ||
      stats.class_year ||
      stats.Graduation ||
      stats.grad_year ||
      "";
    if (value) candidates.push(String(value).trim());
  });

  if (!candidates.length) return "";
  const winner = mostFrequentKeyFromList(candidates);
  if (/^\d{4}$/.test(winner)) {
    return `Class of ${winner}`;
  }
  return winner;
}

function buildActiveYearRange(seasons) {
  const years = [];
  seasons.forEach((season) => {
    const text = String(season || "");
    const match = text.match(/(19|20)\d{2}/g);
    if (!match) return;
    match.forEach((value) => years.push(Number(value)));
  });

  if (!years.length) return "";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}-${max}`;
}

function compareSeasonsDesc(a, b) {
  const aValue = seasonSortValue(a);
  const bValue = seasonSortValue(b);
  return bValue - aValue;
}

function seasonSortValue(season) {
  const match = String(season || "").match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

function normalizeSport(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("basketball")) return "basketball";
  if (text.includes("football")) return "football";
  if (text.includes("volleyball")) return "volleyball";
  if (text.includes("baseball")) return "baseball";
  if (text.includes("softball")) return "softball";
  if (text.includes("soccer")) return "soccer";
  return text || "sport";
}

function mostFrequentKey(map) {
  let bestKey = "";
  let bestValue = -1;
  map.forEach((count, key) => {
    if (count > bestValue) {
      bestKey = key;
      bestValue = count;
    }
  });
  return bestKey;
}

function mostFrequentKeyFromList(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return mostFrequentKey(counts);
}

function renderMissingProfile(message) {
  athleteNameEl.textContent = "Athlete Profile";
  athleteMetaEl.textContent = message;
  athleteChipsEl.innerHTML = "";
  sportsContainerEl.innerHTML = `<div class="public-empty">${escapeHtml(message)}</div>`;
  rankingsSectionEl.hidden = true;
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

