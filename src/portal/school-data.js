import { supabase } from "../supabaseClient.js";
import {
  cleanAthleteDisplayName,
  extractAthleteClassTag,
  extractAthleteNameCandidates,
  normalizeAthleteIdentity,
} from "../services/publicEntityService.js";
import {
  fetchCurrentSessionProfile,
  isAdminProfile,
  isApprovedSchoolProfile,
  getBlockedAccessMessage,
  normalizeStatus,
} from "./schoolAccess.js";
import {
  compareSchoolYearsDesc,
  getCurrentSchoolYear,
  isSameSchoolYear,
  isSchoolYearWithinWindow,
  normalizeSchoolYearLabel,
  parseSchoolYearLabel,
  SCHOOL_YEAR_CAREER_WINDOW_YEARS,
} from "./schoolYear.js";

const TRACKED_SPORTS = ["basketball", "football", "volleyball", "soccer", "baseball", "softball"];
const SCHOOL_DISPLAY_NAME_KEYS = [
  "Athlete Full Name",
  "athlete_full_name",
  "Full Name",
  "full_name",
  "Player Name",
  "player_name",
  "Player",
  "player",
  "Athlete",
  "athlete",
  "Athlete Name",
  "athlete_name",
  "Name",
  "name",
];
const SCHOOL_FIRST_NAME_KEYS = [
  "First Name",
  "first_name",
  "Athlete First Name",
  "athlete_first_name",
  "Player First Name",
  "player_first_name",
  "First",
  "first",
];
const SCHOOL_LAST_NAME_KEYS = [
  "Last Name",
  "last_name",
  "Athlete Last Name",
  "athlete_last_name",
  "Player Last Name",
  "player_last_name",
  "Last",
  "last",
];
// TODO: Replace this manual override with a real school sport-offering source once the data model exists.
const SCHOOL_NOT_OFFERED_SPORTS = {
  // example_school_id: ["soccer"],
};
const CLASS_PROGRESSION = {
  Fr: "So",
  So: "Jr",
  Jr: "Sr",
};
const SPORT_LABELS = {
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  soccer: "Soccer",
  softball: "Softball",
  volleyball: "Volleyball",
};
const SPORT_METRIC_CONFIG = {
  basketball: { label: "Points", aliases: ["PTS", "Pts", "POINTS"], rateAlias: "PPG", thresholds: [500, 1000, 1500], nearDelta: 120 },
  volleyball: { label: "Kills", aliases: ["K", "KILLS"], thresholds: [250, 500, 1000], nearDelta: 60 },
  soccer: { label: "Goals", aliases: ["G", "GOALS"], thresholds: [25, 50, 100], nearDelta: 10 },
  baseball: { label: "Hits", aliases: ["H", "HITS"], thresholds: [50, 100, 200], nearDelta: 15 },
  softball: { label: "Hits", aliases: ["H", "HITS"], thresholds: [50, 100, 200], nearDelta: 15 },
  football: { label: "Touchdowns", aliases: ["TD", "TOUCHDOWNS"], thresholds: [10, 25, 50], nearDelta: 5 },
};

let currentUser = null;
let schoolRows = [];
let schoolSubmissions = [];
let approvedStaffCount = 0;
let activeSport = "";

const elements = {
  allTimeList: document.getElementById("allTimeList"),
  coverageList: document.getElementById("coverageList"),
  kpiLatestSeason: document.getElementById("kpiLatestSeason"),
  kpiMissingSports: document.getElementById("kpiMissingSports"),
  kpiPending: document.getElementById("kpiPending"),
  kpiRecords: document.getElementById("kpiRecords"),
  kpiSports: document.getElementById("kpiSports"),
  kpiStaff: document.getElementById("kpiStaff"),
  logout: document.getElementById("logoutBtn"),
  milestoneList: document.getElementById("milestoneList"),
  publicSchoolLink: document.getElementById("publicSchoolLink"),
  recentList: document.getElementById("recentList"),
  schoolDataSubline: document.getElementById("schoolDataSubline"),
  schoolDataTitle: document.getElementById("schoolDataTitle"),
  seasonChip: document.getElementById("seasonChip"),
  seasonLeaderList: document.getElementById("seasonLeaderList"),
  stateNotice: document.getElementById("stateNotice"),
  stateNoticeCopy: document.getElementById("stateNoticeCopy"),
  stateNoticeKicker: document.getElementById("stateNoticeKicker"),
  stateNoticeList: document.getElementById("stateNoticeList"),
  stateNoticeTitle: document.getElementById("stateNoticeTitle"),
  sportGapList: document.getElementById("sportGapList"),
  sportSummaryList: document.getElementById("sportSummaryList"),
  sportTabs: document.getElementById("sportTabs"),
  visibilityChip: document.getElementById("visibilityChip"),
};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const { session, profile, profileError } = await fetchCurrentSessionProfile();

  if (!session?.user?.id) {
    window.location.href = "login.html";
    return;
  }

  if (profileError || !profile) {
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  if (isAdminProfile(profile)) {
    window.location.href = "../admin/admin-dashboard.html";
    return;
  }

  elements.logout?.addEventListener("click", handleLogout);

  if (!isApprovedSchoolProfile(profile)) {
    renderBlockedState(profile);
    return;
  }

  currentUser = profile;

  if (elements.publicSchoolLink) {
    elements.publicSchoolLink.href = currentUser.school_id
      ? `../stats.html?school=${encodeURIComponent(currentUser.school_id)}`
      : "../stats.html";
  }

  try {
    await loadSchoolData();
  } catch (error) {
    console.error(error);
    elements.schoolDataSubline.textContent = "School intelligence could not be loaded right now.";
    elements.coverageList.innerHTML = '<li class="empty">Could not load school coverage.</li>';
    elements.milestoneList.innerHTML = '<li class="empty">Could not load milestone watch.</li>';
    elements.recentList.innerHTML = '<li class="empty">Could not load recent approvals.</li>';
    elements.allTimeList.innerHTML = '<li class="empty">Could not load sport intelligence.</li>';
    elements.seasonLeaderList.innerHTML = '<li class="empty">Could not load sport intelligence.</li>';
    elements.sportGapList.innerHTML = '<li class="empty">Could not load sport intelligence.</li>';
    elements.sportSummaryList.innerHTML = '<li class="empty">Could not load sport intelligence.</li>';
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

function renderBlockedState(profile) {
  const schoolName = profile?.school_name || profile?.school_id || "School";
  const message = getBlockedAccessMessage(profile);
  const status = normalizeStatus(profile?.status) || "pending";
  const offeredTrackedSports = getTrackedSportsForSchool(profile?.school_id);

  if (elements.publicSchoolLink) {
    elements.publicSchoolLink.href = profile?.school_id
      ? `../stats.html?school=${encodeURIComponent(profile.school_id)}`
      : "../stats.html";
  }

  elements.schoolDataTitle.textContent = `${schoolName} School Data`;
  elements.schoolDataSubline.textContent = message;
  elements.visibilityChip.className = "chip warn";
  elements.visibilityChip.textContent = "Access limited";
  elements.seasonChip.className = "chip warn";
  elements.seasonChip.textContent = `Status: ${status}`;
  elements.kpiRecords.textContent = "0";
  elements.kpiPending.textContent = "0";
  elements.kpiSports.textContent = "0";
  elements.kpiMissingSports.textContent = String(offeredTrackedSports.length);
  elements.kpiLatestSeason.textContent = "-";
  elements.kpiStaff.textContent = "0";
  showStateNotice({
    variant: "locked",
    kicker: `Private school page | ${status}`,
    title:
      status === "pending"
        ? "School Data unlocks after account approval"
        : status === "invited"
        ? "Finish activation to unlock School Data"
        : "School Data is currently unavailable for this account",
    copy: message,
    items: [
      {
        title: "What opens after approval",
        meta: "School-only leaders, milestone watch, coverage gaps, and approved-record counts stay private to this school.",
      },
      {
        title: "What to do next",
        meta:
          status === "pending"
            ? "Wait for admin review and keep your school/helper information accurate."
            : status === "invited"
            ? "Open the activation email, set your password, and then return to this private school page."
            : "Contact your Athletic Director or platform admin if this account should be active again.",
      },
      {
        title: "Current school scope",
        meta: schoolName,
      },
    ],
  });
  elements.coverageList.innerHTML = `<li class="empty">${escapeHtml(message)}</li>`;
  elements.milestoneList.innerHTML = '<li class="empty">Sport intelligence unlocks after school account approval.</li>';
  elements.recentList.innerHTML = '<li class="empty">Submission review history is unavailable for inactive school accounts.</li>';
  elements.allTimeList.innerHTML = '<li class="empty">School-only leaders are unavailable until this account is approved.</li>';
  elements.seasonLeaderList.innerHTML = '<li class="empty">School-only leaders are unavailable until this account is approved.</li>';
  elements.sportGapList.innerHTML = '<li class="empty">Coverage insights unlock after approval.</li>';
  elements.sportSummaryList.innerHTML = '<li class="empty">School-only intelligence unlocks after approval.</li>';
  elements.sportTabs.innerHTML = "";
}

async function loadSchoolData() {
  const [rows, submissions, staffCount] = await Promise.all([
    fetchSchoolRows(),
    fetchSchoolSubmissions(),
    fetchApprovedStaffCount(),
  ]);

  schoolRows = rows;
  schoolSubmissions = submissions;
  approvedStaffCount = staffCount;
  activeSport = getAvailableSports()[0] || "";

  renderOverview();
  renderSportTabs();
  renderCoverageSnapshot();
  renderRecentApprovals();
  renderSportPanel();
  renderMilestones();
}

async function fetchSchoolRows() {
  const rows = [];
  const pageSize = 1000;
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select("id, school_id, school, sport, season, stat_row")
      .eq("school_id", currentUser.school_id)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) {
      throw error;
    }

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return rows;
}

async function fetchSchoolSubmissions() {
  const { data, error } = await supabase
    .from("game_submissions")
    .select("id, status, sport, created_at, reviewed_at, submission_method")
    .eq("submitter_school_id", currentUser.school_id)
    .order("reviewed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchApprovedStaffCount() {
  const { count, error } = await supabase
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", currentUser.school_id)
    .eq("status", "approved");

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

function renderOverview() {
  const schoolName = currentUser.school_name || schoolRows[0]?.school || currentUser.school_id || "School Data";
  const sports = getAvailableSports();
  const seasons = getSeasons(schoolRows);
  const latestSeason = seasons[0] || "N/A";
  const pendingCount = schoolSubmissions.filter((submission) => normalizeStatus(submission.status) === "pending").length;
  const trackedSports = getTrackedSportsForSchool();
  const missingSports = trackedSports.filter((sport) => !sports.includes(sport));
  const publicVisible = schoolRows.length > 0;

  elements.schoolDataTitle.textContent = `${schoolName} School Data`;
  elements.schoolDataSubline.textContent = publicVisible
    ? "Private school-scoped intelligence view based on approved records only."
    : "Your school does not have approved public records yet.";

  elements.kpiRecords.textContent = String(schoolRows.length);
  elements.kpiPending.textContent = String(pendingCount);
  elements.kpiSports.textContent = String(sports.length);
  elements.kpiMissingSports.textContent = String(missingSports.length);
  elements.kpiLatestSeason.textContent = latestSeason;
  elements.kpiStaff.textContent = String(approvedStaffCount);

  elements.visibilityChip.className = `chip ${publicVisible ? "ok" : "warn"}`;
  elements.visibilityChip.textContent = publicVisible ? "Public visibility: active" : "Public visibility: inactive";
  elements.seasonChip.className = `chip ${seasons.length ? "ok" : "warn"}`;
  elements.seasonChip.textContent = seasons.length
    ? `Season range: ${seasons[seasons.length - 1]} to ${seasons[0]}`
    : "No season coverage yet";

  if (!publicVisible) {
    showStateNotice({
      variant: "empty",
      kicker: "Private school page | no approved data yet",
      title: pendingCount
        ? "School Data is ready, but approved records have not landed yet"
        : "This school does not have approved records yet",
      copy: pendingCount
        ? "Submissions are still under review. School-only intelligence will populate here after approval."
        : "Once approved records exist, this page will show school-only leaders, milestone watch, and coverage gaps.",
      items: [
        {
          title: "Pending submissions",
          meta: pendingCount
            ? `${pendingCount} submission${pendingCount === 1 ? "" : "s"} are still waiting on admin review.`
            : "No pending submissions are waiting right now.",
        },
        {
          title: "Best next step",
          meta: pendingCount
            ? "Check review progress or add missing school records if more history still needs to be submitted."
            : "Use Submit Stats to add season records for this school so school-only intelligence can populate here.",
        },
        {
          title: "What will appear here",
          meta: "Top performers, current season leaders, milestone watch, and missing-coverage alerts are all school-scoped.",
        },
      ],
    });
    return;
  }

  hideStateNotice();
}

function renderCoverageSnapshot() {
  const sports = getAvailableSports();
  const seasons = getSeasons(schoolRows);
  const currentSchoolYear = getCurrentSchoolYear();
  const trackedSports = getTrackedSportsForSchool();
  const notOfferedSports = getNotOfferedSportLabels();
  const missingSports = trackedSports.filter((sport) => !sports.includes(sport)).map((sport) => SPORT_LABELS[sport]);
  const missingSeasons = findMissingSeasons(seasons);
  const currentYearSports = new Set(
    schoolRows
      .filter((row) => isSameSchoolYear(row.season, currentSchoolYear))
      .map((row) => normalizeSport(row.sport))
      .filter(Boolean)
  );
  const missingCurrentYearSports = trackedSports.filter((sport) => !currentYearSports.has(sport)).map(
    (sport) => SPORT_LABELS[sport]
  );
  const thinSeasons = buildThinSeasonCoverageItems(schoolRows);
  const items = [
    notOfferedSports.length
      ? {
          title: "Sports marked not offered",
          meta: notOfferedSports.join(", "),
        }
      : null,
    missingSports.length
      ? {
          title: "Missing sports in the approved archive",
          meta: missingSports.join(", "),
        }
      : {
          title: "Tracked offered sports are represented",
          meta: "Every sport currently treated as offered has at least some approved historical coverage.",
        },
    missingCurrentYearSports.length
      ? {
          title: `${currentSchoolYear} still has coverage gaps`,
          meta: `No approved ${currentSchoolYear} data yet for ${missingCurrentYearSports.join(", ")}.`,
        }
      : {
          title: `${currentSchoolYear} is represented in approved data`,
          meta: "Current-year participation exists across the sports currently in school coverage.",
        },
    missingSeasons.length
      ? {
          title: "Missing interior school years",
          meta: summarizeList(missingSeasons, 5),
        }
      : {
          title: "No interior school-year gaps detected",
          meta: "Approved archive seasons appear continuous across the years currently represented.",
        },
    thinSeasons.length
      ? {
          title: "Thin archive seasons",
          meta: thinSeasons.join(", "),
        }
      : {
          title: "No thin seasons detected",
          meta: "No approved school year is currently flagged as unusually sparse.",
        },
  ].filter(Boolean);

  elements.coverageList.innerHTML = items.map((item) => renderListItem(item.title, item.meta)).join("");
}

function renderRecentApprovals() {
  const recent = schoolSubmissions
    .filter((submission) => normalizeStatus(submission.status) === "approved")
    .slice(0, 6);

  if (!recent.length) {
    elements.recentList.innerHTML = '<li class="empty">No approved submissions yet.</li>';
    return;
  }

  elements.recentList.innerHTML = recent
    .map((submission) => {
      const sportLabel = SPORT_LABELS[normalizeSport(submission.sport)] || titleCase(submission.sport || "Submission");
      const approvedDate = formatDate(submission.reviewed_at || submission.created_at);
      const method = titleCase(String(submission.submission_method || "manual").replace(/_/g, " "));
      return renderListItem(
        `${sportLabel} was approved on ${approvedDate}.`,
        `${method} | Submitted ${formatDate(submission.created_at)}`
      );
    })
    .join("");
}

function renderSportTabs() {
  const sports = getAvailableSports();

  if (!sports.length) {
    elements.sportTabs.innerHTML = "";
    return;
  }

  elements.sportTabs.innerHTML = sports
    .map((sport) => `
      <button class="tab ${sport === activeSport ? "active" : ""}" type="button" data-sport="${escapeHtmlAttr(sport)}">
        ${escapeHtml(SPORT_LABELS[sport] || titleCase(sport))}
      </button>
    `)
    .join("");

  elements.sportTabs.querySelectorAll("[data-sport]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSport = button.dataset.sport || "";
      renderSportTabs();
      renderSportPanel();
      renderMilestones();
    });
  });
}

function renderSportPanel() {
  const sportRows = getRowsForSport(activeSport);
  if (!activeSport || !sportRows.length) {
    const empty = '<li class="empty">No approved data is available for this sport yet.</li>';
    elements.allTimeList.innerHTML = empty;
    elements.seasonLeaderList.innerHTML = empty;
    elements.sportGapList.innerHTML = empty;
    elements.sportSummaryList.innerHTML = empty;
    return;
  }

  const currentSchoolYear = getCurrentSchoolYear();
  const allTimeLeaders = buildCareerLeaders(sportRows, activeSport).slice(0, 10);
  const seasonLeaders = buildSeasonLeaders(sportRows, activeSport, currentSchoolYear).slice(0, 10);
  const coverageGaps = buildCoverageGapItems(sportRows, currentSchoolYear);
  const summaryItems = buildSportSummaryItems(
    sportRows,
    activeSport,
    currentSchoolYear,
    allTimeLeaders,
    seasonLeaders
  );

  elements.allTimeList.innerHTML = allTimeLeaders.length
    ? allTimeLeaders.map((leader) => renderLeaderItem(leader, activeSport)).join("")
    : '<li class="empty">No all-time leaders could be calculated from the current data.</li>';

  elements.seasonLeaderList.innerHTML = seasonLeaders.length
    ? seasonLeaders
        .map((leader) => renderLeaderItem(leader, activeSport, currentSchoolYear))
        .join("")
    : `<li class="empty">No current season leaders could be calculated for ${escapeHtml(currentSchoolYear)}.</li>`;

  elements.sportGapList.innerHTML = coverageGaps.length
    ? coverageGaps.map((item) => renderListItem(item.title, item.meta)).join("")
    : '<li class="empty">No obvious missing-year gaps were detected for this sport.</li>';

  elements.sportSummaryList.innerHTML = summaryItems.map((item) => renderListItem(item.title, item.meta)).join("");
}

function renderMilestones() {
  const sportRows = getRowsForSport(activeSport);
  const currentSchoolYear = getCurrentSchoolYear();
  const milestoneItems = activeSport ? buildMilestoneItems(sportRows, activeSport, currentSchoolYear) : [];

  elements.milestoneList.innerHTML = milestoneItems.length
    ? milestoneItems.map((item) => renderListItem(item.title, item.meta)).join("")
    : `<li class="empty">No active-athlete milestone alerts were found for ${escapeHtml(currentSchoolYear)}.</li>`;
}

function showStateNotice({ variant = "empty", kicker = "", title = "", copy = "", items = [] } = {}) {
  if (!elements.stateNotice) {
    return;
  }

  elements.stateNotice.hidden = false;
  elements.stateNotice.className = `state-notice ${variant}`;
  elements.stateNoticeKicker.textContent = kicker || "Private school page";
  elements.stateNoticeTitle.textContent = title || "School state";
  elements.stateNoticeCopy.textContent = copy || "";
  elements.stateNoticeList.innerHTML = (items || [])
    .map(
      (item) => `<li><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.meta || "")}</span></li>`
    )
    .join("");
}

function hideStateNotice() {
  if (!elements.stateNotice) {
    return;
  }

  elements.stateNotice.hidden = true;
  elements.stateNotice.className = "state-notice";
  elements.stateNoticeKicker.textContent = "";
  elements.stateNoticeTitle.textContent = "";
  elements.stateNoticeCopy.textContent = "";
  elements.stateNoticeList.innerHTML = "";
}

function getAvailableSports() {
  return Array.from(new Set(schoolRows.map((row) => normalizeSport(row.sport)).filter(Boolean)))
    .sort((left, right) => (SPORT_LABELS[left] || left).localeCompare(SPORT_LABELS[right] || right));
}

function getRowsForSport(sport) {
  return schoolRows.filter((row) => normalizeSport(row.sport) === sport);
}

function consolidateSportRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const athleteCandidates = extractSchoolAthleteNameCandidates(row.stat_row);
    const athleteName =
      chooseSchoolAthleteDisplayName(row.stat_row, athleteCandidates) ||
      cleanAthleteDisplayName(row.stat_row?.["Athlete Name"] || "");
    const athleteKey = normalizeAthleteIdentity(athleteName);
    const seasonLabel = normalizeSchoolYearLabel(row.season);
    const classTag = extractAthleteClassTag(row.stat_row, athleteName);
    if (!athleteKey) {
      return;
    }

    const key = `${athleteKey}::${seasonLabel || ""}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        athlete: athleteName,
        athleteCandidates: [...athleteCandidates],
        athleteKey,
        classTag,
        season: seasonLabel || "",
        sport: row.sport || "",
        stat_row: { ...(row.stat_row || {}) },
      });
      return;
    }

    const existing = grouped.get(key);
    existing.athleteCandidates.push(...athleteCandidates);
    if (!existing.classTag && classTag) {
      existing.classTag = classTag;
    }
    Object.entries(row.stat_row || {}).forEach(([statKey, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        existing.stat_row[statKey] = value;
      }
    });
  });

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    athlete: chooseSchoolAthleteDisplayName(row.stat_row, row.athleteCandidates) || row.athlete || "Unknown Athlete",
    classTag: row.classTag || extractAthleteClassTag(row.stat_row, row.athlete),
  }));
}

function buildCareerLeaders(rows, sport) {
  const config = SPORT_METRIC_CONFIG[sport];
  if (!config) {
    return [];
  }

  const leaders = new Map();
  consolidateSportRows(rows).forEach((row) => {
    const metricValue = getMetricValue(row.stat_row, config);
    if (metricValue <= 0) {
      return;
    }

    if (!leaders.has(row.athleteKey)) {
      leaders.set(row.athleteKey, {
        athlete: row.athlete,
        athleteKey: row.athleteKey,
        seasons: new Set(),
        total: 0,
      });
    }

    const item = leaders.get(row.athleteKey);
    item.total += metricValue;
    if (row.season) {
      item.seasons.add(row.season);
    }
  });

  return Array.from(leaders.values())
    .map((item) => ({
      athlete: item.athlete,
      metricLabel: config.label,
      total: Math.round(item.total * 10) / 10,
      seasons: Array.from(item.seasons).sort(compareSeasonDesc),
    }))
    .sort((left, right) => right.total - left.total);
}

function buildSeasonLeaders(rows, sport, latestSeason) {
  const config = SPORT_METRIC_CONFIG[sport];
  if (!config || !latestSeason) {
    return [];
  }

  return consolidateSportRows(rows)
    .filter((row) => isSameSchoolYear(row.season, latestSeason))
    .map((row) => ({
      athlete: row.athlete,
      metricLabel: config.label,
      total: Math.round(getMetricValue(row.stat_row, config) * 10) / 10,
      seasons: [normalizeSchoolYearLabel(latestSeason)],
    }))
    .filter((row) => row.total > 0)
    .sort((left, right) => right.total - left.total);
}

function buildEligibleMilestoneLeaders(rows, sport, currentSchoolYear) {
  const config = SPORT_METRIC_CONFIG[sport];
  if (!config) {
    return [];
  }

  const eligibilityContext = getMilestoneEligibilityContext(rows, currentSchoolYear);
  const leaders = new Map();

  consolidateSportRows(rows).forEach((row) => {
    if (!isSchoolYearWithinWindow(row.season, currentSchoolYear, SCHOOL_YEAR_CAREER_WINDOW_YEARS)) {
      return;
    }

    const metricValue = getMetricValue(row.stat_row, config);
    if (metricValue <= 0) {
      return;
    }

    if (!leaders.has(row.athleteKey)) {
      leaders.set(row.athleteKey, {
        athlete: row.athlete,
        athleteKey: row.athleteKey,
        hasCurrentSeason: false,
        latestClassTag: "",
        latestSeason: "",
        seasons: new Set(),
        total: 0,
      });
    }

    const leader = leaders.get(row.athleteKey);
    leader.total += metricValue;
    leader.seasons.add(row.season);
    if (isMoreRecentSchoolYear(row.season, leader.latestSeason)) {
      leader.latestSeason = row.season;
      leader.latestClassTag = row.classTag || "";
    } else if (isSameSchoolYear(row.season, leader.latestSeason) && !leader.latestClassTag && row.classTag) {
      leader.latestClassTag = row.classTag;
    }
    if (isSameSchoolYear(row.season, currentSchoolYear)) {
      leader.hasCurrentSeason = true;
    }
  });

  return Array.from(leaders.values())
    .filter((leader) => isMilestoneEligibleLeader(leader, eligibilityContext))
    .map((leader) => ({
      athlete: leader.athlete,
      eligibilityMode: eligibilityContext.mode,
      fallbackSeason: eligibilityContext.fallbackSeason,
      latestClassTag: leader.latestClassTag,
      nextClassTag: getNextClassTag(leader.latestClassTag),
      metricLabel: config.label,
      total: Math.round(leader.total * 10) / 10,
      seasons: Array.from(leader.seasons).sort(compareSeasonDesc),
    }))
    .sort((left, right) => right.total - left.total);
}

function buildMilestoneItems(rows, sport, currentSchoolYear) {
  const config = SPORT_METRIC_CONFIG[sport];
  if (!config) {
    return [];
  }

  return buildEligibleMilestoneLeaders(rows, sport, currentSchoolYear)
    .map((leader) => {
      const nextThreshold = config.thresholds.find((threshold) => leader.total < threshold && threshold - leader.total <= config.nearDelta);
      if (!nextThreshold) {
        return null;
      }

      const away = Math.max(0, nextThreshold - leader.total);
      const participationMeta =
        leader.eligibilityMode === "fallback"
          ? `Current-season rows are not approved yet, so this is temporarily inferred from ${leader.fallbackSeason}${
              leader.latestClassTag && leader.nextClassTag
                ? ` (${leader.latestClassTag} to likely ${leader.nextClassTag})`
                : ""
            }.`
          : `${currentSchoolYear} participation confirmed.`;
      return {
        title: `${leader.athlete} is ${formatMetric(away)} away from ${formatMetric(nextThreshold)} ${config.label.toLowerCase()}.`,
        meta: `${formatMetric(leader.total)} career ${config.label.toLowerCase()} across the last ${SCHOOL_YEAR_CAREER_WINDOW_YEARS} school years. ${participationMeta}`,
        away,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.away - right.away)
    .slice(0, 8);
}

function buildCoverageGapItems(rows, currentSchoolYear) {
  const seasons = getSeasons(rows);
  if (!seasons.length) {
    return [];
  }

  const missing = findMissingSeasons(seasons);
  const items = [];
  const hasCurrentSchoolYear = seasons.some((season) => isSameSchoolYear(season, currentSchoolYear));

  items.push(
    hasCurrentSchoolYear
      ? {
          title: `${currentSchoolYear} is represented in approved rows.`,
          meta: "Current Season Leaders and Milestone Watch use this school year as the active eligibility gate.",
        }
      : {
          title: `${currentSchoolYear} is missing for this sport.`,
          meta: "Current-athlete sections stay empty until an approved row lands in the current school year.",
        }
  );

  if (missing.length) {
    items.push({
      title: `Missing interior seasons: ${missing.join(", ")}`,
      meta: "These gaps likely need historical backfill.",
    });
  }

  const seasonRows = consolidateSportRows(rows);
  const bySeason = new Map();
  seasonRows.forEach((row) => {
    bySeason.set(row.season, (bySeason.get(row.season) || 0) + 1);
  });

  const thinSeason = Array.from(bySeason.entries()).find(([, count]) => count <= 2);
  if (thinSeason) {
    items.push({
      title: `${thinSeason[0]} looks thin.`,
      meta: `Only ${thinSeason[1]} athlete row${thinSeason[1] === 1 ? "" : "s"} were found for that season.`,
    });
  }

  return items;
}

function buildSportSummaryItems(rows, sport, currentSchoolYear, allTimeLeaders, seasonLeaders) {
  const config = SPORT_METRIC_CONFIG[sport];
  const seasons = getSeasons(rows);
  const latestLeader = seasonLeaders[0];
  const careerLeader = allTimeLeaders[0];
  const hasCurrentSchoolYear = seasons.some((season) => isSameSchoolYear(season, currentSchoolYear));

  return [
    {
      title: `${SPORT_LABELS[sport] || titleCase(sport)} spans ${seasons[seasons.length - 1] || "N/A"} to ${seasons[0] || "N/A"} in approved records.`,
      meta: hasCurrentSchoolYear
        ? `${currentSchoolYear} is represented in approved rows for this sport.`
        : `${currentSchoolYear} is not represented yet, so active-athlete sections stay empty.`,
    },
    {
      title: careerLeader
        ? `${careerLeader.athlete} is the current all-time leader in ${config.label.toLowerCase()}.`
        : `No all-time ${config.label.toLowerCase()} leader is available yet.`,
      meta: careerLeader ? `${formatMetric(careerLeader.total)} ${config.label.toLowerCase()}` : "Add more approved data to populate leaders.",
    },
    {
      title: latestLeader
        ? `${latestLeader.athlete} leads the current school year in ${config.label.toLowerCase()}.`
        : `No ${currentSchoolYear} leader could be calculated yet.`,
      meta: latestLeader
        ? `${formatMetric(latestLeader.total)} ${config.label.toLowerCase()} in ${currentSchoolYear}`
        : `Only athletes with approved ${currentSchoolYear} rows appear in current-year leader and milestone sections.`,
    },
  ];
}

function getMetricValue(statRow, config) {
  const directValue = getNumericStatValue(statRow, config.aliases);
  if (directValue > 0) {
    return directValue;
  }

  if (!config.rateAlias) {
    return 0;
  }

  const gamesPlayed = getNumericStatValue(statRow, ["GP", "Games Played"]);
  const rateValue = getNumericStatValue(statRow, [config.rateAlias]);
  return gamesPlayed > 0 && rateValue > 0 ? gamesPlayed * rateValue : 0;
}

function getNumericStatValue(statRow, aliases) {
  const normalizedMap = buildNormalizedStatMap(statRow);
  const keys = (aliases || []).map(normalizeStatKey);

  for (const key of keys) {
    if (!normalizedMap.has(key)) {
      continue;
    }

    const rawValue = String(normalizedMap.get(key) ?? "").replace(/,/g, "").trim();
    const numericValue = Number(rawValue);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }

    const decimalValue = Number(rawValue.replace(/^\./, "0."));
    if (!Number.isNaN(decimalValue)) {
      return decimalValue;
    }
  }

  return 0;
}

function buildNormalizedStatMap(statRow) {
  const map = new Map();
  Object.entries(statRow || {}).forEach(([key, value]) => {
    map.set(normalizeStatKey(key), value);
  });
  return map;
}

function normalizeStatKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeSport(value) {
  const sport = String(value || "").toLowerCase();
  if (sport.includes("basketball")) return "basketball";
  if (sport.includes("football")) return "football";
  if (sport.includes("volleyball")) return "volleyball";
  if (sport.includes("soccer")) return "soccer";
  if (sport.includes("baseball")) return "baseball";
  if (sport.includes("softball")) return "softball";
  return "";
}

function getSeasons(rows) {
  return Array.from(
    new Set((rows || []).map((row) => normalizeSchoolYearLabel(row.season)).filter(Boolean))
  ).sort(compareSeasonDesc);
}

function compareSeasonDesc(left, right) {
  return compareSchoolYearsDesc(left, right);
}

function seasonSortValue(season) {
  const parsed = parseSchoolYearLabel(season);
  return parsed?.startYear || 0;
}

function findMissingSeasons(seasons) {
  const startYears = seasons
    .map((season) => parseSchoolYearLabel(season))
    .filter(Boolean)
    .map((season) => season.startYear);

  if (!startYears.length) {
    return [];
  }

  const min = Math.min(...startYears);
  const max = Math.max(...startYears);
  const existing = new Set(startYears);
  const missing = [];

  for (let year = min; year <= max; year += 1) {
    if (!existing.has(year)) {
      missing.push(normalizeSchoolYearLabel(`${year}-${year + 1}`));
    }
  }

  return missing;
}

function buildThinSeasonCoverageItems(rows, threshold = 2) {
  const bySeason = new Map();

  consolidateSportRows(rows).forEach((row) => {
    if (!row.season) {
      return;
    }

    bySeason.set(row.season, (bySeason.get(row.season) || 0) + 1);
  });

  return Array.from(bySeason.entries())
    .filter(([, count]) => count <= threshold)
    .sort((left, right) => compareSeasonDesc(left[0], right[0]))
    .slice(0, 4)
    .map(([season, count]) => `${season} (${count} athlete row${count === 1 ? "" : "s"})`);
}

function renderLeaderItem(leader, sport, season = "") {
  const seasonText = season || (leader.seasons.length ? `${leader.seasons[leader.seasons.length - 1]} to ${leader.seasons[0]}` : "Season range unavailable");
  return renderListItem(
    `${leader.athlete} - ${formatMetric(leader.total)} ${leader.metricLabel.toLowerCase()}`,
    `${SPORT_LABELS[sport] || titleCase(sport)} | ${seasonText}`
  );
}

function getTrackedSportsForSchool(schoolId = currentUser?.school_id) {
  const excluded = new Set(getNotOfferedSportsForSchool(schoolId));
  return TRACKED_SPORTS.filter((sport) => !excluded.has(sport));
}

function getNotOfferedSportsForSchool(schoolId = currentUser?.school_id) {
  return Array.from(
    new Set((SCHOOL_NOT_OFFERED_SPORTS[schoolId] || []).map((sport) => normalizeSport(sport)).filter(Boolean))
  );
}

function getNotOfferedSportLabels(schoolId = currentUser?.school_id) {
  return getNotOfferedSportsForSchool(schoolId).map((sport) => SPORT_LABELS[sport] || titleCase(sport));
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => normalizeText(value)).filter(Boolean)));
}

function firstPresentValue(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = normalizeText(source[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function isInitialToken(value) {
  return normalizeText(value).replace(/[^A-Za-z]/g, "").length === 1;
}

function extractSchoolAthleteNameCandidates(statRow) {
  const candidates = [...extractAthleteNameCandidates(statRow)];
  const displayName = firstPresentValue(statRow, SCHOOL_DISPLAY_NAME_KEYS);
  const firstName = firstPresentValue(statRow, SCHOOL_FIRST_NAME_KEYS);
  const lastName = firstPresentValue(statRow, SCHOOL_LAST_NAME_KEYS);

  if (displayName) {
    candidates.push(displayName);
  }
  if (firstName && lastName) {
    candidates.push(`${firstName} ${lastName}`);
  }

  return uniqueStrings(candidates).map(cleanAthleteDisplayName).filter(Boolean);
}

function chooseSchoolAthleteDisplayName(statRow, seedNames = []) {
  const candidates = extractSchoolAthleteNameCandidates(statRow).concat(seedNames || []);
  let bestName = "";
  let bestScore = -1;

  uniqueStrings(candidates).forEach((name) => {
    const cleaned = cleanAthleteDisplayName(name);
    if (!cleaned) {
      return;
    }

    const tokens = cleaned.split(" ").filter(Boolean);
    const firstToken = tokens[0] || "";
    const lastToken = tokens[tokens.length - 1] || "";
    let score = cleaned.length;

    if (tokens.length >= 2) {
      score += 14;
    }
    if (firstToken && !isInitialToken(firstToken)) {
      score += 18;
    } else if (firstToken) {
      score -= 8;
    }
    if (lastToken && !isInitialToken(lastToken)) {
      score += 6;
    }
    if (/\./.test(firstToken)) {
      score -= 4;
    }

    if (score > bestScore) {
      bestName = cleaned;
      bestScore = score;
    }
  });

  return bestName;
}

function getMilestoneEligibilityContext(rows, currentSchoolYear) {
  const seasons = getSeasons(rows);
  if (seasons.some((season) => isSameSchoolYear(season, currentSchoolYear))) {
    return { mode: "current", fallbackSeason: "" };
  }

  const latestSeason = seasons[0] || "";
  return isImmediatePreviousSchoolYear(latestSeason, currentSchoolYear)
    ? { mode: "fallback", fallbackSeason: latestSeason }
    : { mode: "none", fallbackSeason: "" };
}

function isMilestoneEligibleLeader(leader, eligibilityContext) {
  if (eligibilityContext.mode === "current") {
    return leader.hasCurrentSeason;
  }

  if (eligibilityContext.mode === "fallback") {
    // Temporary school-dashboard fallback until real current-season uploads exist.
    return (
      isSameSchoolYear(leader.latestSeason, eligibilityContext.fallbackSeason) &&
      Boolean(getNextClassTag(leader.latestClassTag))
    );
  }

  return false;
}

function getNextClassTag(classTag) {
  return CLASS_PROGRESSION[normalizeText(classTag)] || "";
}

function isImmediatePreviousSchoolYear(previousSeason, currentSchoolYear) {
  const previous = parseSchoolYearLabel(previousSeason);
  const current = parseSchoolYearLabel(currentSchoolYear);

  if (!previous || !current) {
    return false;
  }

  return previous.startYear === current.startYear - 1;
}

function isMoreRecentSchoolYear(left, right) {
  const leftYear = parseSchoolYearLabel(left)?.startYear || 0;
  const rightYear = parseSchoolYearLabel(right)?.startYear || 0;
  return leftYear > rightYear;
}

function renderListItem(title, meta = "") {
  return `<li class="list-item">
    <strong>${escapeHtml(title)}</strong>
    ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ""}
  </li>`;
}

function formatMetric(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
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

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}
