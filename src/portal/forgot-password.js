import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";
import { buildPasswordResetHref } from "./schoolAccess.js";

mountPublicTopNav({ active: "login", basePath: "../" });

const alertBox = document.getElementById("alert");
const emailInput = document.getElementById("email");
const form = document.getElementById("forgotPasswordForm");
const submitBtn = document.getElementById("submitBtn");

form?.addEventListener("submit", handleSubmit);

async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();

  const email = String(emailInput?.value || "").trim();
  if (!email) {
    showAlert("Enter the email address for your school dashboard account.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetHref(),
    });

    if (error) {
      throw error;
    }

    showAlert(
      "Check your email for the NPDS password reset link. It should open the secure reset page on www.nationalprepdeafsports.com.",
      "success"
    );
  } catch (error) {
    console.error("Password reset email failed:", error);
    showAlert(error.message || "Could not send the password reset email right now.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Reset Email";
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
