const {
  getSchoolAccessRequest,
  getUserFromAccessToken,
  getUserProfile,
  respond,
  upsertUserProfile,
  updateLegacyProfilesByEmail,
  updateSchoolAccessRequest,
} = require("./_supabase");
const {
  buildActivationRedirectUrl,
  sendActivationEmail,
} = require("./_school-access-activation");

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

function cleanValue(value) {
  return String(value || "").trim();
}

function buildApprovedProfilePayload(request, approvedRole, adminProfileId, approvalStamp) {
  return {
    id: cleanValue(request.auth_user_id),
    email: cleanValue(request.email).toLowerCase(),
    full_name: cleanValue(request.full_name),
    school_id: cleanValue(request.school_id),
    school_name: cleanValue(request.school_name),
    role: approvedRole,
    status: "approved",
    reference_ad_name: cleanValue(request.reference_ad_name) || null,
    reference_ad_email: cleanValue(request.reference_ad_email).toLowerCase() || null,
    job_title: cleanValue(request.job_title),
    verification_notes: cleanValue(request.verification_notes) || null,
    approved_by: adminProfileId,
    approved_at: approvalStamp,
    archived_at: null,
    updated_at: approvalStamp,
  };
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

    const approvalStamp = new Date().toISOString();

    const approvedRequest = await updateSchoolAccessRequest(requestId, {
      status: "approved",
      approved_role: approvedRole,
      approved_by: adminProfile.id,
      approved_at: approvalStamp,
      reviewed_by: adminProfile.id,
      reviewed_at: approvalStamp,
      rejection_reason: null,
    });

    const linkedAuthUserId = cleanValue(request.auth_user_id);

    if (linkedAuthUserId) {
      const approvedProfile = await upsertUserProfile(
        buildApprovedProfilePayload(request, approvedRole, adminProfile.id, approvalStamp)
      );

      return respond(200, {
        ok: true,
        flow: "linked_auth_user",
        request: approvedRequest || request,
        profile: approvedProfile,
      });
    }

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

    try {
      const redirectTo = buildActivationRedirectUrl(event, requestId);
      const activationMode = await sendActivationEmail(approvedRequest || request, approvedRole, redirectTo);
      const updatedRequest = await updateSchoolAccessRequest(requestId, {
        activation_email_sent_at: approvalStamp,
        updated_at: approvalStamp,
      });

      return respond(200, {
        ok: true,
        flow: "legacy_activation",
        activationMode,
        request: updatedRequest || approvedRequest,
      });
    } catch (activationError) {
      console.error("school access approved but activation email failed:", activationError);
      return respond(502, {
        error: `Request approved, but the activation email could not be sent. ${activationError.message || ""}`.trim(),
        requestApproved: true,
        resendAvailable: true,
        request: approvedRequest,
      });
    }

  } catch (error) {
    console.error("approve-school-access-request failed:", error);
    return respond(error.statusCode || 500, {
      error: error.message || "Could not approve this school access request.",
    });
  }
};
