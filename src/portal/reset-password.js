import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";

mountPublicTopNav({ active: "login", basePath: "../" });

const alertBox = document.getElementById("alert");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordInput = document.getElementById("password");
const resetDone = document.getElementById("resetDone");
const resetForm = document.getElementById("resetPasswordForm");
const resetSummary = document.getElementById("resetSummary");
const submitBtn = document.getElementById("submitBtn");

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const session = await waitForSession();

  if (!session?.user?.id) {
    resetSummary.textContent =
      "Open the password reset email from NPDS to continue. If the link expired, request a new reset email from the login page.";
    return;
  }

  renderResetSummary(session.user);
  resetForm.hidden = false;
  resetForm.addEventListener("submit", handleSubmit);
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

function renderResetSummary(user) {
  const email = user?.email || "your school account";
  resetSummary.innerHTML = `
    <strong>${escapeHtml(email)}</strong><br />
    <span>Set your new password once and use it the next time you sign in.</span>
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
  submitBtn.textContent = "Updating...";

  try {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }

    resetForm.hidden = true;
    resetDone.hidden = false;
    showAlert("Password updated successfully.", "success");
  } catch (error) {
    console.error("Password reset failed:", error);
    showAlert(error.message || "Could not update the password right now.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Update Password";
  }
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
