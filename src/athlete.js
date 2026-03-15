import { mountPublicTopNav } from "./components/publicTopNav.js";
import {
  chooseAthleteDisplayName,
  cleanAthleteDisplayName,
  compareSeasonsDesc as compareSeasonsDescByYear,
  extractAthleteName,
  extractAthleteNameCandidates,
  fetchAthleteProfileRows,
} from "./services/publicEntityService.js";
import { normalizeSportKey } from "./sportContext.js";

mountPublicTopNav({ active: "search" });

const SPORT_SUMMARY_FIELDS = {
  basketball: ["PTS", "REB", "AST", "STL"],
  volleyball: ["K", "DIG", "AST", "ACE"],
  softball: ["H", "RBI", "HR", "SB"],
  baseball: ["H", "RBI", "HR", "SB"],
  soccer: ["G", "A", "SOG", "GP"],
  football: ["TD", "YDS", "Tackles", "GP"],
};
const SPORT_LABELS = {
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  soccer: "Soccer",
  softball: "Softball",
  volleyball: "Volleyball",
};
const SPORT_TAB_ORDER = {
  volleyball: 10,
  football: 20,
  soccer: 30,
  basketball: 40,
  baseball: 50,
  softball: 60,
};

const athleteNameEl = document.getElementById("athleteName");
const athleteMetaEl = document.getElementById("athleteMeta");
const athleteChipsEl = document.getElementById("athleteChips");
const athleteSummaryGridEl = document.getElementById("athleteSummaryGrid");
const athleteActionsEl = document.getElementById("athleteActions");
const sportTabsEl = document.getElementById("sportTabs");
const sportsContainerEl = document.getElementById("sportsContainer");
const rankingsSectionEl = document.getElementById("rankingsSection");
const rankingsListEl = document.getElementById("rankingsList");

const params = new URLSearchParams(window.location.search);
const targetName = (params.get("name") || "").trim();
const targetSchoolId = (params.get("school_id") || "").trim();
const targetSchool = (params.get("school") || "").trim();
const targetIdentity = (params.get("identity") || "").trim();

let activeSport = "";

if (!targetName && !targetIdentity) {
  renderMissingProfile("Athlete not specified.");
} else {
  loadAthleteProfile().catch((error) => {
    console.error(error);
    renderMissingProfile("Could not load athlete profile.");
  });
}

async function loadAthleteProfile() {
  const rows = await fetchAthleteProfileRows({
    name: targetName,
    schoolId: targetSchoolId,
    schoolName: targetSchool,
    identityKey: targetIdentity,
  });

  if (!rows.length) {
    renderMissingProfile("No athlete records found.");
    return;
  }

  const profile = buildProfile(rows, {
    requestedName: targetName,
    requestedSchool: targetSchool,
    requestedSchoolId: targetSchoolId,
  });

  renderProfile(profile);
}

function buildProfile(rows, { requestedName, requestedSchool, requestedSchoolId }) {
  const athleteNames = [];
  const schoolCounts = new Map();
  const mergedSportRows = mergeSportSeasonRows(rows, requestedName);
  const rankings = [];
  const seasonsSeen = new Set();
  let latestSeason = "";

  mergedSportRows.forEach((row) => {
    athleteNames.push(row.athlete);
    schoolCounts.set(row.school, (schoolCounts.get(row.school) || 0) + 1);
    seasonsSeen.add(row.season);
    if (!latestSeason || compareSeasonsDescByYear(row.season, latestSeason) < 0) {
      latestSeason = row.season;
    }
    rankings.push(...row.rankings.map((entry) => ({
      ...entry,
      sport: row.sport,
      season: row.season,
    })));
  });

  const sports = groupMergedRowsBySport(mergedSportRows);
  const athleteName =
    chooseAthleteDisplayName(athleteNames) || cleanAthleteDisplayName(requestedName) || requestedName;
  const schoolName = requestedSchool || mostFrequentKey(schoolCounts) || "Unknown School";
  const activeYears = buildActiveYearRange(Array.from(seasonsSeen));
  const classYear = inferClassYear(rows.map((row) => row.stat_row));

  return {
    athleteName,
    schoolName,
    requestedSchoolId,
    sports,
    activeYears,
    classYear,
    latestSeason,
    rankings,
    seasonCount: seasonsSeen.size,
  };
}

function mergeSportSeasonRows(rows, requestedName) {
  const grouped = new Map();

  rows.forEach((row) => {
    const sport = normalizeSport(row.sport);
    const season = String(row.season || "Unknown season");
    const school = String(row.school || targetSchool || "Unknown School");
    const athlete =
      chooseAthleteDisplayName(extractAthleteNameCandidates(row.stat_row)) ||
      cleanAthleteDisplayName(extractAthleteName(row.stat_row)) ||
      requestedName;

    const key = `${sport}::${season}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        athleteNames: [],
        grade: "",
        rankings: [],
        school,
        season,
        sport,
        stats: {},
      });
    }

    const item = grouped.get(key);
    item.athleteNames.push(athlete);

    const grade = extractGrade(row.stat_row);
    if (!item.grade && grade) {
      item.grade = grade;
    }

    Object.entries(row.stat_row || {}).forEach(([statKey, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        item.stats[statKey] = value;
      }
    });

    item.rankings.push(...extractRankingEntries(row.stat_row));
  });

  return Array.from(grouped.values())
    .map((item) => ({
      athlete: chooseAthleteDisplayName(item.athleteNames) || requestedName || "Unknown Athlete",
      grade: item.grade,
      rankings: dedupeRankingEntries(item.rankings),
      school: item.school,
      season: item.season,
      sport: item.sport,
      stats: item.stats,
    }))
    .sort((left, right) => {
      if (left.sport !== right.sport) {
        return left.sport.localeCompare(right.sport);
      }
      return compareSeasonsDescByYear(left.season, right.season);
    });
}

function groupMergedRowsBySport(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!grouped.has(row.sport)) {
      grouped.set(row.sport, []);
    }
    grouped.get(row.sport).push(row);
  });

  return Array.from(grouped.entries())
    .map(([sport, seasons]) => {
      const orderedSeasons = [...seasons].sort((left, right) => compareSeasonsDescByYear(left.season, right.season));
      return {
        careerSummary: buildCareerSummary(sport, orderedSeasons),
        rankingHighlight: buildSportHighlight(sport, orderedSeasons),
        seasons: orderedSeasons,
        sport,
      };
    })
    .sort(compareSportsBySchoolYear);
}

function buildCareerSummary(sport, seasons) {
  const fields = SPORT_SUMMARY_FIELDS[sport] || ["GP", "PTS", "REB", "AST"];

  return fields
    .map((field) => {
      const total = sumSportFieldTotals(field, sport, seasons);
      if (total <= 0) {
        return null;
      }

      return {
        label: field,
        value: formatSummaryValue(field, total),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildSportHighlight(sport, seasons) {
  const rankingEntries = seasons.flatMap((season) =>
    season.rankings.map((entry) => ({
      ...entry,
      season: season.season,
    }))
  );
  const withNumericRank = rankingEntries
    .filter((entry) => entry.numericRank !== null)
    .sort((left, right) => left.numericRank - right.numericRank);
  const defaultField = (SPORT_SUMMARY_FIELDS[sport] || [])[0] || "GP";

  if (withNumericRank.length) {
    const best = withNumericRank[0];
    const rankedField = inferFieldFromRankingLabel(best.label, sport) || defaultField;
    const rankedTotal = sumSportFieldTotals(rankedField, sport, seasons);
    const totalText = rankedTotal > 0
      ? `${formatSummaryValue(rankedField, rankedTotal)} ${friendlyStatLabel(rankedField).toLowerCase()}`
      : `${best.label} ${best.rawValue}`;
    return {
      label: "Career Highlight",
      value: `${totalText} | #${best.numericRank} all-time`,
      meta: best.label ? `Strongest ranking category: ${best.label}` : best.season ? `Season ${best.season}` : "",
    };
  }

  const fallbackTotal = sumSportFieldTotals(defaultField, sport, seasons);

  if (fallbackTotal > 0) {
    return {
      label: "Career Highlight",
      value: `${formatSummaryValue(defaultField, fallbackTotal)} ${friendlyStatLabel(defaultField).toLowerCase()}`,
      meta: `${seasons.length} season${seasons.length === 1 ? "" : "s"}`,
    };
  }

  return {
    label: "Ranking Highlight",
    value: "No ranking highlight available yet",
    meta: "",
  };
}

function sumSportFieldTotals(field, sport, seasons) {
  return seasons.reduce((total, season) => total + getStatNumericValue(season.stats, field, sport), 0);
}

function renderProfile(profile) {
  athleteNameEl.textContent = profile.athleteName;

  activeSport = chooseDefaultSport(profile.sports, activeSport);
  const sportsList = profile.sports.map((item) => getSportLabel(item.sport)).join(" | ");
  const activeLine = profile.activeYears ? `Active: ${profile.activeYears}` : "Active years: N/A";
  const classLine = profile.classYear ? ` | ${profile.classYear}` : "";
  athleteMetaEl.textContent = `${profile.schoolName} | ${sportsList || "Sport data pending"} | ${activeLine}${classLine}`;

  athleteChipsEl.innerHTML = `
    <span class="athlete-chip">${profile.sports.length} sport${profile.sports.length === 1 ? "" : "s"}</span>
    <span class="athlete-chip">${profile.seasonCount} season${profile.seasonCount === 1 ? "" : "s"}</span>
    <span class="athlete-chip">${profile.rankings.length} ranking${profile.rankings.length === 1 ? "" : "s"}</span>
  `;

  renderSummaryCards(profile);
  renderActions(profile);
  renderSportTabs(profile.sports);
  renderActiveSport(profile.sports);
  renderRankings(profile.rankings);
}

function renderSummaryCards(profile) {
  const latestSport = getSportLabel(
    profile.sports.find((sport) =>
      sport.seasons.some((season) => season.season === profile.latestSeason)
    )?.sport || ""
  ) || "N/A";
  const cards = [
    { label: "School", value: profile.schoolName || "Unknown School" },
    { label: "Latest Season", value: profile.latestSeason || "N/A" },
    { label: "Latest Sport", value: latestSport },
    { label: "Season Range", value: profile.activeYears || "N/A" },
  ];

  athleteSummaryGridEl.innerHTML = cards
    .map(
      (card) => `
        <div class="athlete-summary-card">
          <span class="athlete-summary-label">${escapeHtml(card.label)}</span>
          <span class="athlete-summary-value">${escapeHtml(card.value)}</span>
        </div>
      `
    )
    .join("");
}

function renderActions(profile) {
  const searchHref = profile.athleteName
    ? `search.html?q=${encodeURIComponent(profile.athleteName)}`
    : "search.html";
  const researchHref = profile.requestedSchoolId
    ? `stats.html?school=${encodeURIComponent(profile.requestedSchoolId)}&q=${encodeURIComponent(profile.athleteName)}`
    : `stats.html?q=${encodeURIComponent(profile.athleteName)}`;
  const schoolSearchHref = `search.html?q=${encodeURIComponent(profile.schoolName)}`;

  athleteActionsEl.innerHTML = `
    <a class="athlete-action-link" href="${searchHref}">Back to Search</a>
    <a class="athlete-action-link" href="${researchHref}">View Filtered Records</a>
    <a class="athlete-action-link" href="${schoolSearchHref}">Search School</a>
  `;
}

function renderSportTabs(sports) {
  if (!sportTabsEl) {
    return;
  }

  if (!sports.length) {
    sportTabsEl.innerHTML = "";
    return;
  }

  sportTabsEl.innerHTML = sports
    .map(
      (sportItem) => `
        <button
          type="button"
          class="athlete-sport-tab${sportItem.sport === activeSport ? " active" : ""}"
          data-sport="${escapeHtml(sportItem.sport)}"
        >
          ${escapeHtml(getSportLabel(sportItem.sport))}
        </button>
      `
    )
    .join("");

  sportTabsEl.querySelectorAll("[data-sport]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSport = button.dataset.sport || "";
      renderSportTabs(sports);
      renderActiveSport(sports);
    });
  });
}

function renderActiveSport(sports) {
  if (!sports.length) {
    sportsContainerEl.innerHTML = `<div class="public-empty">No sport sections available for this athlete.</div>`;
    return;
  }

  const sportItem = sports.find((item) => item.sport === activeSport) || sports[0];
  const tabsHtml = sportItem.seasons
    .map((season, index) => {
      const label = `${season.season}${season.grade ? ` - ${season.grade}` : ""}`;
      return `<button type="button" class="season-tab${index === 0 ? " active" : ""}" data-season="${escapeHtml(
        season.season
      )}">${escapeHtml(label)}</button>`;
    })
    .join("");

  const summaryHtml = sportItem.careerSummary.length
    ? sportItem.careerSummary
        .map(
          (item) => `
            <div class="athlete-sport-card">
              <span class="athlete-sport-card-label">${escapeHtml(friendlyStatLabel(item.label))}</span>
              <span class="athlete-sport-card-value">${escapeHtml(item.value)}</span>
            </div>
          `
        )
        .join("")
    : `<div class="athlete-sport-card athlete-sport-card-full">
        <span class="athlete-sport-card-label">Career Summary</span>
        <span class="athlete-sport-card-value">No career totals available yet</span>
      </div>`;

  sportsContainerEl.innerHTML = `
    <section class="athlete-sport-stage" data-sport="${escapeHtml(sportItem.sport)}">
      <div class="sport-head athlete-sport-stage-head">
        <div>
          <p class="public-kicker">Active Sport</p>
          <h2>${escapeHtml(getSportLabel(sportItem.sport))}</h2>
        </div>
      </div>
      <div class="athlete-sport-summary-wrap">
        <div class="athlete-sport-summary-grid">${summaryHtml}</div>
        <div class="athlete-sport-highlight">
          <span class="athlete-sport-highlight-label">${escapeHtml(sportItem.rankingHighlight.label)}</span>
          <strong>${escapeHtml(sportItem.rankingHighlight.value)}</strong>
          ${sportItem.rankingHighlight.meta ? `<span>${escapeHtml(sportItem.rankingHighlight.meta)}</span>` : ""}
        </div>
      </div>
      <div class="season-tabs">${tabsHtml}</div>
      <div class="season-table-wrap" data-season-table></div>
    </section>
  `;

  const tableWrap = sportsContainerEl.querySelector("[data-season-table]");
  const tabs = Array.from(sportsContainerEl.querySelectorAll(".season-tab"));

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
}

function renderRankings(rankings) {
  if (!rankings.length) {
    rankingsSectionEl.hidden = true;
    return;
  }

  rankingsSectionEl.hidden = false;
  rankingsListEl.innerHTML = rankings
    .slice(0, 12)
    .map((entry) => {
      const rankText =
        entry.numericRank !== null ? `#${entry.numericRank}` : entry.rawValue;
      return `<li>${escapeHtml(`${getSportLabel(entry.sport)} | ${entry.label} ${rankText}${entry.season ? ` | ${entry.season}` : ""}`)}</li>`;
    })
    .join("");
}

function buildSeasonTableData(sport, stats) {
  const preferred = getPreferredColumnsForSport(sport);

  const selected = preferred
    .map((label) => {
      const value = getStatDisplayValue(stats, label, sport);
      if (!value || value === "N/A") return null;
      return [label, value];
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

function getStatDisplayValue(stats, field, sport) {
  const numeric = getStatNumericValue(stats, field, sport);
  if (numeric <= 0 && !shouldAllowZeroValue(field)) {
    return "";
  }

  if (field === "AVG" || field.endsWith("%")) {
    return formatRateValue(field, numeric);
  }

  return formatSummaryValue(field, numeric);
}

function getStatNumericValue(stats, field, sport) {
  const normalized = buildNormalizedStatMap(stats);
  const aliases = getStatAliases(field).map(normalizeStatKey);

  for (const alias of aliases) {
    if (!normalized.has(alias)) {
      continue;
    }

    const value = parseNumericValue(normalized.get(alias));
    if (!Number.isNaN(value)) {
      return value;
    }
  }

  const gamesPlayed = getDirectNumericStat(normalized, ["GP", "Games Played"]);

  if (field === "PTS") {
    return getDerivedTotalFromRate(normalized, gamesPlayed, ["PPG"]);
  }
  if (field === "REB") {
    return getDerivedTotalFromRate(normalized, gamesPlayed, ["RPG"]);
  }
  if (field === "AST") {
    return getDerivedTotalFromRate(normalized, gamesPlayed, ["APG"]);
  }
  if (field === "STL") {
    return getDerivedTotalFromRate(normalized, gamesPlayed, ["SPG"]);
  }
  if (field === "BLK") {
    return getDerivedTotalFromRate(normalized, gamesPlayed, ["BPG"]);
  }
  if (field === "AVG" && (sport === "softball" || sport === "baseball")) {
    const hits = getDirectNumericStat(normalized, ["H", "Hits"]);
    const atBats = getDirectNumericStat(normalized, ["AB", "At Bats"]);
    return atBats > 0 ? hits / atBats : 0;
  }
  if (field === "YDS" && sport === "football") {
    return (
      getDirectNumericStat(normalized, ["YDS", "Pass Yds", "Rush Yds", "Rec YDS"]) ||
      0
    );
  }

  return 0;
}

function getDerivedTotalFromRate(normalizedStats, gamesPlayed, rateAliases) {
  if (gamesPlayed <= 0) {
    return 0;
  }

  const rate = getDirectNumericStat(normalizedStats, rateAliases);
  return rate > 0 ? gamesPlayed * rate : 0;
}

function getDirectNumericStat(normalizedStats, aliases) {
  const normalizedAliases = (aliases || []).map(normalizeStatKey);
  for (const alias of normalizedAliases) {
    if (!normalizedStats.has(alias)) {
      continue;
    }

    const value = parseNumericValue(normalizedStats.get(alias));
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return 0;
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

function parseNumericValue(value) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) {
    return Number.NaN;
  }

  const direct = Number(raw);
  if (!Number.isNaN(direct)) {
    return direct;
  }

  const decimal = Number(raw.replace(/^\./, "0."));
  return decimal;
}

function isMetadataKey(key) {
  const normalized = normalizeStatKey(key);
  return [
    "ATHLETENAME",
    "ATHLETE",
    "PLAYER",
    "NAME",
    "SCHOOL",
    "SCHOOLNAME",
    "SEASON",
    "GRADE",
    "CLASS",
  ].includes(normalized);
}

function getPreferredColumnsForSport(sport) {
  const key = normalizeSport(sport);
  const map = {
    basketball: ["GP", "PTS", "REB", "AST", "STL", "BLK", "FG%", "FT%"],
    football: ["GP", "YDS", "TD", "Tackles", "INT"],
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
    REB: ["REB", "REBOUNDS", "TOTREB", "TRB"],
    AST: ["AST", "ASSISTS"],
    STL: ["STL", "STEALS"],
    BLK: ["BLK", "BLOCKS"],
    "FG%": ["FGPCT", "FGPERCENT", "FG"],
    "FT%": ["FTPCT", "FTPERCENT", "FT"],
    YDS: ["YDS", "PASSYDS", "RUSHYDS", "RECYDS", "PASSINGYARDS", "RUSHINGYARDS"],
    TD: ["TD", "TOUCHDOWNS"],
    TACKLES: ["TACKLES", "TCK", "TOTTKL"],
    INT: ["INT", "INTERCEPTIONS"],
    K: ["K", "KILLS"],
    DIG: ["DIG", "DIGS", "D"],
    ACE: ["ACE", "A", "SERVICEACES"],
    AVG: ["AVG", "AVERAGE"],
    AB: ["AB", "ATBATS"],
    H: ["H", "HITS"],
    HR: ["HR", "HOMERUNS"],
    RBI: ["RBI", "RUNSBATTEDIN"],
    SB: ["SB", "STOLENBASES"],
    G: ["G", "GOALS"],
    A: ["A", "ASSISTS"],
    SOG: ["SOG", "SHOTSONGOAL"],
  };

  return aliases[normalized] || [normalized];
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
    .map(([key, value]) => {
      const numericMatch = String(value).match(/(\d+)/);
      return {
        label: cleanRankingLabel(key),
        numericRank: numericMatch ? Number(numericMatch[1]) : null,
        rawValue: String(value).trim(),
      };
    });
}

function dedupeRankingEntries(entries) {
  const deduped = new Map();

  (entries || []).forEach((entry) => {
    const key = `${entry.label}::${entry.rawValue}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  });

  return Array.from(deduped.values());
}

function cleanRankingLabel(key) {
  const cleaned = String(key || "")
    .replace(/_/g, " ")
    .replace(/\b(rank|ranking|top)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? titleCase(cleaned) : "Ranking";
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

function chooseDefaultSport(sports, currentSport = "") {
  if (!sports.length) {
    return "";
  }

  const currentMatch = sports.find((sport) => sport.sport === currentSport);
  if (currentMatch) {
    return currentSport;
  }

  return sports[0].sport;
}

function compareSportsBySchoolYear(left, right) {
  const leftOrder = SPORT_TAB_ORDER[left.sport] ?? 999;
  const rightOrder = SPORT_TAB_ORDER[right.sport] ?? 999;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return getSportLabel(left.sport).localeCompare(getSportLabel(right.sport));
}

function normalizeSport(value) {
  return normalizeSportKey(value) || "sport";
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

function formatSummaryValue(field, value) {
  if (field === "AVG" || field.endsWith("%")) {
    return formatRateValue(field, value);
  }

  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatRateValue(field, value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  if (field === "AVG") {
    return value.toFixed(3).replace(/^0/, "");
  }

  return value.toFixed(1);
}

function friendlyStatLabel(field) {
  const map = {
    A: "Assists",
    ACE: "Aces",
    AST: "Assists",
    AVG: "Average",
    BLK: "Blocks",
    DIG: "Digs",
    G: "Goals",
    GP: "Games",
    H: "Hits",
    HR: "Home Runs",
    INT: "Interceptions",
    K: "Kills",
    PTS: "Points",
    REB: "Rebounds",
    RBI: "RBI",
    SB: "Stolen Bases",
    SOG: "Shots on Goal",
    STL: "Steals",
    TD: "Touchdowns",
    TACKLES: "Tackles",
    YDS: "Yards",
  };

  return map[normalizeStatKey(field)] || field;
}

function getSportLabel(sport) {
  return SPORT_LABELS[normalizeSport(sport)] || titleCase(sport);
}

function inferFieldFromRankingLabel(label, sport) {
  const normalized = normalizeStatKey(label);
  const keywordMap = [
    ["POINT", "PTS"],
    ["REBOUND", "REB"],
    ["ASSIST", "AST"],
    ["STEAL", "STL"],
    ["BLOCK", "BLK"],
    ["KILL", "K"],
    ["DIG", "DIG"],
    ["ACE", "ACE"],
    ["HIT", "H"],
    ["RBI", "RBI"],
    ["HOMERUN", "HR"],
    ["STOLENBASE", "SB"],
    ["GOAL", "G"],
    ["SHOTSONGOAL", "SOG"],
    ["TOUCHDOWN", "TD"],
    ["YARD", "YDS"],
    ["TACKLE", "Tackles"],
    ["INTERCEPTION", "INT"],
  ];

  const match = keywordMap.find(([keyword]) => normalized.includes(keyword));
  if (match) {
    return match[1];
  }

  return (SPORT_SUMMARY_FIELDS[sport] || [])[0] || "";
}

function shouldAllowZeroValue(field) {
  return normalizeStatKey(field) === "GP";
}

function renderMissingProfile(message) {
  athleteNameEl.textContent = cleanAthleteDisplayName(targetName) || "Athlete Profile";
  athleteMetaEl.textContent = message;
  athleteChipsEl.innerHTML = "";
  athleteSummaryGridEl.innerHTML = "";
  athleteActionsEl.innerHTML = "";
  if (sportTabsEl) {
    sportTabsEl.innerHTML = "";
  }
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
