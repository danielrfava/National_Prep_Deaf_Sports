const {
  getSchoolAccessRequest,
  getUserFromAccessToken,
  getUserProfile,
  respond,
  sendInviteEmail,
  sendRecoveryEmail,
  updateLegacyProfilesByEmail,
  updateSchoolAccessRequest,
} = require("./_supabase");

const APPROVED_ROLE_VALUES = new Set([
  "athletic_director",
  "assistant_ad",
  "coach",
  "stats_staff",
  "volunteer",
  "school_staff",
  "former_staff",
]);

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function buildApprovalBlockers(request, approvedRole) {
  const blockers = [];

  if (!request) {
    blockers.push("The school access request could not be found.");
    return blockers;
  }

  if (String(request.status || "").toLowerCase() !== "pending") {
    blockers.push(`This request is no longer pending. Current status: ${request.status || "unknown"}.`);
  }

  if (!String(request.full_name || "").trim()) {
    blockers.push("Requester name is missing.");
  }

  if (!String(request.email || "").trim()) {
    blockers.push("Requester email is missing.");
  }

  if (!String(request.school_id || "").trim()) {
    blockers.push("School assignment is missing.");
  }

  if (!String(request.school_name || "").trim()) {
    blockers.push("School name could not be resolved.");
  }

  if (!APPROVED_ROLE_VALUES.has(approvedRole)) {
    blockers.push("Approved role is not supported.");
  }

  if (!String(request.job_title || "").trim()) {
    blockers.push("Job title is missing.");
  }

  if (approvedRole !== "athletic_director") {
    if (!String(request.reference_ad_name || "").trim()) {
      blockers.push("Athletic Director reference name is missing.");
    }

    if (!String(request.reference_ad_email || "").trim()) {
      blockers.push("Athletic Director reference email is missing.");
    }
  }

  return blockers;
}

function extractBearerToken(headers = {}) {
  const rawHeader = headers.authorization || headers.Authorization || "";
  if (!rawHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return rawHeader.slice(7).trim();
}

function detectOrigin(event) {
  const forwardedProto =
    event.headers["x-forwarded-proto"] ||
    event.headers["X-Forwarded-Proto"] ||
    "https";
  const host =
    event.headers["x-forwarded-host"] ||
    event.headers["X-Forwarded-Host"] ||
    event.headers.host ||
    event.headers.Host ||
    "";

  if (host) {
    return `${forwardedProto}://${host}`;
  }

  return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || "";
}

async function sendActivationEmail(request, approvedRole, redirectTo) {
  const metadata = {
    school_access_request_id: request.id,
    full_name: request.full_name,
    school_id: request.school_id,
    school_name: request.school_name,
    role: approvedRole,
    requested_role: request.role,
    job_title: request.job_title,
    reference_ad_name: request.reference_ad_name,
    reference_ad_email: request.reference_ad_email,
    verification_notes: request.verification_notes,
  };

  try {
    await sendInviteEmail({
      email: request.email,
      redirectTo,
      data: metadata,
    });

    return "invite";
  } catch (error) {
    const message = String(error.message || "").toLowerCase();
    const alreadyExists =
      message.includes("already been registered") ||
      message.includes("user already registered") ||
      message.includes("already exists");

    if (!alreadyExists) {
      throw error;
    }

    await sendRecoveryEmail({
      email: request.email,
      redirectTo,
    });

    return "recovery";
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, {});
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  try {
    const accessToken = extractBearerToken(event.headers || {});
    const adminUser = await getUserFromAccessToken(accessToken);
    const adminProfile = await getUserProfile(adminUser.id);

    if (!adminProfile || normalizeRole(adminProfile.role) !== "admin") {
      return respond(403, { error: "Admin privileges are required." });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const requestId = String(body.requestId || "").trim();
    const approvedRole = normalizeRole(body.approvedRole);

    if (!requestId) {
      return respond(400, { error: "Request ID is required." });
    }

    const request = await getSchoolAccessRequest(requestId);
    const blockers = buildApprovalBlockers(request, approvedRole);

    if (blockers.length) {
      return respond(422, {
        error: "School access approval is blocked.",
        blockers,
      });
    }

    const origin = detectOrigin(event);
    const redirectTo = `${origin}/portal/activate-account.html?request=${encodeURIComponent(requestId)}`;
    const activationMode = await sendActivationEmail(request, approvedRole, redirectTo);
    const approvalStamp = new Date().toISOString();

    const updatedRequest = await updateSchoolAccessRequest(requestId, {
      status: "approved",
      approved_role: approvedRole,
      approved_by: adminProfile.id,
      approved_at: approvalStamp,
      reviewed_by: adminProfile.id,
      reviewed_at: approvalStamp,
      activation_email_sent_at: approvalStamp,
      rejection_reason: null,
    });

    await updateLegacyProfilesByEmail(request.email, {
      status: "invited",
      role: approvedRole,
      school_id: request.school_id,
      school_name: request.school_name,
      full_name: request.full_name,
      job_title: request.job_title,
      reference_ad_name: request.reference_ad_name,
      reference_ad_email: request.reference_ad_email,
      verification_notes: request.verification_notes,
      approved_by: adminProfile.id,
      approved_at: approvalStamp,
      archived_at: null,
      updated_at: approvalStamp,
    }).catch(() => []);

    return respond(200, {
      ok: true,
      activationMode,
      request: updatedRequest,
    });
  } catch (error) {
    console.error("approve-school-access-request failed:", error);
    return respond(error.statusCode || 500, {
      error: error.message || "Could not approve this school access request.",
    });
  }
};
