import { supabase } from "../supabaseClient.js";
import { FALLBACK_SCHOOL_OPTIONS } from "./schoolDirectory.js";

const REQUEST_ACCESS_LOG_PREFIX = "[request-school-access]";

export const REQUEST_ACCESS_STEPS = Object.freeze({
  schoolLookup: "school_lookup",
  requestInsert: "request_insert",
});

const REQUEST_ACCESS_STEP_LABELS = Object.freeze({
  [REQUEST_ACCESS_STEPS.schoolLookup]: "school lookup",
  [REQUEST_ACCESS_STEPS.requestInsert]: "request write",
});

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
    userMessage: `Could not complete the school access request flow. Step: ${buildStepLabel(step)}.`,
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

export async function submitSchoolAccessRequest(payload) {
  try {
    const { error } = await supabase.from("school_access_requests").insert(payload);

    if (error) {
      throw error;
    }
  } catch (error) {
    logRequestAccessError(REQUEST_ACCESS_STEPS.requestInsert, error, {
      email: cleanValue(payload?.email).toLowerCase(),
      role: cleanValue(payload?.role),
      school_id: cleanValue(payload?.school_id),
    });

    const normalizedMessage = getErrorMessage(error).toLowerCase();

    if (normalizedMessage.includes("duplicate key")) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.requestInsert,
        "A school access request is already in review for this email.",
        error
      );
    }

    if (normalizedMessage.includes("already exists")) {
      throw buildRequestAccessError(
        REQUEST_ACCESS_STEPS.requestInsert,
        "A school access account already exists for this email.",
        error
      );
    }

    throw buildRequestAccessError(
      REQUEST_ACCESS_STEPS.requestInsert,
      "Could not submit your school access request. Step: request write.",
      error
    );
  }
}
