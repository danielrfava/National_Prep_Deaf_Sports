import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";
import { buildPasswordResetHref, setPortalFlash } from "./schoolAccess.js";

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
  if (redirectToCanonicalResetHost()) {
    return;
  }

  const recoveryState = await establishRecoverySession();
  const session = recoveryState.session;

  if (!session?.user?.id) {
    resetSummary.textContent = recoveryState.message;
    if (recoveryState.alertMessage) {
      showAlert(recoveryState.alertMessage);
    }
    return;
  }

  renderResetSummary(session.user);
  resetForm.hidden = false;
  resetForm.addEventListener("submit", handleSubmit);
}

function redirectToCanonicalResetHost() {
  if (window.location.hostname.toLowerCase() !== "nationalprepdeafsports.com") {
    return false;
  }

  const canonicalHref = new URL(buildPasswordResetHref());
  canonicalHref.search = window.location.search;
  canonicalHref.hash = window.location.hash;
  window.location.replace(canonicalHref.toString());
  return true;
}

async function establishRecoverySession() {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = hashParams.get("error_code") || searchParams.get("error_code") || "";
    const errorDescription =
      hashParams.get("error_description") || searchParams.get("error_description") || "";
    const errorName = hashParams.get("error") || searchParams.get("error") || "";

    if (errorCode || errorName || errorDescription) {
      return buildRecoveryFailure(formatRecoveryError(errorCode, errorName, errorDescription));
    }

    const existingSession = await getCurrentSession();
    if (existingSession?.user?.id) {
      clearRecoveryUrl();
      return { session: existingSession, message: "" };
    }

    const code = searchParams.get("code");
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return buildRecoveryFailure(formatRecoveryError(error.code, error.name, error.message));
      }

      clearRecoveryUrl();
      return {
        session: data?.session || (await getCurrentSession()),
        message: "",
      };
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        return buildRecoveryFailure(formatRecoveryError(error.code, error.name, error.message));
      }

      clearRecoveryUrl();
      return {
        session: data?.session || (await getCurrentSession()),
        message: "",
      };
    }
  } catch (error) {
    return buildRecoveryFailure(formatRecoveryError(error?.code, error?.name, error?.message));
  }

  return buildRecoveryFailure(
    "Open the newest NPDS password reset email to continue. If the link expired, request a fresh reset email from the login page."
  );
}

async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

function clearRecoveryUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

function buildRecoveryFailure(alertMessage) {
  return {
    session: null,
    alertMessage,
    message:
      "This password reset link is not active anymore. Request a fresh reset email and open the newest link directly from your inbox.",
  };
}

function formatRecoveryError(errorCode = "", errorName = "", errorMessage = "") {
  const detail = [errorCode, errorName, errorMessage].join(" ").toLowerCase();

  if (detail.includes("otp_expired") || detail.includes("expired")) {
    return "This password reset link has expired. Request a fresh reset email and open the newest link right away.";
  }

  if (detail.includes("access_denied")) {
    return "This password reset link was denied or is no longer valid. Request a new reset email and use the newest link only once.";
  }

  if (detail.includes("invalid") || detail.includes("verification")) {
    return "This password reset link is invalid. Request a new reset email and try again.";
  }

  if (errorMessage) {
    return errorMessage;
  }

  return "Could not verify this password reset link. Request a fresh reset email and try again.";
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

    setPortalFlash("Password updated. Sign in with your new password.", "success");
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn("Password updated, but sign-out cleanup failed:", signOutError);
    }
    resetForm.hidden = true;
    resetDone.hidden = false;
    showAlert("Password updated successfully.", "success");
    window.setTimeout(() => {
      window.location.href = "login.html";
    }, 1600);
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
