import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";
import {
  buildActivationHref,
  fetchCurrentSessionProfile,
  getBlockedAccessMessage,
  isAdminProfile,
  isApprovedSchoolProfile,
  needsActivationProfile,
  normalizeRole,
  normalizeStatus,
  roleLabel,
  staffStatusLabel,
} from "./schoolAccess.js";

mountPublicTopNav({ active: "login", basePath: "../" });

const elements = {
  banner: document.getElementById("statusBanner"),
  details: document.getElementById("statusDetails"),
  logout: document.getElementById("logoutBtn"),
  refresh: document.getElementById("refreshBtn"),
  subline: document.getElementById("statusSubline"),
  summary: document.getElementById("statusSummary"),
  title: document.getElementById("statusTitle"),
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

  if (isApprovedSchoolProfile(profile)) {
    window.location.href = "dashboard.html";
    return;
  }

  if (needsActivationProfile(profile)) {
    window.location.href = buildActivationHref();
    return;
  }

  elements.logout?.addEventListener("click", handleLogout);
  elements.refresh?.addEventListener("click", () => window.location.reload());
  renderProfile(profile);
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

function renderProfile(profile) {
  const status = normalizeStatus(profile?.status) || "pending";
  const state = buildStateModel(profile);

  elements.title.textContent = state.title;
  elements.subline.textContent = state.subline;
  elements.summary.innerHTML = `
    <strong>${escapeHtml(profile.full_name || profile.email || "School account")}</strong><br />
    <span>${escapeHtml(profile.school_name || profile.school_id || "School pending assignment")} | ${escapeHtml(
      roleLabel(profile.role)
    )}</span><br />
    <span>Status: ${escapeHtml(staffStatusLabel(status))}</span>
  `;

  elements.banner.textContent = state.banner;
  elements.banner.className = `portal-alert ${state.tone === "error" ? "portal-alert-error" : "portal-alert-success"}`;
  elements.banner.hidden = false;

  const cards = [
    detailCard("Email", profile.email || "Not available"),
    detailCard("Requested School", profile.school_name || profile.school_id || "Not assigned"),
    detailCard("Requested Role", roleLabel(profile.role)),
    detailCard("Job Title", profile.job_title || "Not provided"),
    detailCard("Submitted", formatDate(profile.created_at)),
  ];

  if (profile.approved_at) {
    cards.push(detailCard("Approved", formatDate(profile.approved_at)));
  }

  if (normalizeRole(profile.role) === "former_staff") {
    cards.push(detailCard("Account Scope", "Former staff accounts do not unlock the live school portal."));
  }

  if (String(profile.verification_notes || "").trim()) {
    cards.push(detailCard("Review Notes", profile.verification_notes));
  }

  elements.details.innerHTML = cards.join("");
}

function buildStateModel(profile) {
  const status = normalizeStatus(profile?.status) || "pending";
  const role = normalizeRole(profile?.role);
  const blockedMessage = getBlockedAccessMessage(profile);

  if (status === "pending") {
    return {
      title: "Your account is pending review.",
      subline: "You'll be able to access the school portal after your account is approved.",
      banner: blockedMessage,
      tone: "success",
    };
  }

  if (status === "rejected") {
    return {
      title: "This account is not active.",
      subline: "Your account request was not approved.",
      banner: blockedMessage,
      tone: "error",
    };
  }

  if (status === "archived") {
    return {
      title: "This account is archived.",
      subline: "Portal access is disabled for this account right now.",
      banner: blockedMessage,
      tone: "error",
    };
  }

  if (role === "former_staff") {
    return {
      title: "This account does not unlock the live portal.",
      subline: "Former staff access stays inactive for school submissions and private dashboard tools.",
      banner: blockedMessage,
      tone: "error",
    };
  }

  return {
    title: "Portal access is still limited.",
    subline: "This account cannot open protected school pages yet.",
    banner: blockedMessage,
    tone: "error",
  };
}

function detailCard(label, value) {
  return `<article class="portal-status-card">
    <p class="portal-status-label">${escapeHtml(label)}</p>
    <p class="portal-status-value">${escapeHtml(value)}</p>
  </article>`;
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
