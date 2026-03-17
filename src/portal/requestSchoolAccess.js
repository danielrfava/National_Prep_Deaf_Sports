import { supabase } from "../supabaseClient.js";
import { FALLBACK_SCHOOL_OPTIONS } from "./schoolDirectory.js";

const REQUEST_ACCESS_LOG_PREFIX = "[request-school-access]";

export const REQUEST_ACCESS_STEPS = Object.freeze({
  schoolLookup: "school_lookup",
  schoolAdminState: "school_admin_state",
  authSignup: "auth_signup",
});

const REQUEST_ACCESS_STEP_LABELS = Object.freeze({
  [REQUEST_ACCESS_STEPS.schoolLookup]: "school lookup",
  [REQUEST_ACCESS_STEPS.schoolAdminState]: "school admin routing",
  [REQUEST_ACCESS_STEPS.authSignup]: "account creation",
});

const AUTHORITY_VALIDATION_MESSAGES = Object.freeze([
  "Athletic Director access is already assigned for this school. Contact NPDS if this needs to be updated.",
  "Assistant AD access can only be requested after a verified school administrator is established for this school.",
  "Select a valid school before submitting.",
  "Non-Athletic Director requests require Athletic Director name and email.",
]);

function cleanValue(value) {
  return String(value || "").trim();
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

function getErrorCode(error) {
  return String(error?.code || error?.cause?.code || "").trim();
}

function getErrorMessage(error) {
  return String(error?.message || error?.cause?.message || "").trim();
}

function buildStepLabel(step) {
  return REQUEST_ACCESS_STEP_LABELS[step] || "request flow";
}

function buildRequestAccessError(step, message, cause = null) {
  const error = new Error(message);
  error.step = step;
  error.userMessage = message;
  error.cause = cause || null;
  error.code = getErrorCode(cause);
  error.details = String(cause?.details || "").trim();
  error.hint = String(cause?.hint || "").trim();
  return error;
}

export function logRequestAccessError(step, error, context = {}) {
  console.error(
    `${REQUEST_ACCESS_LOG_PREFIX} ${step}`,
    {
      context,
      details: String(error?.details || error?.cause?.details || "").trim(),
      hint: String(error?.hint || error?.cause?.hint || "").trim(),
      message: getErrorMessage(error),
      stepLabel: buildStepLabel(step),
      code: getErrorCode(error),
    },
    error
  );
}

export function describeRequestAccessError(error) {
  const step = String(error?.step || "").trim();
  const message = String(error?.userMessage || error?.message || "").trim();

  if (message) {
    return {
      step,
      stepLabel: buildStepLabel(step),
      userMessage: message,
    };
  }

  return {
    step,
    stepLabel: buildStepLabel(step),
    userMessage: `Could not complete the create account flow. Step: ${buildStepLabel(step)}.`,
  };
}

export async function loadRequestSchoolOptions() {
  const fallback = dedupeSchoolOptions(FALLBACK_SCHOOL_OPTIONS);

  try {
    const { data, error } = await supabase
      .from("schools")
      .select("id, full_name, short_name")
      .order("full_name", { ascending: true });

    if (error) {
      logRequestAccessError(REQUEST_ACCESS_STEPS.schoolLookup, error, {
        fallbackCount: fallback.length,
        source: "schools table",
      });
      return fallback;
    }

    const normalized = dedupeSchoolOptions(data || []);
    if (normalized.length) {
      return normalized;
    }

    if (fallback.length) {
      logRequestAccessError(
        REQUEST_ACCESS_STEPS.schoolLookup,
        buildRequestAccessError(
          REQUEST_ACCESS_STEPS.schoolLookup,
          "School lookup returned no rows. Falling back to bundled school list."
        ),
        {
          fallbackCount: fallback.length,
          source: "schools table",
        }
      );
      return fallback;
    }

    throw buildRequestAccessError(
      REQUEST_ACCESS_STEPS.schoolLookup,
      "Could not load the school list. Step: school lookup."
    );
  } catch (error) {
    logRequestAccessError(REQUEST_ACCESS_STEPS.schoolLookup, error, {
      fallbackCount: fallback.length,
      source: "schools table",
    });

    if (fallback.length) {
      return fallback;
    }

    throw buildRequestAccessError(
      REQUEST_ACCESS_STEPS.schoolLookup,
      "Could not load the school list. Step: school lookup.",
      error
    );
  }
}

export async function loadSchoolAdminState(schoolId) {
  const requestedSchoolId = cleanValue(schoolId);

  if (!requestedSchoolId) {
    return {
      hasVerifiedSchoolAdmin: false,
      primarySchoolAdminUserId: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc("get_school_admin_state", {
      requested_school_id: requestedSchoolId,
    });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] || null : data || null;

    return {
      hasVerifiedSchoolAdmin: Boolean(row?.has_verified_school_admin),
      primarySchoolAdminUserId: cleanValue(row?.primary_school_admin_user_id) || null,
    };
  } catch (error) {
    logRequestAccessError(REQUEST_ACCESS_STEPS.schoolAdminState, error, {
      school_id: requestedSchoolId,
    });

    throw buildRequestAccessError(
      REQUEST_ACCESS_STEPS.schoolAdminState,
      "Could not verify which roles are available for this school. Step: school admin routing.",
      error
    );
  }
}

export async function submitSchoolAccessRequest(payload) {
  const email = cleanValue(payload?.email).toLowerCase();
  const password = String(payload?.password || "");
  const metadata = {
    full_name: cleanValue(payload?.full_name),
    school_id: cleanValue(payload?.school_id),
    school_name: cleanValue(payload?.school_name),
    role: cleanValue(payload?.role),
    job_title: cleanValue(payload?.job_title),
    reference_ad_name: cleanValue(payload?.reference_ad_name),
    reference_ad_email: cleanValue(payload?.reference_ad_email).toLowerCase(),
    verification_notes: cleanValue(payload?.verification_notes),
  };

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (session?.user?.id) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        "Sign out of the current account before creating a new school account."
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      throw error;
    }

    const identities = Array.isArray(data?.user?.identities) ? data.user.identities : null;
    if (identities && identities.length === 0) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        "A school account or pending request already exists for this email."
      );
    }

    if (!data?.user?.id) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        "Could not create your account. Step: account creation."
      );
    }

    return data;
  } catch (error) {
    logRequestAccessError(REQUEST_ACCESS_STEPS.authSignup, error, {
      email,
      role: metadata.role,
      school_id: metadata.school_id,
    });

    if (error?.step === REQUEST_ACCESS_STEPS.authSignup) {
      throw error;
    }

    const normalizedMessage = getErrorMessage(error).toLowerCase();
    const exactMessage = getErrorMessage(error);

    if (AUTHORITY_VALIDATION_MESSAGES.some((message) => message.toLowerCase() === normalizedMessage)) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        exactMessage,
        error
      );
    }

    if (
      normalizedMessage.includes("already registered") ||
      normalizedMessage.includes("already exists") ||
      normalizedMessage.includes("duplicate key")
    ) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        "A school account or pending request already exists for this email.",
        error
      );
    }

    if (
      normalizedMessage.includes("password") &&
      (normalizedMessage.includes("short") || normalizedMessage.includes("least"))
    ) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.authSignup,
        "Password must be at least 10 characters.",
        error
      );
    }

    throw buildRequestAccessError(
      REQUEST_ACCESS_STEPS.authSignup,
      "Could not create your account. Step: account creation.",
      error
    );
  }
}
