import { supabase } from "../supabaseClient.js";
import { FALLBACK_SCHOOL_OPTIONS } from "./schoolDirectory.js";

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

export const STAFF_ROLE_OPTIONS = Object.freeze([
  ...CREATE_ACCOUNT_ROLE_OPTIONS,
]);

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

function cleanValue(value) {
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
  return normalizeRole(roleValue) !== "athletic_director";
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
    return "Your request was approved. Check your email for the activation link so you can set your password.";
  }

  if (status === "pending") {
    return "Your school account is pending approval. You cannot submit stats yet.";
  }

  if (status === "rejected") {
    return "Your request was not approved. Contact platform admin if this is an error.";
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

export async function fetchCurrentSessionProfile() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.user?.id) {
    return { session: null, profile: null, profileError: null };
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", session.user.id)
    .limit(1);

  return { session, profile: Array.isArray(profileRows) ? profileRows[0] || null : null, profileError };
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

function normalizeSchoolOption(row) {
  const id = cleanValue(row?.id);
  const fullName = cleanValue(row?.full_name);
  const shortName = cleanValue(row?.short_name);
  const label = fullName || shortName || id;

  if (!id || !label) {
    return null;
  }

  return {
    id,
    full_name: fullName || label,
    short_name: shortName,
    label,
  };
}

function dedupeSchoolOptions(rows) {
  const deduped = new Map();

  (rows || []).forEach((row) => {
    const normalized = normalizeSchoolOption(row);
    if (normalized && !deduped.has(normalized.id)) {
      deduped.set(normalized.id, normalized);
    }
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

export async function loadSchoolOptions() {
  const fallback = dedupeSchoolOptions(FALLBACK_SCHOOL_OPTIONS);

  try {
    const { data, error } = await supabase
      .from("schools")
      .select("id, full_name, short_name")
      .order("full_name", { ascending: true });

    if (error) {
      return fallback;
    }

    const normalized = dedupeSchoolOptions(data || []);
    return normalized.length ? normalized : fallback;
  } catch {
    return fallback;
  }
}
