export const FLASH_STORAGE_KEY = "npds_portal_flash";

export const ACTIVE_SCHOOL_ROLE_OPTIONS = Object.freeze([
  { label: "Athletic Director", value: "athletic_director" },
  { label: "Assistant AD", value: "assistant_ad" },
  { label: "Coach", value: "coach" },
  { label: "Stats Staff", value: "stats_staff" },
  { label: "Volunteer", value: "volunteer" },
  { label: "School Staff", value: "school_staff" },
]);

export const CREATE_ACCOUNT_ROLE_OPTIONS = Object.freeze([
  ...ACTIVE_SCHOOL_ROLE_OPTIONS,
  { label: "Former Staff", value: "former_staff" },
]);

export const BOOTSTRAP_CREATE_ACCOUNT_ROLE_OPTIONS = Object.freeze([
  { label: "Athletic Director", value: "athletic_director" },
  { label: "Coach", value: "coach" },
  { label: "Stats Staff", value: "stats_staff" },
  { label: "Volunteer", value: "volunteer" },
  { label: "School Staff", value: "school_staff" },
  { label: "Former Staff", value: "former_staff" },
]);

export const MANAGED_CREATE_ACCOUNT_ROLE_OPTIONS = Object.freeze([
  { label: "Assistant AD", value: "assistant_ad" },
  { label: "Coach", value: "coach" },
  { label: "Stats Staff", value: "stats_staff" },
  { label: "Volunteer", value: "volunteer" },
  { label: "School Staff", value: "school_staff" },
  { label: "Former Staff", value: "former_staff" },
]);

export const SCHOOL_MANAGED_STAFF_ROLE_OPTIONS = Object.freeze([
  { label: "Assistant AD", value: "assistant_ad" },
  { label: "Coach", value: "coach" },
  { label: "Stats Staff", value: "stats_staff" },
  { label: "Volunteer", value: "volunteer" },
  { label: "School Staff", value: "school_staff" },
  { label: "Former Staff", value: "former_staff" },
]);

export const STAFF_ROLE_OPTIONS = Object.freeze([...CREATE_ACCOUNT_ROLE_OPTIONS]);

export const ROLE_LABELS = Object.freeze({
  athletic_director: "Athletic Director",
  assistant_ad: "Assistant AD",
  coach: "Coach",
  stats_staff: "Stats Staff",
  volunteer: "Volunteer",
  school_staff: "School Staff",
  former_staff: "Former Staff",
  admin: "Admin",
});

export const STAFF_STATUS_LABELS = Object.freeze({
  approved: "Active",
  archived: "Archived",
  invited: "Invited",
  pending: "Pending",
  rejected: "Rejected",
});

const SCHOOL_DASHBOARD_ROLES = new Set(
  ACTIVE_SCHOOL_ROLE_OPTIONS.map((option) => option.value)
);

export function cleanValue(value) {
  return String(value || "").trim();
}

export function normalizeRole(value) {
  return cleanValue(value).toLowerCase();
}

export function normalizeStatus(value) {
  return cleanValue(value).toLowerCase();
}

export function roleLabel(value) {
  const role = normalizeRole(value);
  return ROLE_LABELS[role] || "School Staff";
}

export function staffStatusLabel(value) {
  const status = normalizeStatus(value);
  return STAFF_STATUS_LABELS[status] || "Pending";
}

export function requiresAthleticDirectorReference(roleValue) {
  const role = normalizeRole(roleValue);
  return Boolean(role) && role !== "athletic_director";
}

export function normalizeSchoolAdminState(state) {
  return {
    hasVerifiedSchoolAdmin: Boolean(state?.hasVerifiedSchoolAdmin),
    primarySchoolAdminUserId: cleanValue(state?.primarySchoolAdminUserId) || null,
  };
}

export function getCreateAccountRoleOptionsForSchool(state) {
  return normalizeSchoolAdminState(state).hasVerifiedSchoolAdmin
    ? MANAGED_CREATE_ACCOUNT_ROLE_OPTIONS
    : BOOTSTRAP_CREATE_ACCOUNT_ROLE_OPTIONS;
}

export function getCreateAccountRoleHelpText(state) {
  return normalizeSchoolAdminState(state).hasVerifiedSchoolAdmin
    ? "School administrator access is already assigned for this school. Contact NPDS if this needs to be updated."
    : "Athletic Director requests for schools without an assigned school admin are reviewed directly by NPDS.";
}

export function buildCreateAccountSuccessCopy(state) {
  return normalizeSchoolAdminState(state).hasVerifiedSchoolAdmin
    ? {
        primary:
          "Your account request has been submitted and is now pending review by your athletic director.",
        secondary:
          "You'll be able to sign in fully once your athletic director approves your account.",
      }
    : {
        primary: "Your account request has been submitted and is now pending review by NPDS.",
        secondary: "You'll be able to sign in fully once NPDS approves your account.",
      };
}

export function isAdminProfile(profile) {
  return normalizeRole(profile?.role) === "admin";
}

export function isApprovedSchoolProfile(profile) {
  const role = normalizeRole(profile?.role);
  const status = normalizeStatus(profile?.status);
  const schoolId = cleanValue(profile?.school_id);
  return status === "approved" && Boolean(schoolId) && SCHOOL_DASHBOARD_ROLES.has(role);
}

export function needsActivationProfile(profile) {
  const role = normalizeRole(profile?.role);
  const status = normalizeStatus(profile?.status);
  const schoolId = cleanValue(profile?.school_id);
  return status === "invited" && Boolean(schoolId) && SCHOOL_DASHBOARD_ROLES.has(role);
}

export function getBlockedAccessMessage(profile) {
  const status = normalizeStatus(profile?.status);
  const role = normalizeRole(profile?.role);

  if (status === "invited") {
    return "Your account was approved under the legacy activation flow. Check your email for the activation link to finish setup.";
  }

  if (status === "pending") {
    return "Your account is pending review. You'll be able to access the school portal after your account is approved.";
  }

  if (status === "rejected") {
    return "Your account request was not approved. Contact your athletic director or NPDS admin if you believe this is a mistake.";
  }

  if (status === "archived") {
    return "Your school account is archived. Contact your Athletic Director or platform admin.";
  }

  if (!cleanValue(profile?.school_id)) {
    return "Your school account is missing a school assignment. Contact platform admin.";
  }

  if (role === "former_staff") {
    return "Your school account is inactive. Contact your Athletic Director or platform admin.";
  }

  return "You do not have access to this portal.";
}

export function buildActivationHref(requestId = "") {
  const url = new URL("activate-account.html", window.location.href);
  if (cleanValue(requestId)) {
    url.searchParams.set("request", cleanValue(requestId));
  }
  return url.toString();
}

export function buildAccountStatusHref() {
  return new URL("account-status.html", window.location.href).toString();
}

export function buildPasswordResetHref() {
  return new URL("reset-password.html", window.location.href).toString();
}

export function setPortalFlash(message, type = "error") {
  try {
    sessionStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify({ message, type }));
  } catch {
    // Session storage is optional.
  }
}

export function consumePortalFlash() {
  try {
    const raw = sessionStorage.getItem(FLASH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    sessionStorage.removeItem(FLASH_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (parsed?.message) {
      return parsed;
    }
  } catch {
    // Ignore malformed flash state.
  }

  return null;
}

export function mapSubmissionMethod(value) {
  const key = cleanValue(value).toLowerCase();

  if (!key) {
    return "csv_upload";
  }

  const mapped = {
    csv: "csv_upload",
    csv_upload: "csv_upload",
    manual: "manual_form",
    manual_form: "manual_form",
    text: "text_paste",
    text_paste: "text_paste",
  }[key];

  if (!mapped) {
    throw new Error(`Unsupported submission method: ${value}`);
  }

  return mapped;
}
