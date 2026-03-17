import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";
import {
  fetchCurrentSessionProfile,
  isAdminProfile,
  isApprovedSchoolProfile,
} from "./schoolAccess.js";

mountPublicTopNav({ active: "login", basePath: "../" });

const alertBox = document.getElementById("alert");
const activationDone = document.getElementById("activationDone");
const activationForm = document.getElementById("activationForm");
const activationSummary = document.getElementById("activationSummary");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");

const requestId = new URLSearchParams(window.location.search).get("request") || "";

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const session = await waitForSession();

  if (!session?.user?.id) {
    activationSummary.textContent =
      "Open the legacy NPDS activation email to continue setup. If the link expired, ask an admin to resend it.";
    return;
  }

  try {
    const { profile } = await fetchCurrentSessionProfile();

    if (profile && isAdminProfile(profile)) {
      window.location.href = "../admin/admin-dashboard.html";
      return;
    }

    if (profile && isApprovedSchoolProfile(profile)) {
      window.location.href = "dashboard.html";
      return;
    }
  } catch (error) {
    console.error("Activation profile check failed:", error);
  }

  renderActivationSummary(session.user);
  activationForm.hidden = false;
  activationForm.addEventListener("submit", handleSubmit);
}

async function waitForSession(maxAttempts = 12) {
  for (let index = 0; index < maxAttempts; index += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      return session;
    }

    await delay(400);
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function renderActivationSummary(user) {
  const metadata = user?.user_metadata || {};
  const fullName = metadata.full_name || user?.email || "Approved school staff";
  const schoolName = metadata.school_name || metadata.school_id || "Assigned school";
  const role = formatRoleLabel(metadata.role || metadata.requested_role || "school_staff");

  activationSummary.innerHTML = `
    <strong>${escapeHtml(fullName)}</strong><br />
    <span>${escapeHtml(schoolName)} | ${escapeHtml(role)}</span><br />
    <span>Finish this legacy password setup once and your dashboard access will activate immediately.</span>
  `;
}

async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  const password = passwordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";

  if (password !== confirmPassword) {
    showAlert("Passwords do not match.");
    return;
  }

  if (password.length < 8) {
    showAlert("Password must be at least 8 characters.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Activating...";

  try {
    const { error: passwordError } = await supabase.auth.updateUser({
      password,
    });

    if (passwordError) {
      throw passwordError;
    }

    const rpcArgs = requestId ? { request_id: requestId } : {};
    const { error: activationError } = await supabase.rpc("complete_school_access_activation", rpcArgs);

    if (activationError) {
      throw activationError;
    }

    activationForm.hidden = true;
    activationDone.hidden = false;
    showAlert("Account activated successfully.", "success");
  } catch (error) {
    console.error("Activation failed:", error);
    showAlert(error.message || "Could not activate this school account.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Activate Account";
  }
}

function formatRoleLabel(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function showAlert(message, type = "error") {
  if (!alertBox) {
    return;
  }

  alertBox.textContent = message;
  alertBox.className = `portal-alert portal-alert-${type}`;
  alertBox.hidden = false;
}

function hideAlert() {
  if (!alertBox) {
    return;
  }

  alertBox.hidden = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
