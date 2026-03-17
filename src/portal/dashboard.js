import { supabase } from "../supabaseClient.js";
import {
  buildAccountStatusHref,
  buildActivationHref,
  STAFF_ROLE_OPTIONS,
  fetchCurrentSessionProfile,
  getBlockedAccessMessage,
  isAdminProfile,
  isApprovedSchoolProfile,
  needsActivationProfile,
  normalizeRole,
  normalizeStatus,
  roleLabel,
  setPortalFlash,
  staffStatusLabel,
} from "./schoolAccess.js";
import { normalizeSportKey, resolveSportContext } from "../sportContext.js";

const SPORTS = ["basketball", "football", "volleyball", "soccer", "baseball", "softball"];
const SPORT_LABELS = {
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  soccer: "Soccer",
  softball: "Softball",
  volleyball: "Volleyball",
};
const METHOD_LABELS = {
  csv_upload: "CSV/XLSX Upload",
  manual_form: "PDF Intake",
  text_paste: "Text Paste",
};
const SCOPE_LABELS = {
  archive_only: "Archive Only",
  boxscore_text: "Text Box Score",
  export_file: "Export File",
  game_boxscore: "Game Box Score",
  game_submission: "Game Submission",
  historic_recovery: "Historic Recovery",
  pdf_review: "PDF Review",
  season_sheet: "Season Spreadsheet",
};

let currentUser = null;
let allSubmissions = [];
let sportsWithData = new Set();
let schoolStaff = [];
let submissionFilter = "all";
let showArchivedStaff = false;

const elements = {
  accountStatusBanner: document.getElementById("accountStatusBanner"),
  dashboardGrid: document.getElementById("dashboardGrid"),
  dashboardKpis: document.getElementById("dashboardKpis"),
  dashboardQuickActions: document.getElementById("dashboardQuickActions"),
  insights: document.getElementById("insights"),
  kpiApproved: document.getElementById("kpiApproved"),
  kpiMissing: document.getElementById("kpiMissing"),
  kpiPending: document.getElementById("kpiPending"),
  kpiRejected: document.getElementById("kpiRejected"),
  kpiSports: document.getElementById("kpiSports"),
  limitedDashboardMessage: document.getElementById("limitedDashboardMessage"),
  limitedDashboardMeta: document.getElementById("limitedDashboardMeta"),
  limitedDashboardPanel: document.getElementById("limitedDashboardPanel"),
  logout: document.getElementById("logoutBtn"),
  readinessChip: document.getElementById("readinessChip"),
  schoolChip: document.getElementById("schoolChip"),
  schoolDataLink: document.getElementById("schoolDataLink"),
  staffList: document.getElementById("staffList"),
  staffMessage: document.getElementById("staffMessage"),
  submissions: document.getElementById("submissions"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  toggleArchived: document.getElementById("toggleArchivedBtn"),
};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const { session, profile, profileError } = await fetchCurrentSessionProfile();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  if (profileError || !profile) {
    setPortalFlash("Could not load your profile. Please sign in again.");
    await supabase.auth.signOut();
    window.location.href = "login.html";
    return;
  }

  if (isAdminProfile(profile)) {
    window.location.href = "../admin/admin-dashboard.html";
    return;
  }

  if (needsActivationProfile(profile)) {
    window.location.href = buildActivationHref();
    return;
  }

  if (!isApprovedSchoolProfile(profile)) {
    window.location.href = buildAccountStatusHref();
    return;
  }

  currentUser = profile;
  elements.schoolChip.textContent = profile.school_name || profile.school_id || "Your School";
  if (elements.schoolDataLink) {
    elements.schoolDataLink.href = buildSchoolDataHref();
    elements.schoolDataLink.addEventListener("click", handleSchoolDataNavigation);
  }

  elements.logout?.addEventListener("click", handleLogout);

  elements.tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      elements.tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      submissionFilter = tab.dataset.status || "all";
      renderSubmissions();
    })
  );
  elements.toggleArchived?.addEventListener("click", () => {
    showArchivedStaff = !showArchivedStaff;
    renderStaff();
  });
  elements.staffList?.addEventListener("click", handleStaffActionClick);

  await loadData();
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

function handleSchoolDataNavigation(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  window.location.assign(buildSchoolDataHref());
}

function buildSchoolDataHref() {
  return new URL("school-data.html", window.location.href).toString();
}

function renderLimitedDashboard(profile) {
  const status = normalizeStatus(profile?.status);
  const isPending = status === "pending";
  const isInvited = status === "invited";
  const message = isPending
    ? "Your account is pending review. You’ll be able to access the school portal after your athletic director approves your request."
    : isInvited
    ? "Your account was approved under the legacy activation flow. Finish the activation email steps before using the school dashboard."
    : getBlockedAccessMessage(profile);

  toggleApprovedDashboard(false);
  elements.accountStatusBanner.hidden = false;
  elements.accountStatusBanner.className = `staff-banner ${isPending ? "info" : "error"}`;
  elements.accountStatusBanner.textContent = message;

  elements.readinessChip.classList.remove("ok", "warn");
  elements.readinessChip.classList.add("warn");
  elements.readinessChip.textContent =
    isPending ? "Status: pending review" : isInvited ? "Status: legacy activation" : `Status: ${staffStatusLabel(status)}`;

  if (elements.limitedDashboardPanel) {
    elements.limitedDashboardPanel.hidden = false;
  }

  if (elements.limitedDashboardMessage) {
    elements.limitedDashboardMessage.className = `staff-banner ${isPending ? "info" : "error"}`;
    elements.limitedDashboardMessage.textContent = message;
  }

  if (elements.limitedDashboardMeta) {
    const details = [
      renderLimitedMetaCard("Requested School", profile.school_name || profile.school_id || "Not assigned"),
      renderLimitedMetaCard("Requested Role", roleLabel(profile.role)),
      renderLimitedMetaCard("Job Title", profile.job_title || "Not provided"),
      renderLimitedMetaCard(
        "Athletic Director Reference",
        profile.reference_ad_name || profile.reference_ad_email
          ? `${profile.reference_ad_name || "Name not provided"}${profile.reference_ad_email ? ` | ${profile.reference_ad_email}` : ""}`
          : "Not provided"
      ),
      renderLimitedMetaCard("Submitted", profile.created_at ? displayDate(profile.created_at) : "Unknown"),
      renderLimitedMetaCard("Verification Notes", profile.verification_notes || "None provided"),
    ];
    elements.limitedDashboardMeta.innerHTML = details.join("");
  }
}

function toggleApprovedDashboard(isApproved) {
  if (elements.dashboardQuickActions) {
    elements.dashboardQuickActions.hidden = !isApproved;
  }

  if (elements.dashboardKpis) {
    elements.dashboardKpis.hidden = !isApproved;
  }

  if (elements.dashboardGrid) {
    elements.dashboardGrid.hidden = !isApproved;
  }

  if (elements.limitedDashboardPanel) {
    elements.limitedDashboardPanel.hidden = isApproved;
  }

  if (elements.accountStatusBanner) {
    elements.accountStatusBanner.hidden = isApproved;
  }
}

function renderLimitedMetaCard(label, value) {
  return `<article class="limited-card">
    <p class="limited-card-label">${escapeHtml(label)}</p>
    <p class="limited-card-value">${escapeHtml(value)}</p>
  </article>`;
}

async function loadData() {
  toggleApprovedDashboard(true);
  elements.submissions.innerHTML = '<div class="empty">Loading submissions...</div>';
  elements.insights.innerHTML = "<li>Loading insights...</li>";
  elements.staffList.innerHTML = '<div class="empty">Loading school staff...</div>';
  setStaffMessage("", "");

  try {
    const [submissions, sportSet, staff] = await Promise.all([
      fetchSubmissions(),
      fetchSportsWithData(),
      fetchSchoolStaff(),
    ]);

    allSubmissions = submissions;
    sportsWithData = sportSet;
    schoolStaff = staff;
    updateKpis();
    updateReadiness();
    renderInsights();
    renderSubmissions();
    renderStaff();
  } catch (error) {
    console.error(error);
    elements.insights.innerHTML = '<li class="danger">Could not load school insights.</li>';
    elements.submissions.innerHTML = '<div class="empty">Could not load submissions.</div>';
    elements.staffList.innerHTML = '<div class="empty">Could not load school staff.</div>';
    setStaffMessage("School staff could not be loaded right now.", "error");
  }
}

async function fetchSubmissions() {
  const { data, error } = await supabase
    .from("game_submissions")
    .select(
      "id, created_at, reviewed_at, status, sport, gender, game_date, home_team_id, away_team_id, home_score, away_score, rejection_reason, submission_method, game_data, submitted_by, user_profiles!submitted_by(full_name, email)"
    )
    .eq("submitter_school_id", currentUser.school_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchSportsWithData() {
  const set = new Set();
  if (!currentUser?.school_id) {
    return set;
  }

  const rows = await fetchRowsBy("school_id", currentUser.school_id).catch(() => []);
  (rows || []).forEach((row) => {
    const context = resolveSportContext(row?.sport);
    if (context.isBasketball && !context.isVarsity) {
      return;
    }

    const key = normalizeSport(row?.sport);
    if (key) {
      set.add(key);
    }
  });
  return set;
}

async function fetchRowsBy(column, value) {
  const rows = [];
  const pageSize = 1000;
  let start = 0;

  while (true) {
    const { data, error } = await supabase
      .from("raw_stat_rows")
      .select("sport")
      .order("id", { ascending: true })
      .eq(column, value)
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

async function fetchSchoolStaff() {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, role, status, created_at, archived_at, job_title, reference_ad_name")
    .eq("school_id", currentUser.school_id)
    .in("status", ["approved", "archived"])
    .order("status", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

function updateKpis() {
  const pending = allSubmissions.filter((submission) => statusKey(submission.status) === "pending").length;
  const approved = allSubmissions.filter((submission) => statusKey(submission.status) === "approved").length;
  const rejected = allSubmissions.filter((submission) => statusKey(submission.status) === "rejected").length;
  const withData = SPORTS.filter((sport) => sportsWithData.has(sport));
  const missing = SPORTS.filter((sport) => !sportsWithData.has(sport));

  elements.kpiPending.textContent = String(pending);
  elements.kpiApproved.textContent = String(approved);
  elements.kpiRejected.textContent = String(rejected);
  elements.kpiSports.textContent = String(withData.length);
  elements.kpiMissing.textContent = String(missing.length);
}

function updateReadiness() {
  const isReady = SPORTS.some((sport) => sportsWithData.has(sport));
  elements.readinessChip.classList.remove("ok", "warn");

  if (isReady) {
    elements.readinessChip.classList.add("ok");
    elements.readinessChip.textContent = "School public: active";
    return;
  }

  elements.readinessChip.classList.add("warn");
  elements.readinessChip.textContent = "School not public yet";
}

function renderInsights() {
  const pending = allSubmissions.filter((submission) => statusKey(submission.status) === "pending").length;
  const approved = allSubmissions.filter((submission) => statusKey(submission.status) === "approved").length;
  const rejected = allSubmissions.filter((submission) => statusKey(submission.status) === "rejected").length;
  const missingSports = SPORTS.filter((sport) => !sportsWithData.has(sport)).map((sport) => SPORT_LABELS[sport]);
  const activeStaffCount = schoolStaff.filter((staff) => normalizeStatus(staff.status) === "approved").length;
  const latestApproved = allSubmissions.find((submission) => statusKey(submission.status) === "approved");
  const items = [];

  items.push({
    tone: pending ? "warn" : "ok",
    text: pending ? `${pending} submission${pending === 1 ? "" : "s"} waiting` : "No pending submissions",
  });

  items.push({
    tone: activeStaffCount > 1 ? "ok" : "",
    text: `${activeStaffCount} approved staff account${activeStaffCount === 1 ? "" : "s"} active`,
  });

  if (rejected) {
    items.push({ tone: "danger", text: `${rejected} rejected submission${rejected === 1 ? "" : "s"}` });
  }

  items.push({
    tone: missingSports.length ? "warn" : "ok",
    text: missingSports.length
      ? `Missing sports: ${missingSports.slice(0, 3).join(", ")}${missingSports.length > 3 ? ", ..." : ""}`
      : "All tracked sports covered",
  });

  items.push({
    tone: SPORTS.some((sport) => sportsWithData.has(sport)) ? "ok" : "warn",
    text: SPORTS.some((sport) => sportsWithData.has(sport))
      ? `${SPORTS.filter((sport) => sportsWithData.has(sport)).length} sports visible`
      : "Approve records to activate visibility",
  });

  if (latestApproved) {
    items.push({ tone: "", text: `Latest approved: ${displayDate(latestApproved.reviewed_at || latestApproved.created_at)}` });
  } else if (!approved) {
    items.push({ tone: "", text: "No approved records yet" });
  }

  if (!allSubmissions.length) {
    items.push({ tone: "", text: "No school submissions yet" });
  }

  elements.insights.innerHTML = items
    .map((item) => `<li class="${item.tone ? item.tone : ""}">${escapeHtml(item.text)}</li>`)
    .join("");
}

function renderSubmissions() {
  const rows =
    submissionFilter === "all"
      ? allSubmissions
      : allSubmissions.filter((submission) => statusKey(submission.status) === submissionFilter);

  if (!rows.length) {
    const message = submissionFilter === "all" ? "No school submissions yet" : `No ${submissionFilter} submissions`;
    elements.submissions.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
    return;
  }

  elements.submissions.innerHTML = rows.map(renderSubmission).join("");
}

function renderSubmission(submission) {
  const status = statusKey(submission.status);
  const statusLabel = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending";
  const scope = scopeKey(submission);
  const scopeLabel = SCOPE_LABELS[scope] || titleCase(scope.replace(/_/g, " "));
  const sport = sportLabel(submission.sport, submission.gender);
  const method =
    METHOD_LABELS[String(submission.submission_method || "").toLowerCase()] ||
    titleCase(String(submission.submission_method || "manual").replace(/_/g, " "));
  const game = submission?.game_data?.game || {};
  const home = game?.home_team?.name || submission.home_team_id || "";
  const away = game?.away_team?.name || submission.away_team_id || "";
  const useMatchup =
    home && away && (scope === "game_submission" || scope === "game_boxscore" || scope === "boxscore_text");
  const title = useMatchup ? `${sport} - ${home} vs ${away}` : `${sport} - ${scopeLabel}`;
  const homeScore = game?.home_team?.score ?? submission.home_score;
  const awayScore = game?.away_team?.score ?? submission.away_score;
  const hasScore =
    homeScore !== null &&
    homeScore !== undefined &&
    awayScore !== null &&
    awayScore !== undefined;
  const route = submission?.game_data?.parse_review?.route_label || "";
  const submitter = submission.user_profiles || {};
  const submitterName = submitter.full_name || "Unknown";
  const detail = hasScore
    ? `<strong>Score:</strong> ${escapeHtml(String(homeScore))} - ${escapeHtml(String(awayScore))}`
    : `<strong>Scope:</strong> ${escapeHtml(scopeLabel)}`;
  const rejection = submission.rejection_reason
    ? ` | <span class="danger"><strong>Reason:</strong> ${escapeHtml(submission.rejection_reason)}</span>`
    : "";

  return `<article class="row">
    <div class="r-top">
      <h3 class="r-title">${escapeHtml(title)}</h3>
      <span class="badge ${status}">${statusLabel}</span>
    </div>
    <div class="meta">
      <span class="pill">Submitted: ${escapeHtml(displayDate(submission.created_at))}</span>
      <span class="pill">Game Date: ${escapeHtml(submission.game_date ? displayDate(submission.game_date) : "N/A")}</span>
      <span class="pill">Method: ${escapeHtml(method)}</span>
      <span class="pill">Type: ${escapeHtml(scopeLabel)}</span>
      <span class="pill">Submitter: ${escapeHtml(submitterName)}</span>
    </div>
    ${route ? `<span class="route">Route: ${escapeHtml(route)}</span>` : ""}
    <p class="detail">${detail}${rejection}</p>
  </article>`;
}

function renderStaff() {
  const canManageStaff = normalizeRole(currentUser?.role) === "athletic_director";
  const visibleStaff = schoolStaff.filter((staff) => {
    const status = normalizeStatus(staff.status);
    return showArchivedStaff ? status === "approved" || status === "archived" : status === "approved";
  });

  if (elements.toggleArchived) {
    elements.toggleArchived.textContent = showArchivedStaff ? "Hide Archived Staff" : "Show Archived Staff";
  }

  if (!visibleStaff.length) {
    const message = showArchivedStaff ? "No active or archived staff found." : "No approved staff found.";
    elements.staffList.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  } else {
    elements.staffList.innerHTML = visibleStaff.map((staff) => renderStaffRow(staff, canManageStaff)).join("");
  }

  if (canManageStaff) {
    setStaffMessage("As Athletic Director, you can update helper roles and archive or restore staff.", "info");
    return;
  }

  setStaffMessage("Only your Athletic Director can change staff roles or archive helpers.", "info");
}

function renderStaffRow(staff, canManageStaff) {
  const status = normalizeStatus(staff.status);
  const isArchived = status === "archived";
  const isSelf = staff.id === currentUser.id;
  const joinedText = staff.created_at ? displayDate(staff.created_at) : "N/A";
  const extraDetails = [
    staff.job_title ? `Title: ${staff.job_title}` : "",
    staff.reference_ad_name ? `AD Reference: ${staff.reference_ad_name}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const actionMenu = canManageStaff && !isSelf ? renderStaffMenu(staff, isArchived) : renderStaffNote(isSelf);

  return `<article class="staff-row" data-staff-id="${escapeHtmlAttr(staff.id)}">
    <div class="staff-main">
      <div class="staff-primary">
        <h3 class="staff-name">${escapeHtml(staff.full_name || "Unnamed Staff")}</h3>
        <p class="staff-email">${escapeHtml(staff.email || "No email on file")}</p>
      </div>
      <div class="staff-meta">
        <span class="staff-tag">${escapeHtml(roleLabel(staff.role))}</span>
        <span class="staff-tag ${isArchived ? "archived" : "active"}">${escapeHtml(staffStatusLabel(staff.status))}</span>
        <span class="staff-date">Joined ${escapeHtml(joinedText)}</span>
      </div>
      ${extraDetails ? `<p class="staff-extra">${escapeHtml(extraDetails)}</p>` : ""}
    </div>
    <div class="staff-actions">
      ${actionMenu}
    </div>
  </article>`;
}

function renderStaffMenu(staff, isArchived) {
  return `<details class="staff-menu">
    <summary>Manage</summary>
    <div class="staff-menu-panel">
      <label class="staff-menu-label" for="role-${escapeHtmlAttr(staff.id)}">Role</label>
      <select id="role-${escapeHtmlAttr(staff.id)}" data-role-select>
        ${STAFF_ROLE_OPTIONS.map(
          (option) => `<option value="${escapeHtmlAttr(option.value)}" ${
            normalizeRole(staff.role) === option.value ? "selected" : ""
          }>${escapeHtml(option.label)}</option>`
        ).join("")}
      </select>
      <button type="button" class="staff-action-btn" data-action="save-role">Save Role</button>
      <button type="button" class="staff-action-btn ${isArchived ? "restore" : "archive"}" data-action="${
        isArchived ? "restore" : "archive"
      }">${isArchived ? "Restore Staff" : "Archive Staff"}</button>
    </div>
  </details>`;
}

function renderStaffNote(isSelf) {
  if (isSelf) {
    return '<span class="staff-note-pill">You</span>';
  }

  return '<span class="staff-note-pill">View only</span>';
}

async function handleStaffActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  if (normalizeRole(currentUser?.role) !== "athletic_director") {
    return;
  }

  const row = button.closest("[data-staff-id]");
  if (!row) {
    return;
  }

  const staffId = row.dataset.staffId;
  if (!staffId || staffId === currentUser.id) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const action = button.dataset.action;
    let successMessage = "";
    if (action === "save-role") {
      const select = row.querySelector("[data-role-select]");
      const role = select?.value || "";
      await updateStaffMember(staffId, { role });
      successMessage = "Staff role updated.";
    } else if (action === "archive") {
      await updateStaffMember(staffId, {
        archived_at: new Date().toISOString(),
        status: "archived",
      });
      successMessage = "Staff member archived.";
    } else if (action === "restore") {
      await updateStaffMember(staffId, {
        archived_at: null,
        status: "approved",
      });
      successMessage = "Staff member restored.";
    }

    schoolStaff = await fetchSchoolStaff();
    renderStaff();
    if (successMessage) {
      setStaffMessage(successMessage, "success");
    }
  } catch (error) {
    console.error(error);
    setStaffMessage(error.message || "Could not update school staff.", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function updateStaffMember(staffId, changes) {
  const payload = {
    ...changes,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("user_profiles")
    .update(payload)
    .eq("id", staffId)
    .eq("school_id", currentUser.school_id);

  if (error) {
    throw error;
  }
}

function setStaffMessage(message, tone) {
  if (!elements.staffMessage) {
    return;
  }

  if (!message) {
    elements.staffMessage.hidden = true;
    elements.staffMessage.className = "staff-banner";
    elements.staffMessage.textContent = "";
    return;
  }

  elements.staffMessage.hidden = false;
  elements.staffMessage.className = `staff-banner${tone ? ` ${tone}` : ""}`;
  elements.staffMessage.textContent = message;
}

function scopeKey(submission) {
  const parseReview = submission?.game_data?.parse_review || {};
  return parseReview.upload_lane || submission?.game_data?.submission_scope || "game_submission";
}

function sportLabel(sport, gender) {
  const context = resolveSportContext(sport, gender);
  return context.competitionLabel || SPORT_LABELS[context.sportKey] || titleCase(context.sportKey || "Unknown sport");
}

function statusKey(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "approved" || normalized === "rejected") {
    return normalized;
  }
  return "pending";
}

function normalizeSport(value) {
  return normalizeSportKey(value);
}

function displayDate(value) {
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
