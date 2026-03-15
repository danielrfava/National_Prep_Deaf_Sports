import { supabase } from "../supabaseClient.js";
import {
  STAFF_ROLE_OPTIONS,
  fetchCurrentSessionProfile,
  isAdminProfile,
  normalizeRole,
  roleLabel,
} from "../portal/schoolAccess.js";

const METHOD_LABELS = Object.freeze({
  csv_upload: "CSV Upload",
  manual_form: "Manual Form",
  text_paste: "Text Paste",
});

const SCOPE_LABELS = Object.freeze({
  archive_only: "Archive Only",
  boxscore_text: "Text Box Score",
  export_file: "Export File",
  game_boxscore: "Game Box Score",
  game_submission: "Game Submission",
  pdf_review: "PDF Review",
  season_sheet: "Season Stats",
});

let currentUser = null;
let pendingUsers = [];
let pendingSubmissions = [];
let rejectContext = null;
let isDashboardLoading = false;

const elements = {
  adminIdentityChip: document.getElementById("adminIdentityChip"),
  approvedTodayCount: document.getElementById("approvedTodayCount"),
  cancelRejectBtn: document.getElementById("cancelRejectBtn"),
  confirmRejectBtn: document.querySelector('#rejectForm button[type="submit"]'),
  logoutBtn: document.getElementById("logoutBtn"),
  pendingSubmissionsCount: document.getElementById("pendingSubmissionsCount"),
  pendingUsersContainer: document.getElementById("pendingUsersContainer"),
  pendingUsersCount: document.getElementById("pendingUsersCount"),
  refreshDashboardBtn: document.getElementById("refreshDashboardBtn"),
  rejectForm: document.getElementById("rejectForm"),
  rejectModal: document.getElementById("rejectModal"),
  rejectModalCopy: document.getElementById("rejectModalCopy"),
  rejectModalTitle: document.getElementById("rejectModalTitle"),
  rejectReason: document.getElementById("rejectReason"),
  submissionsContainer: document.getElementById("submissionsContainer"),
  totalSubmissionsCount: document.getElementById("totalSubmissionsCount"),
};

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const { session, profile, profileError } = await fetchCurrentSessionProfile();

  if (!session?.user?.id) {
    window.location.href = "../portal/login.html";
    return;
  }

  if (profileError || !profile || !isAdminProfile(profile)) {
    alert("Access denied. Admin privileges required.");
    window.location.href = "../portal/dashboard.html";
    return;
  }

  currentUser = profile;
  if (elements.adminIdentityChip) {
    elements.adminIdentityChip.textContent = profile.full_name || profile.email || "Admin";
  }

  bindEvents();
  await loadDashboard();
}

function bindEvents() {
  elements.logoutBtn?.addEventListener("click", handleLogout);
  elements.refreshDashboardBtn?.addEventListener("click", () => {
    void loadDashboard();
  });
  elements.pendingUsersContainer?.addEventListener("click", handlePendingUsersClick);
  elements.submissionsContainer?.addEventListener("click", handleSubmissionActionsClick);
  elements.rejectForm?.addEventListener("submit", handleReject);
  elements.cancelRejectBtn?.addEventListener("click", closeRejectModal);
  elements.rejectModal?.addEventListener("click", (event) => {
    if (event.target === elements.rejectModal) {
      closeRejectModal();
    }
  });
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = "../portal/login.html";
}

async function loadDashboard() {
  if (isDashboardLoading) {
    return;
  }

  isDashboardLoading = true;
  setDashboardRefreshState(true);
  renderLoadingState();

  try {
    const [statsResult, usersResult, submissionsResult] = await Promise.allSettled([
      loadStats(),
      fetchPendingUsers(),
      fetchPendingSubmissions(),
    ]);

    if (usersResult.status === "fulfilled") {
      pendingUsers = usersResult.value;
      renderPendingUsers();
    } else {
      pendingUsers = [];
      console.error("Pending school access load failed:", usersResult.reason);
      renderPanelError(
        elements.pendingUsersContainer,
        "school access requests",
        usersResult.reason
      );
    }

    if (submissionsResult.status === "fulfilled") {
      pendingSubmissions = submissionsResult.value;
      renderPendingSubmissions();
    } else {
      pendingSubmissions = [];
      console.error("Pending submissions load failed:", submissionsResult.reason);
      renderPanelError(
        elements.submissionsContainer,
        "submissions",
        submissionsResult.reason
      );
    }

    if (statsResult.status === "fulfilled") {
      renderStats(statsResult.value);
    } else {
      console.error("Admin stats load failed:", statsResult.reason);
      renderStats({
        approvedTodayCount: 0,
        pendingSubmissionsCount: pendingSubmissions.length,
        pendingUsersCount: pendingUsers.length,
        totalSubmissionsCount: 0,
      });
    }
  } finally {
    isDashboardLoading = false;
    setDashboardRefreshState(false);
  }
}

function renderPanelError(target, label, error) {
  if (!target) {
    return;
  }

  const details = formatPanelError(error);
  target.innerHTML = `<div class="empty-state">Could not load ${escapeHtml(label)} right now.${
    details ? `<br><br>${escapeHtml(details)}` : ""
  }</div>`;
}

function setDashboardRefreshState(isLoading) {
  if (!elements.refreshDashboardBtn) {
    return;
  }

  elements.refreshDashboardBtn.disabled = isLoading;
  elements.refreshDashboardBtn.textContent = isLoading ? "Refreshing..." : "Refresh Queue";
}

function renderLoadingState() {
  elements.pendingUsersContainer.innerHTML =
    '<div class="empty-state">Loading school access requests...</div>';
  elements.submissionsContainer.innerHTML =
    '<div class="empty-state">Loading submissions...</div>';
}

function formatPanelError(error) {
  const parts = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!parts.length) {
    return "";
  }

  return dedupeStrings(parts).join(" ");
}

async function loadStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const [
    pendingUsersResult,
    pendingSubmissionsResult,
    approvedTodayResult,
    totalSubmissionsResult,
  ] = await Promise.all([
    supabase
      .from("school_access_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "approved"])
      .is("activated_at", null),
    supabase.from("game_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("game_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("reviewed_at", todayIso),
    supabase.from("game_submissions").select("*", { count: "exact", head: true }),
  ]);

  [pendingUsersResult, pendingSubmissionsResult, approvedTodayResult, totalSubmissionsResult].forEach((result) => {
    if (result.error) {
      throw result.error;
    }
  });

  return {
    approvedTodayCount: approvedTodayResult.count || 0,
    pendingSubmissionsCount: pendingSubmissionsResult.count || 0,
    pendingUsersCount: pendingUsersResult.count || 0,
    totalSubmissionsCount: totalSubmissionsResult.count || 0,
  };
}

function renderStats(stats) {
  elements.pendingUsersCount.textContent = String(stats.pendingUsersCount);
  elements.pendingSubmissionsCount.textContent = String(stats.pendingSubmissionsCount);
  elements.approvedTodayCount.textContent = String(stats.approvedTodayCount);
  elements.totalSubmissionsCount.textContent = String(stats.totalSubmissionsCount);
}

async function fetchPendingUsers() {
  const { data, error } = await supabase
    .from("school_access_requests")
    .select(
      "id, created_at, email, full_name, school_id, school_name, role, approved_role, status, job_title, reference_ad_name, reference_ad_email, verification_notes, rejection_reason, reviewed_at, approved_at, activation_email_sent_at, activated_at"
    )
    .in("status", ["pending", "approved"])
    .is("activated_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return sortSchoolAccessQueue(data || []);
}

async function fetchPendingSubmissions() {
  const { data, error } = await supabase
    .from("game_submissions")
    .select(
      "id, created_at, game_date, sport, gender, location, home_team_id, away_team_id, home_score, away_score, submission_method, status, original_data, submitter_school_id, game_data, user_profiles!submitted_by(full_name, school_name, email)"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

function sortSchoolAccessQueue(rows) {
  return [...(rows || [])].sort((left, right) => {
    const leftStatus = normalizeStatus(left?.status);
    const rightStatus = normalizeStatus(right?.status);
    const leftPriority = leftStatus === "pending" ? 0 : leftStatus === "approved" ? 1 : 2;
    const rightPriority = rightStatus === "pending" ? 0 : rightStatus === "approved" ? 1 : 2;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime();
  });
}

function renderPendingUsers() {
  if (!pendingUsers.length) {
    elements.pendingUsersContainer.innerHTML =
      '<div class="empty-state">No school access requests are waiting on approval or activation right now.</div>';
    return;
  }

  elements.pendingUsersContainer.innerHTML = pendingUsers.map(renderPendingUserCard).join("");
}

function renderPendingUserCard(user) {
  const model = buildPendingUserReviewModel(user);

  return `<article class="review-card" data-user-id="${escapeHtmlAttr(user.id)}">
    <div class="review-header">
      <div>
        <h3 class="review-title">${escapeHtml(user.full_name || "Unnamed Request")}</h3>
        <p class="review-subline">${escapeHtml(user.email || "No email on file")}</p>
      </div>
      <span class="status-chip ${model.statusTone}">${model.statusLabel}</span>
    </div>
    <div class="pill-row">
      <span class="meta-pill">${escapeHtml(user.school_name || user.school_id || "No school selected")}</span>
      <span class="meta-pill">${escapeHtml(model.rolePillLabel)}: ${escapeHtml(roleLabel(model.roleValue))}</span>
      <span class="meta-pill">${escapeHtml(model.statusMetaLabel)}</span>
    </div>

    <div class="issue-stack">
      ${renderIssueBox("Approval blocked", model.blockingReasons, "danger")}
      ${renderIssueBox("Review notes", model.reviewNotes, "warn")}
      ${renderIssueBox(model.actionBoxTitle, model.actionBoxItems, "ok")}
    </div>

    <div class="detail-grid">
      ${renderDetailCard("Job Title", user.job_title || "Not provided")}
      ${renderDetailCard(
        "Athletic Director Reference",
        buildReferenceValue(user.reference_ad_name, user.reference_ad_email)
      )}
      ${renderDetailCard("School ID", user.school_id || "Not set")}
      ${renderDetailCard("Verification Notes", user.verification_notes || "None provided")}
      ${renderDetailCard("Approved At", user.approved_at ? displayDate(user.approved_at, true) : "Not approved yet")}
      ${renderDetailCard(
        "Activation Email",
        user.activation_email_sent_at ? displayDate(user.activation_email_sent_at, true) : "Not sent yet"
      )}
    </div>
    ${
      model.canApprove
        ? `<label class="review-subline" for="role-${escapeHtmlAttr(user.id)}">Approve as role</label>
    <select id="role-${escapeHtmlAttr(user.id)}" class="request-role-select" data-role-select>
      ${STAFF_ROLE_OPTIONS.map(
        (option) => `<option value="${escapeHtmlAttr(option.value)}" ${
          normalizeRole(user.role) === option.value ? "selected" : ""
        }>${escapeHtml(option.label)}</option>`
      ).join("")}
    </select>`
        : ""
    }
    <div class="action-buttons">
      ${
        model.canResendActivation
          ? `<button class="btn btn-approve" type="button" data-action="resend-user-activation">
        Resend Activation Email
      </button>`
          : `<button class="btn btn-approve" type="button" data-action="approve-user">
        Approve and Send Activation
      </button>
      <button class="btn btn-reject" type="button" data-action="reject-user">Reject Request</button>`
      }
    </div>
  </article>`;
}

function buildPendingUserReviewModel(user, roleOverride = "") {
  const status = normalizeStatus(user?.status);
  const requestedRole = normalizeRole(roleOverride || user?.approved_role || user?.role) || "school_staff";
  const blockingReasons = [];
  const reviewNotes = [];
  const canApprove = status === "pending";
  const canResendActivation = status === "approved" && !user?.activated_at;

  if (canApprove) {
    if (!String(user?.full_name || "").trim()) {
      blockingReasons.push("Requester name is missing.");
    }

    if (!String(user?.email || "").trim()) {
      blockingReasons.push("Email is missing.");
    }

    if (!String(user?.school_id || "").trim()) {
      blockingReasons.push("School selection is missing.");
    }

    if (!requestedRole) {
      blockingReasons.push("Requested role is missing.");
    }

    if (!String(user?.job_title || "").trim()) {
      blockingReasons.push("Job title is missing.");
    }

    if (requestedRole !== "athletic_director") {
      if (!String(user?.reference_ad_name || "").trim()) {
        blockingReasons.push("Athletic Director reference name is missing.");
      }

      if (!String(user?.reference_ad_email || "").trim()) {
        blockingReasons.push("Athletic Director reference email is missing.");
      }
    } else {
      reviewNotes.push("Athletic Director requests can be approved without a reference contact.");
    }
  }

  if (String(user?.verification_notes || "").trim()) {
    reviewNotes.push("Verification notes are attached to this request.");
  }

  if (canResendActivation) {
    reviewNotes.push(
      user.activation_email_sent_at
        ? `Activation email last sent ${displayDate(user.activation_email_sent_at, true)}.`
        : "This request is approved but no activation email timestamp is recorded yet."
    );
    reviewNotes.push("Use resend activation only if the requester still needs the NPDS activation email.");
  }

  return {
    blockingReasons: dedupeStrings(blockingReasons),
    canApprove: canApprove && blockingReasons.length === 0,
    canResendActivation,
    reviewNotes: dedupeStrings(reviewNotes),
    actionBoxItems: canResendActivation
      ? [
          user.activation_email_sent_at
            ? "Approved request is waiting on activation. Resend only if the requester did not receive the last email."
            : "Approved request is waiting on activation and still needs the first activation email.",
        ]
      : canApprove && blockingReasons.length === 0
      ? ["This request is complete enough to approve and send activation."]
      : [],
    actionBoxTitle: canResendActivation ? "Activation follow-up" : "Ready to invite",
    rolePillLabel: canResendActivation ? "Approved Role" : "Requested Role",
    roleValue: canResendActivation ? user?.approved_role || requestedRole : requestedRole,
    statusLabel: canResendActivation ? "Approved" : canApprove && blockingReasons.length === 0 ? "Ready" : "Blocked",
    statusMetaLabel: canResendActivation
      ? `Approved ${displayDate(user?.approved_at, true)}`
      : `Submitted ${displayDate(user?.created_at, true)}`,
    statusTone: canResendActivation || (canApprove && blockingReasons.length === 0) ? "pending" : "danger",
  };
}

function renderPendingSubmissions() {
  if (!pendingSubmissions.length) {
    elements.submissionsContainer.innerHTML =
      '<div class="empty-state">No pending submissions to review.</div>';
    return;
  }

  elements.submissionsContainer.innerHTML = pendingSubmissions.map(renderSubmissionCard).join("");
}

function renderSubmissionCard(submission) {
  const model = buildSubmissionReviewModel(submission);
  const submitter = submission.user_profiles || {};

  return `<article class="review-card" data-submission-id="${escapeHtmlAttr(submission.id)}">
    <div class="review-header">
      <div>
        <h3 class="review-title">${escapeHtml(model.title)}</h3>
        <p class="review-subline">
          Submitter: ${escapeHtml(submitter.full_name || "Unknown")} | School: ${escapeHtml(
            submitter.school_name || submission.submitter_school_id || "Unknown"
          )} | Submitted: ${escapeHtml(displayDate(submission.created_at, true))}
        </p>
      </div>
      <span class="status-chip ${model.canApprove ? "pending" : "danger"}">${
        model.canApprove ? "Ready" : "Blocked"
      }</span>
    </div>

    <div class="pill-row">
      <span class="meta-pill">${escapeHtml(model.typeLabel)}</span>
      <span class="meta-pill">Method: ${escapeHtml(model.methodLabel)}</span>
      <span class="meta-pill">Scope: ${escapeHtml(model.scopeLabel)}</span>
      <span class="meta-pill">${escapeHtml(model.countPillLabel)}</span>
      <span class="meta-pill">Confidence: ${escapeHtml(model.confidenceLabel)}</span>
    </div>

    <div class="detail-grid">
      ${model.summaryCards.map((card) => renderDetailCard(card.label, card.value)).join("")}
    </div>

    <div class="issue-stack">
      ${renderIssueBox("Approval blocked", model.blockingReasons, "danger")}
      ${renderIssueBox("Review warnings", model.warningItems, "warn")}
      ${renderIssueBox(
        "Preview ready",
        model.canApprove && !model.warningItems.length
          ? ["No blocking issues were detected in the current publish output preview."]
          : [],
        "ok"
      )}
    </div>

    <div class="preview-block">
      <p class="section-kicker">Submission Preview</p>
      <p class="review-note">Parsed rows preview</p>
      ${renderSubmissionPreview(model)}
    </div>

    <div class="preview-block">
      <p class="section-kicker">Publish Output</p>
      <p class="review-note">What approval will attempt to write to live records.</p>
      ${renderPublishOutput(model)}
    </div>

    <div class="action-buttons">
      <button class="btn btn-approve" type="button" data-action="approve-submission" ${
        model.canApprove ? "" : "disabled"
      }>
        ${model.canApprove ? "Approve and Publish" : "Review Only"}
      </button>
      <button class="btn btn-reject" type="button" data-action="reject-submission">Reject Submission</button>
    </div>
  </article>`;
}

function renderIssueBox(title, items, tone) {
  if (!items?.length) {
    return "";
  }

  return `<section class="issue-box ${escapeHtmlAttr(tone)}">
    <h4>${escapeHtml(title)}</h4>
    <ul class="issue-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  </section>`;
}

function renderSubmissionPreview(model) {
  if (model.type === "schedule_results") {
    return renderGamePreviewTable(model.games);
  }

  if (model.type === "pdf_review") {
    return `
      <div class="detail-grid">
        ${renderDetailCard("PDF Type", model.pdfTypeLabel)}
        ${renderDetailCard("Season Hint", model.seasonsLabel)}
        ${renderDetailCard("Players Parsed", String(model.players.length))}
        ${renderDetailCard("Route Label", model.routeLabel)}
      </div>
      ${
        model.players.length
          ? renderPlayerPreviewTable(model.players, { statColumns: model.previewStatColumns, maxRows: 8 })
          : '<div class="empty-state">No parsed player rows are attached to this PDF intake yet.</div>'
      }
    `;
  }

  if (model.type === "text_boxscore" || model.type === "game_boxscore") {
    return `
      <div class="detail-grid">
        ${renderDetailCard("Teams", model.matchupTeamsLabel)}
        ${renderDetailCard("Final Score", model.scoreLabel)}
        ${renderDetailCard("Date", model.dateLabel)}
        ${renderDetailCard("Location", model.locationLabel)}
      </div>
      ${renderPlayerPreviewTable(model.players, { statColumns: model.previewStatColumns, maxRows: 10 })}
    `;
  }

  return renderPlayerPreviewTable(model.players, {
    statColumns: model.previewStatColumns,
    maxRows: 12,
  });
}

function renderPlayerPreviewTable(players, options = {}) {
  if (!players.length) {
    return '<div class="empty-state">No parsed player rows were attached to this submission.</div>';
  }

  const { maxRows = 10, statColumns = [] } = options;
  const selectedColumns = (statColumns.length ? statColumns : collectStatColumns(players)).slice(0, 6);
  const headerCells = ["Player", "School", "Season", ...selectedColumns]
    .map((label) => `<th>${escapeHtml(label)}</th>`)
    .join("");

  const bodyRows = players
    .slice(0, maxRows)
    .map((player) => {
      const season = player?.meta?.season || "N/A";
      const schoolName = player.school_name || player.team || "N/A";
      const statCells = selectedColumns
        .map((key) => `<td>${escapeHtml(formatStatValue(player?.stats?.[key]))}</td>`)
        .join("");

      return `<tr>
        <td>${escapeHtml(player.name || "Unknown")}</td>
        <td>${escapeHtml(schoolName)}</td>
        <td>${escapeHtml(season)}</td>
        ${statCells}
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap">
    <table class="preview-table">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

function renderGamePreviewTable(games) {
  if (!games.length) {
    return '<div class="empty-state">No recognized game rows are attached to this submission.</div>';
  }

  const bodyRows = games
    .slice(0, 12)
    .map(
      (game) => `<tr>
        <td>${escapeHtml(game.season || "Not detected")}</td>
        <td>${escapeHtml(game.date || "Not detected")}</td>
        <td>${escapeHtml(game.homeTeam || "Unknown")}</td>
        <td>${escapeHtml(game.awayTeam || "Unknown")}</td>
        <td>${escapeHtml(game.scoreLabel || "Not detected")}</td>
        <td>${escapeHtml(game.location || "Not detected")}</td>
      </tr>`
    )
    .join("");

  return `<div class="table-wrap">
    <table class="preview-table">
      <thead>
        <tr>
          <th>Season</th>
          <th>Date</th>
          <th>Home</th>
          <th>Away</th>
          <th>Final</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

function buildSubmissionReviewModel(submission) {
  const gameData = submission.game_data || {};
  const game = gameData.game || {};
  const parseReview = gameData.parse_review || {};
  const submitter = submission.user_profiles || {};
  const players = Array.isArray(gameData.players) ? gameData.players : [];
  const mappedHeaders = normalizeMappedHeaders(parseReview.mapped_headers);
  const unresolvedHeaders = collectUnmappedColumns(parseReview, mappedHeaders);
  const missingRequiredFields = collectMissingRequiredFields(parseReview);
  const scope = String(gameData.submission_scope || parseReview.upload_lane || "game_submission").toLowerCase();
  const uploadLane = String(parseReview.upload_lane || "").toLowerCase();
  const gameSeasonHints = extractSubmissionGameSeasonHints(gameData);
  const seasons = collectDetectedSeasons(players, parseReview, gameSeasonHints);
  const games = buildGamePreviewRows(submission, gameData, seasons);
  const type = determineSubmissionType(scope, uploadLane, parseReview, players, games);
  const sportLabel = buildSportLabel(submission.sport || game.sport, submission.gender || game.gender);
  const firstGame = games[0] || {};
  const hasMatchup = games.some(hasGameMatchup);
  const hasGameScore = games.some(hasGameScoreValues);
  const publishableGames = games.filter(isPublishableGameRow);
  const recognizedStatColumns = collectRecognizedStatColumns(players, mappedHeaders);
  const publishBlockedReason =
    type === "schedule_results" && games.length > 1
      ? "This schedule/results submission contains multiple game rows, but the current approval pipeline can only publish one game at a time."
      : "";
  const writesGame = !publishBlockedReason && type !== "pdf_review" && publishableGames.length > 0;
  const writesRawRows = players.length > 0;
  const writesPlayerStats = writesGame && players.length > 0;
  const schoolLabel = submitter.school_name || submission.submitter_school_id || "Unknown school";
  const confidenceValue = parseConfidenceValue(parseReview.confidence ?? gameData.confidence);
  const confidenceLabel = formatConfidence(confidenceValue);
  const routeLabel = String(parseReview.route_label || "Manual review needed").trim();
  const duplicateRisk = String(parseReview.duplicate_risk || "low").trim() || "low";
  const warningItems = buildSubmissionWarnings({
    confidenceLabel,
    confidenceValue,
    duplicateRisk,
    hasGameScore,
    hasMatchup,
    parseReview,
    players,
    recognizedStatColumns,
    routeLabel,
    type,
    unresolvedHeaders,
    warnings: [
      ...(Array.isArray(gameData.warnings) ? gameData.warnings : []),
      ...(Array.isArray(parseReview.warnings) ? parseReview.warnings : []),
    ],
  });
  const publishOutput = buildPublishOutputModel({
    games,
    players,
    publishBlockedReason,
    publishableGameCount: publishableGames.length,
    schoolLabel,
    seasons,
    sportLabel,
    type,
    writesGame,
    writesPlayerStats,
    writesRawRows,
  });
  const blockingReasons = buildSubmissionBlockingReasons({
    confidenceValue,
    games,
    hasGameScore,
    hasMatchup,
    missingRequiredFields,
    players,
    publishBlockedReason,
    publishOutput,
    recognizedStatColumns,
    routeLabel,
    schoolLabel,
    seasons,
    sportLabel,
    type,
    unresolvedHeaders,
  });

  return {
    blockingReasons,
    canApprove: blockingReasons.length === 0,
    confidenceLabel,
    countPillLabel: type === "schedule_results" ? `Games: ${games.length}` : `Players: ${players.length}`,
    dateLabel: firstGame.date || "Not detected",
    duplicateRisk,
    games,
    hasGameScore,
    hasMatchup,
    locationLabel: firstGame.location || "Not detected",
    matchupLabel: hasMatchup
      ? `${firstGame.homeTeam} vs ${firstGame.awayTeam}${firstGame.scoreLabel ? ` | ${firstGame.scoreLabel}` : ""}`
      : "School-scoped individual stats upload",
    matchupTeamsLabel: hasMatchup ? `${firstGame.homeTeam} vs ${firstGame.awayTeam}` : "Not detected",
    methodLabel: buildMethodLabel(submission.submission_method),
    players,
    pdfTypeLabel: String(parseReview.pdf_type || "Not detected"),
    previewStatColumns: recognizedStatColumns,
    publishOutput,
    routeLabel,
    scoreLabel: firstGame.scoreLabel || "Not detected",
    scope,
    scopeLabel: SCOPE_LABELS[scope] || titleCase(scope.replace(/_/g, " ")),
    schoolLabel,
    seasons,
    seasonsLabel: seasons.length ? seasons.join(", ") : "Not detected",
    sportLabel,
    summaryCards: buildSubmissionSummaryCards({
      duplicateRisk,
      games,
      methodLabel: buildMethodLabel(submission.submission_method),
      missingRequiredFields,
      players,
      recognizedStatColumns,
      routeLabel,
      schoolLabel,
      seasons,
      sportLabel,
      type,
      unresolvedHeaders,
      uploadTypeLabel: formatSubmissionTypeLabel(type),
    }),
    title:
      type === "pdf_review"
        ? `${sportLabel} PDF Review`
        : type === "individual_stats"
        ? `${sportLabel} Season Stats Upload`
        : hasMatchup
        ? `${sportLabel} - ${firstGame.homeTeam} vs ${firstGame.awayTeam}`
        : `${sportLabel} Submission`,
    type,
    typeLabel: formatSubmissionTypeLabel(type),
    warningItems,
    writesGame,
    writesPlayerStats,
    writesRawRows,
  };
}

function determineSubmissionType(scope, uploadLane, parseReview, players, games) {
  const sourceType = String(parseReview.source_type || "").toLowerCase();
  if (scope === "pdf_review" || uploadLane === "pdf_review" || sourceType === "pdf_report") {
    return "pdf_review";
  }

  if (scope === "season_sheet") {
    return "individual_stats";
  }

  if (
    scope === "schedule_results" ||
    uploadLane === "schedule_results" ||
    sourceType.includes("game_summary") ||
    sourceType.includes("schedule")
  ) {
    return "schedule_results";
  }

  if (uploadLane === "boxscore_text") {
    return "text_boxscore";
  }

  if (uploadLane === "export_file") {
    return players.length ? "individual_stats" : games.length ? "schedule_results" : "export_file";
  }

  if (scope === "game_boxscore" || (games.length && players.length)) {
    return "game_boxscore";
  }

  if (games.length && !players.length) {
    return "schedule_results";
  }

  if (players.length) {
    return "individual_stats";
  }

  return "game_submission";
}

function formatSubmissionTypeLabel(type) {
  switch (type) {
    case "pdf_review":
      return "PDF Review Submission";
    case "individual_stats":
      return "Individual Season Stats";
    case "schedule_results":
      return "Schedule / Results Upload";
    case "text_boxscore":
      return "Text Box Score";
    case "game_boxscore":
      return "Parsed Game Box Score";
    case "export_file":
      return "Export File";
    default:
      return "Game Submission";
  }
}

function buildSubmissionSummaryCards({
  duplicateRisk,
  games,
  methodLabel,
  missingRequiredFields,
  players,
  recognizedStatColumns,
  routeLabel,
  schoolLabel,
  seasons,
  sportLabel,
  type,
  unresolvedHeaders,
  uploadTypeLabel,
}) {
  const cards = [
    { label: "School", value: schoolLabel },
    { label: "Sport", value: sportLabel },
    { label: "Season Scope", value: seasons.length ? seasons.join(", ") : "Not detected" },
    { label: "Upload Type", value: uploadTypeLabel },
    { label: "Submission Method", value: methodLabel },
    { label: type === "schedule_results" ? "Games Count" : "Player Count", value: String(type === "schedule_results" ? games.length : players.length) },
  ];

  if (type === "schedule_results") {
    cards.push({ label: "Game Fields", value: "Season, date, matchup, final score, location" });
  } else {
    cards.push({
      label: "Recognized Stat Columns",
      value: recognizedStatColumns.length ? summarizeList(recognizedStatColumns, 6) : "No stat columns detected",
    });
  }

  cards.push({
    label: "Unmapped Columns",
    value: unresolvedHeaders.length ? summarizeList(unresolvedHeaders, 4) : "None",
  });

  cards.push({
    label: type === "pdf_review" ? "Missing Required Fields" : "Route Label",
    value: type === "pdf_review"
      ? (missingRequiredFields.length ? summarizeList(missingRequiredFields, 4) : "None")
      : routeLabel,
  });

  cards.push({ label: "Duplicate Risk", value: duplicateRisk || "low" });

  return cards;
}

function buildSubmissionWarnings({
  confidenceLabel,
  confidenceValue,
  duplicateRisk,
  hasGameScore,
  hasMatchup,
  parseReview,
  players,
  recognizedStatColumns,
  routeLabel,
  type,
  unresolvedHeaders,
  warnings,
}) {
  const items = dedupeStrings(warnings);

  if (routeLabel && routeLabel !== "Ready for import") {
    items.push(`Route label is "${routeLabel}". Review before publish.`);
  }

  if (duplicateRisk && duplicateRisk !== "low") {
    items.push(`Duplicate risk is marked ${duplicateRisk}.`);
  }

  if (confidenceValue !== null && confidenceValue < 80) {
    items.push(`Parse confidence is ${confidenceLabel}.`);
  }

  if (unresolvedHeaders.length) {
    items.push(`${unresolvedHeaders.length} header(s) remain unmapped or unresolved.`);
  }

  if (!recognizedStatColumns.length && players.length && type !== "schedule_results" && type !== "pdf_review") {
    items.push("Player rows were found, but no recognized stat columns were detected.");
  }

  if ((type === "schedule_results" || type === "game_boxscore" || type === "text_boxscore") && !hasMatchup) {
    items.push("Team matchup mapping is incomplete.");
  }

  if ((type === "schedule_results" || type === "game_boxscore" || type === "text_boxscore") && !hasGameScore) {
    items.push("Final score is incomplete.");
  }

  if (Array.isArray(parseReview.missing_required_fields) && parseReview.missing_required_fields.length) {
    items.push(
      `Parse review flagged missing required fields: ${summarizeList(parseReview.missing_required_fields, 4)}.`
    );
  }

  return dedupeStrings(items);
}

function buildSubmissionBlockingReasons({
  confidenceValue,
  games,
  hasGameScore,
  hasMatchup,
  missingRequiredFields,
  players,
  publishBlockedReason,
  publishOutput,
  recognizedStatColumns,
  routeLabel,
  schoolLabel,
  seasons,
  sportLabel,
  type,
  unresolvedHeaders,
}) {
  const reasons = [];

  if (isUnknownLabel(schoolLabel, ["Unknown school"])) {
    reasons.push("Missing school scope.");
  }

  if (isUnknownLabel(sportLabel, ["Unknown sport", "Unknown"])) {
    reasons.push("Missing sport.");
  }

  if (missingRequiredFields.length) {
    reasons.push(`Missing required fields: ${summarizeList(missingRequiredFields, 4)}.`);
  }

  if (publishBlockedReason) {
    reasons.push(publishBlockedReason);
  }

  if (type === "pdf_review") {
    reasons.push("PDF review submissions are intake-only and cannot be approved for publish from this screen.");
  }

  if (type === "individual_stats" || type === "export_file") {
    if (!players.length) {
      reasons.push("No recognized player rows were found.");
    }
    if (!recognizedStatColumns.length) {
      reasons.push("No recognized stat columns were detected.");
    }
    if (!seasons.length) {
      reasons.push("Missing season scope for player stat publish.");
    }
    if (unresolvedHeaders.length && /field mapping/i.test(routeLabel)) {
      reasons.push(`Unmapped columns still need confirmation: ${summarizeList(unresolvedHeaders, 4)}.`);
    }
    if (confidenceValue !== null && confidenceValue < 65) {
      reasons.push("Parse confidence is too low for blind approval.");
    }
  }

  if (type === "schedule_results") {
    if (!games.length) {
      reasons.push("No recognized game rows were found.");
    }
    if (!hasMatchup) {
      reasons.push("Missing game matchup teams.");
    }
    if (!hasGameScore) {
      reasons.push("Missing final score.");
    }
    if (!seasons.length && !games.some((game) => game.date && game.date !== "Not detected")) {
      reasons.push("Missing season or game date scope.");
    }
  }

  if (type === "game_boxscore" || type === "text_boxscore") {
    if (!games.length) {
      reasons.push("No recognized game row was parsed.");
    }
    if (!hasMatchup) {
      reasons.push("Missing teams.");
    }
    if (!hasGameScore) {
      reasons.push("Missing final score.");
    }
    if (!players.length) {
      reasons.push("No recognized player rows were parsed.");
    }
    if (confidenceValue !== null && confidenceValue < 55) {
      reasons.push("Parse confidence is too low for publish.");
    }
  }

  if (!publishBlockedReason && publishOutput.totalWriteRows === 0 && type !== "pdf_review") {
    reasons.push("Suspicious empty publish output. No live rows would be written.");
  }

  return dedupeStrings(reasons);
}

function buildPublishOutputModel({
  games,
  players,
  publishBlockedReason,
  publishableGameCount,
  schoolLabel,
  seasons,
  sportLabel,
  type,
  writesGame,
  writesPlayerStats,
  writesRawRows,
}) {
  if (publishBlockedReason) {
    return {
      destinationSummary: "No live publish destination",
      destinations: [],
      mergeNote: publishBlockedReason,
      scopeLabel: `${schoolLabel} | ${sportLabel} | ${seasons.length ? seasons.join(", ") : "Season not detected"}`,
      totalWriteRows: 0,
      writeMode: "Review only",
    };
  }

  const destinations = [];

  if (writesGame) {
    destinations.push({
      table: "games",
      rowCount: publishableGameCount || 1,
      detail: "Insert new game result rows for the approved matchup.",
    });
  }

  if (writesPlayerStats) {
    destinations.push({
      table: "player_stats",
      rowCount: players.length,
      detail: "Insert player stat rows linked to the approved game row.",
    });
  }

  if (writesRawRows) {
    destinations.push({
      table: "raw_stat_rows",
      rowCount: players.length,
      detail: "Insert school-scoped stat rows for public research and athlete pages.",
    });
  }

  if (type !== "pdf_review" && (writesGame || writesPlayerStats || writesRawRows)) {
    destinations.push({
      table: "game_submissions",
      rowCount: 1,
      detail: "Update this submission status to approved and stamp review metadata.",
    });
  }

  return {
    destinationSummary: destinations.length
      ? destinations.map((destination) => destination.table).join(", ")
      : "No live publish destination",
    destinations,
    mergeNote: destinations.length
      ? "Current approval flow inserts new rows only. No update or merge logic is applied during approval."
      : "No live publish path is available from this preview in its current state.",
    scopeLabel: `${schoolLabel} | ${sportLabel} | ${seasons.length ? seasons.join(", ") : "Season not detected"}`,
    totalWriteRows: destinations.reduce((sum, destination) => sum + destination.rowCount, 0),
    writeMode: destinations.length ? "Insert new rows only" : "Review only",
  };
}

function renderPublishOutput(model) {
  return `
    <div class="output-grid">
      ${renderDetailCard("Destination Tables", model.publishOutput.destinationSummary)}
      ${renderDetailCard("Rows To Write", String(model.publishOutput.totalWriteRows))}
      ${renderDetailCard("Publish Scope", model.publishOutput.scopeLabel)}
      ${renderDetailCard("Write Mode", model.publishOutput.writeMode)}
    </div>
    <div class="destination-list">
      ${
        model.publishOutput.destinations.length
          ? model.publishOutput.destinations.map(renderDestinationRow).join("")
          : '<div class="empty-state">No publishable destination rows are ready from this submission yet.</div>'
      }
    </div>
    <p class="output-note">${escapeHtml(model.publishOutput.mergeNote)}</p>
  `;
}

function renderDestinationRow(destination) {
  return `<div class="destination-row">
    <div>
      <p class="destination-name">${escapeHtml(destination.table)}</p>
      <p class="destination-meta">${escapeHtml(destination.detail)}</p>
    </div>
    <span class="destination-count">${escapeHtml(String(destination.rowCount))}</span>
  </div>`;
}

function buildGamePreviewRows(submission, gameData, seasons) {
  const explicitGames = Array.isArray(gameData.games) ? gameData.games : [];
  if (explicitGames.length) {
    return explicitGames.map((game) => normalizeGamePreviewRow(game, submission, seasons[0] || ""));
  }

  const row = normalizeGamePreviewRow(gameData.game || {}, submission, seasons[0] || "");
  const hasAnyData = [
    row.date,
    row.homeTeam,
    row.awayTeam,
    row.location,
    row.homeScore,
    row.awayScore,
  ].some((value) => value !== null && value !== undefined && value !== "" && value !== "Not detected");

  return hasAnyData ? [row] : [];
}

function normalizeGamePreviewRow(game, submission, seasonValue) {
  const homeTeam = getTeamName(game.home_team, game.homeTeam || submission.home_team_id);
  const awayTeam = getTeamName(game.away_team, game.awayTeam || submission.away_team_id);
  const homeScore = parseScoreValue(firstDefined(game?.home_team?.score, game.homeScore, submission.home_score));
  const awayScore = parseScoreValue(firstDefined(game?.away_team?.score, game.awayScore, submission.away_score));
  const rawDate = firstDefined(game.date, submission.game_date);
  const gameSeason = getGameSeasonValue(game, seasonValue);

  return {
    awayScore,
    awayTeam: awayTeam || "Unknown",
    date: rawDate ? displayDate(rawDate) : "Not detected",
    homeScore,
    homeTeam: homeTeam || "Unknown",
    location: firstDefined(game.location, submission.location) || "Not detected",
    scoreLabel: homeScore !== null && awayScore !== null ? `${homeScore} - ${awayScore}` : "Not detected",
    season: gameSeason || "Not detected",
  };
}

function extractSubmissionGameSeasonHints(gameData) {
  const explicitGames = Array.isArray(gameData?.games) ? gameData.games : [];
  const explicitSeasons = explicitGames.map((game) => getGameSeasonValue(game)).filter(Boolean);
  const singleGameSeason = getGameSeasonValue(gameData?.game || {});
  return dedupeStrings([...explicitSeasons, singleGameSeason]);
}

function getGameSeasonValue(game, fallbackSeason = "") {
  return String(firstDefined(game?.season, game?.season_hint, game?.meta?.season, fallbackSeason) || "").trim();
}

function hasGameMatchup(game) {
  return !isGenericTeamName(game?.homeTeam) && !isGenericTeamName(game?.awayTeam);
}

function hasGameScoreValues(game) {
  const homeScore = game?.homeScore;
  const awayScore = game?.awayScore;
  const hasHomeScore = homeScore !== null && homeScore !== undefined && homeScore !== "" && Number.isFinite(Number(homeScore));
  const hasAwayScore = awayScore !== null && awayScore !== undefined && awayScore !== "" && Number.isFinite(Number(awayScore));
  return hasHomeScore && hasAwayScore;
}

function isPublishableGameRow(game) {
  return hasGameMatchup(game) && hasGameScoreValues(game);
}

function collectRecognizedStatColumns(players, mappedHeaders) {
  const mappedColumns = Object.values(mappedHeaders).filter(
    (value) => value && !["__ignore__", "athlete_name", "school_name", "season"].includes(value)
  );
  return dedupeStrings([...mappedColumns, ...collectStatColumns(players)]);
}

function normalizeMappedHeaders(mappedHeaders) {
  if (!mappedHeaders || typeof mappedHeaders !== "object" || Array.isArray(mappedHeaders)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(mappedHeaders)
      .map(([key, value]) => [String(key || "").trim(), String(value || "").trim()])
      .filter(([key]) => key)
  );
}

function collectUnmappedColumns(parseReview, mappedHeaders) {
  const unresolved = Array.isArray(parseReview.unresolved_headers)
    ? parseReview.unresolved_headers.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const blankMapped = Object.entries(mappedHeaders)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return dedupeStrings([...unresolved, ...blankMapped]);
}

function collectMissingRequiredFields(parseReview) {
  return Array.isArray(parseReview.missing_required_fields)
    ? dedupeStrings(parseReview.missing_required_fields.map((value) => String(value || "").trim()).filter(Boolean))
    : [];
}

function parseConfidenceValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseScoreValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function summarizeList(items, limit = 4) {
  const clean = dedupeStrings(items);
  if (!clean.length) {
    return "None";
  }

  return clean.length <= limit
    ? clean.join(", ")
    : `${clean.slice(0, limit).join(", ")} +${clean.length - limit} more`;
}

function dedupeStrings(items) {
  return Array.from(new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function isUnknownLabel(value, invalidValues = []) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || invalidValues.map((item) => String(item || "").trim().toLowerCase()).includes(normalized);
}

async function handlePendingUsersClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const card = button.closest("[data-user-id]");
  if (!card) {
    return;
  }

  const userId = card.dataset.userId;
  if (!userId) {
    return;
  }

  if (button.dataset.action === "approve-user") {
    const select = card.querySelector("[data-role-select]");
    const requestedRole = String(select?.value || "school_staff").trim();
    const request = pendingUsers.find((item) => item.id === userId);
    const model = request ? buildPendingUserReviewModel(request, requestedRole) : null;
    if (model && !model.canApprove) {
      alert(`Approval is blocked: ${model.blockingReasons.join(" | ")}`);
      return;
    }

    await approvePendingUser(userId, requestedRole, button);
    return;
  }

  if (button.dataset.action === "resend-user-activation") {
    await resendUserActivation(userId, button);
    return;
  }

  if (button.dataset.action === "reject-user") {
    openRejectModal({
      id: userId,
      type: "user",
      title: "Reject School Access Request",
      copy: "Add a short note so the review trail explains why this school access request was denied.",
    });
  }
}

async function handleSubmissionActionsClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const card = button.closest("[data-submission-id]");
  if (!card) {
    return;
  }

  const submissionId = card.dataset.submissionId;
  if (!submissionId) {
    return;
  }

  if (button.dataset.action === "approve-submission") {
    const submission = pendingSubmissions.find((item) => item.id === submissionId);
    const model = submission ? buildSubmissionReviewModel(submission) : null;
    if (model && !model.canApprove) {
      alert(`Approval is blocked: ${model.blockingReasons.join(" | ")}`);
      return;
    }
    await approvePendingSubmission(submissionId, button);
    return;
  }

  if (button.dataset.action === "reject-submission") {
    openRejectModal({
      id: submissionId,
      type: "submission",
      title: "Reject Submission",
      copy: "Add a short note so the school knows what needs to be fixed before resubmitting.",
    });
  }
}

async function approvePendingUser(userId, requestedRole, button) {
  const request = pendingUsers.find((item) => item.id === userId);
  const reviewModel = request ? buildPendingUserReviewModel(request, requestedRole) : null;
  const safeRole = STAFF_ROLE_OPTIONS.some((option) => option.value === requestedRole)
    ? requestedRole
    : "school_staff";

  if (reviewModel && !reviewModel.canApprove) {
    alert(`Approval is blocked: ${reviewModel.blockingReasons.join(" | ")}`);
    return;
  }

  if (!confirm("Approve this school access request and send the NPDS activation email?")) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Approving...";

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw sessionError || new Error("Admin session could not be verified.");
    }

    const response = await fetch("/.netlify/functions/approve-school-access-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        requestId: userId,
        approvedRole: safeRole,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result?.requestApproved) {
        await loadDashboard();
        throw new Error(
          `${result?.error || "Request approved, but the activation email could not be sent."} Use resend activation.`
        );
      }

      const blockerText = Array.isArray(result?.blockers) ? ` ${result.blockers.join(" | ")}` : "";
      throw new Error(`${result?.error || "Could not approve school access."}${blockerText}`.trim());
    }

    await loadDashboard();
  } catch (error) {
    console.error("User approval failed:", error);
    alert(`Could not approve school access: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function resendUserActivation(userId, button) {
  if (!confirm("Resend the NPDS activation email for this approved school access request?")) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Resending...";

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw sessionError || new Error("Admin session could not be verified.");
    }

    const response = await fetch("/.netlify/functions/resend-school-access-activation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        requestId: userId,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error || "Could not resend activation email.");
    }

    await loadDashboard();
    alert("Activation email sent.");
  } catch (error) {
    console.error("Activation resend failed:", error);
    alert(`Could not resend activation email: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function approvePendingSubmission(submissionId, button) {
  const submission = pendingSubmissions.find((item) => item.id === submissionId);
  const model = submission ? buildSubmissionReviewModel(submission) : null;

  if (model && !model.canApprove) {
    alert(`Approval is blocked: ${model.blockingReasons.join(" | ")}`);
    return;
  }

  if (!confirm("Approve this submission and publish it to the live data pipeline?")) {
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Approving...";

  try {
    const { error } = await supabase.rpc("approve_game_submission", {
      submission_id: submissionId,
    });

    if (error) {
      throw error;
    }

    await loadDashboard();
  } catch (error) {
    console.error("Submission approval failed:", error);
    alert(`Could not approve submission: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function openRejectModal(context) {
  rejectContext = context;
  elements.rejectModalTitle.textContent = context.title;
  elements.rejectModalCopy.textContent = context.copy;
  elements.rejectReason.value = "";
  elements.rejectModal.classList.add("show");
  elements.rejectReason.focus();
}

function closeRejectModal() {
  rejectContext = null;
  elements.rejectModal.classList.remove("show");
}

async function handleReject(event) {
  event.preventDefault();

  const reason = String(elements.rejectReason.value || "").trim();
  if (!reason || !rejectContext) {
    return;
  }

  const submitButton = elements.confirmRejectBtn;
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    if (rejectContext.type === "submission") {
      await rejectSubmission(rejectContext.id, reason);
    } else {
      await rejectUserRequest(rejectContext.id, reason);
    }

    closeRejectModal();
    await loadDashboard();
  } catch (error) {
    console.error("Rejection failed:", error);
    alert(`Could not save rejection: ${error.message}`);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

async function rejectSubmission(submissionId, reason) {
  const { error } = await supabase
    .from("game_submissions")
    .update({
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser.id,
      status: "rejected",
    })
    .eq("id", submissionId);

  if (error) {
    throw error;
  }
}

async function rejectUserRequest(userId, reason) {
  const existing = pendingUsers.find((user) => user.id === userId);
  const note = appendAdminReviewNote(existing?.verification_notes, reason);
  const timestamp = new Date().toISOString();

  const { error } = await supabase
    .from("school_access_requests")
    .update({
      rejection_reason: reason,
      reviewed_at: timestamp,
      reviewed_by: currentUser.id,
      status: "rejected",
      updated_at: timestamp,
      verification_notes: note,
    })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  if (existing?.email) {
    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({
        status: "rejected",
        updated_at: timestamp,
        verification_notes: note,
      })
      .eq("email", existing.email)
      .neq("role", "admin");

    if (profileError) {
      throw profileError;
    }
  }
}

function appendAdminReviewNote(existingNotes, reason) {
  const stamp = new Date().toISOString().split("T")[0];
  const prefix = `[Admin review ${stamp}] Rejected: ${reason}`;
  return [String(existingNotes || "").trim(), prefix].filter(Boolean).join("\n\n");
}

function renderDetailCard(label, value) {
  return `<div class="detail-card">
    <span class="detail-label">${escapeHtml(label)}</span>
    <span class="detail-value">${escapeHtml(value)}</span>
  </div>`;
}

function collectDetectedSeasons(players, parseReview, gameSeasonHints = []) {
  const playerSeasons = players
    .map((player) => String(player?.meta?.season || "").trim())
    .filter(Boolean);

  const reviewSeasons = Array.isArray(parseReview?.detected_seasons)
    ? parseReview.detected_seasons.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return dedupeStrings([...playerSeasons, ...reviewSeasons, ...(gameSeasonHints || [])]);
}

function collectStatColumns(players) {
  const columns = new Set();

  players.forEach((player) => {
    Object.keys(player?.stats || {}).forEach((key) => {
      if (key) {
        columns.add(key);
      }
    });
  });

  return Array.from(columns).sort();
}

function buildReferenceValue(name, email) {
  const parts = [String(name || "").trim(), String(email || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" | ") : "Not provided";
}

function buildSportLabel(sport, gender) {
  const sportText = titleCase(String(sport || "Unknown sport").replace(/_/g, " ").trim());
  const genderText = String(gender || "").trim();
  return genderText ? `${titleCase(genderText)} ${sportText}` : sportText;
}

function buildMethodLabel(method) {
  const normalized = String(method || "").trim().toLowerCase();
  return METHOD_LABELS[normalized] || titleCase(normalized.replace(/_/g, " ") || "Unknown");
}

function formatConfidence(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : "N/A";
}

function getTeamName(teamObject, fallback) {
  return String(teamObject?.name || fallback || "").trim();
}

function isGenericTeamName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || ["home", "away", "unknown", "n/a"].includes(normalized);
}

function displayDate(value, includeTime = false) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function formatStatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
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
