import { mountPublicTopNav } from "../components/publicTopNav.js";
import { supabase } from "../supabaseClient.js";
import {
  CREATE_ACCOUNT_ROLE_OPTIONS,
  fetchCurrentSessionProfile,
  isAdminProfile,
  isApprovedSchoolProfile,
  loadSchoolOptions,
  requiresAthleticDirectorReference,
} from "./schoolAccess.js";

mountPublicTopNav({ active: "login", basePath: "../" });

const SUCCESS_MESSAGE =
  "Your request has been submitted for review. Access will be granted after approval.";

const form = document.getElementById("requestForm");
const alertBox = document.getElementById("alert");
const submitBtn = document.getElementById("submitBtn");
const successState = document.getElementById("successState");
const schoolSearchInput = document.getElementById("schoolSearch");
const schoolValueInput = document.getElementById("school");
const schoolOptionsList = document.getElementById("schoolOptionsList");
const roleSelect = document.getElementById("role");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const referenceAdNameInput = document.getElementById("referenceAdName");
const referenceAdEmailInput = document.getElementById("referenceAdEmail");
const verificationNotesInput = document.getElementById("verificationNotes");
const referenceNameHelp = document.getElementById("referenceNameHelp");
const referenceEmailHelp = document.getElementById("referenceEmailHelp");
const verificationHelp = document.getElementById("verificationHelp");

let schoolOptions = [];
let filteredSchoolOptions = [];
let activeSchoolIndex = -1;

window.addEventListener("DOMContentLoaded", init);

async function init() {
  await routeExistingSession();
  populateRoleOptions();
  await populateSchoolOptions();
  syncConditionalFields();
  roleSelect?.addEventListener("change", syncConditionalFields);
  bindSchoolCombobox();
  form?.addEventListener("submit", handleSubmit);
}

async function routeExistingSession() {
  try {
    const { session, profile } = await fetchCurrentSessionProfile();
    if (!session?.user?.id || !profile) {
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

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Session check failed:", error);
  }
}

function populateRoleOptions() {
  if (!roleSelect) {
    return;
  }

  roleSelect.innerHTML = '<option value="">Select role</option>';
  CREATE_ACCOUNT_ROLE_OPTIONS.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    roleSelect.appendChild(element);
  });
}

async function populateSchoolOptions() {
  if (!schoolSearchInput || !schoolValueInput) {
    return;
  }

  schoolOptions = await loadSchoolOptions();
  filteredSchoolOptions = [];
  closeSchoolOptions();
  syncSchoolValidity();
}

function syncConditionalFields() {
  const requireAdReference = requiresAthleticDirectorReference(roleSelect?.value);

  referenceAdNameInput.required = requireAdReference;
  referenceAdEmailInput.required = requireAdReference;

  referenceNameHelp.textContent = requireAdReference
    ? "Required for non-Athletic Director requests."
    : "Optional if you are the Athletic Director.";

  referenceEmailHelp.textContent = requireAdReference
    ? "Required for non-Athletic Director requests."
    : "Optional if you are the Athletic Director.";

  verificationHelp.textContent = requireAdReference
    ? "Optional, but include why you are helping with submissions if it will help review."
    : "Optional if you are the Athletic Director.";
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

function findSelectedSchool() {
  const schoolId = schoolValueInput?.value || "";
  return schoolOptions.find((school) => school.id === schoolId) || null;
}

function bindSchoolCombobox() {
  if (!schoolSearchInput || !schoolOptionsList) {
    return;
  }

  schoolSearchInput.addEventListener("input", () => {
    schoolValueInput.value = "";
    filterSchoolOptions(schoolSearchInput.value);
    if (schoolSearchInput.value.trim() && filteredSchoolOptions.length) {
      openSchoolOptions();
    } else {
      closeSchoolOptions();
    }
    syncSchoolValidity();
  });

  schoolSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && schoolOptionsList.hidden) {
      if (!schoolSearchInput.value.trim()) {
        return;
      }
      event.preventDefault();
      filterSchoolOptions(schoolSearchInput.value);
      if (filteredSchoolOptions.length) {
        openSchoolOptions();
      } else {
        closeSchoolOptions();
      }
      return;
    }

    if (schoolOptionsList.hidden) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeSchoolIndex = Math.min(activeSchoolIndex + 1, filteredSchoolOptions.length - 1);
      renderSchoolOptions();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeSchoolIndex = Math.max(activeSchoolIndex - 1, 0);
      renderSchoolOptions();
      return;
    }

    if (event.key === "Enter" && activeSchoolIndex >= 0) {
      event.preventDefault();
      selectSchoolOption(filteredSchoolOptions[activeSchoolIndex]);
      return;
    }

    if (event.key === "Escape") {
      closeSchoolOptions();
    }
  });

  schoolSearchInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      closeSchoolOptions();
      syncSchoolValidity();
    }, 120);
  });
}

function filterSchoolOptions(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  filteredSchoolOptions = schoolOptions
    .filter((school) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        String(school.label || "").toLowerCase().includes(normalizedQuery) ||
        String(school.short_name || "").toLowerCase().includes(normalizedQuery) ||
        String(school.id || "").toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 10);

  activeSchoolIndex = filteredSchoolOptions.length ? 0 : -1;
  renderSchoolOptions();
}

function renderSchoolOptions() {
  if (!schoolOptionsList || !schoolSearchInput) {
    return;
  }

  if (!filteredSchoolOptions.length) {
    closeSchoolOptions();
    return;
  }

  schoolOptionsList.innerHTML = filteredSchoolOptions
    .map(
      (school, index) => `
        <button
          type="button"
          class="portal-combobox-option${index === activeSchoolIndex ? " is-active" : ""}"
          data-school-id="${escapeHtmlAttr(school.id)}"
        >
          ${escapeHtml(school.label)}
        </button>
      `
    )
    .join("");

  schoolOptionsList.querySelectorAll("[data-school-id]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const option = schoolOptions.find((school) => school.id === button.dataset.schoolId);
      if (option) {
        selectSchoolOption(option);
      }
    });
  });
}

function selectSchoolOption(option) {
  if (!option || !schoolSearchInput || !schoolValueInput) {
    return;
  }

  schoolSearchInput.value = option.label;
  schoolValueInput.value = option.id;
  filteredSchoolOptions = [];
  activeSchoolIndex = -1;
  closeSchoolOptions();
  syncSchoolValidity();
}

function openSchoolOptions() {
  if (!schoolOptionsList || !schoolSearchInput) {
    return;
  }

  schoolOptionsList.hidden = false;
  schoolSearchInput.setAttribute("aria-expanded", "true");
}

function closeSchoolOptions() {
  if (!schoolOptionsList || !schoolSearchInput) {
    return;
  }

  schoolOptionsList.hidden = true;
  schoolOptionsList.innerHTML = "";
  schoolSearchInput.setAttribute("aria-expanded", "false");
}

function syncSchoolValidity() {
  if (!schoolSearchInput) {
    return;
  }

  if (!schoolSearchInput.value.trim()) {
    schoolSearchInput.setCustomValidity("Select your school.");
    return;
  }

  if (!schoolValueInput?.value) {
    schoolSearchInput.setCustomValidity("Select a school from the list.");
    return;
  }

  schoolSearchInput.setCustomValidity("");
}

async function handleSubmit(event) {
  event.preventDefault();
  hideAlert();
  syncConditionalFields();
  syncSchoolValidity();

  if (!form?.reportValidity()) {
    return;
  }

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

  const selectedSchool = findSelectedSchool();
  if (!selectedSchool) {
    showAlert("Select your school before submitting.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const payload = {
      full_name: document.getElementById("fullName")?.value?.trim() || "",
      school_id: selectedSchool.id,
      school_name: selectedSchool.full_name,
      role: roleSelect?.value || "school_staff",
      job_title: document.getElementById("jobTitle")?.value?.trim() || "",
      reference_ad_name: referenceAdNameInput?.value?.trim() || "",
      reference_ad_email: referenceAdEmailInput?.value?.trim() || "",
      verification_notes: verificationNotesInput?.value?.trim() || "",
    };

    const email = document.getElementById("email")?.value?.trim() || "";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: payload,
      },
    });

    if (error) {
      throw error;
    }

    if (!data?.user?.id) {
      throw new Error("Account request could not be created. Please try again.");
    }

    await supabase.auth.signOut();

    form.hidden = true;
    successState.hidden = false;
    showAlert(SUCCESS_MESSAGE, "success");
  } catch (error) {
    console.error("Create account error:", error);
    showAlert(error.message || "Could not submit your school access request.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Request";
  }
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
