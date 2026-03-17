const {
  getSchoolAdminState,
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

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanValue(value) {
  return String(value || "").trim();
}

function resolveApprovalSource(request, isNpdsAdmin) {
  if (!isNpdsAdmin) {
    return "school_admin";
  }

  return normalizeRole(request?.approval_route) === "school_admin"
    ? "npds_admin_override"
    : "npds_bootstrap";
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

function isApprovedSchoolReviewer(profile, request) {
  return (
    normalizeRole(profile?.role) === "athletic_director" &&
    normalizeStatus(profile?.status) === "approved" &&
    !cleanValue(profile?.archived_at) &&
    cleanValue(profile?.school_id) &&
    cleanValue(profile?.school_id) === cleanValue(request?.school_id) &&
    normalizeRole(request?.approval_route) === "school_admin" &&
    cleanValue(request?.assigned_reviewer_user_id) === cleanValue(profile?.id)
  );
}

function buildApprovalBlockers(request, approvedRole, context = {}) {
  const blockers = [];
  const schoolAdminState = context.schoolAdminState || {
    hasVerifiedSchoolAdmin: false,
    primarySchoolAdminUserId: null,
  };

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

  if (
    cleanValue(context.actorProfile?.id) &&
    (cleanValue(request.auth_user_id) === cleanValue(context.actorProfile?.id) ||
      cleanValue(request.email).toLowerCase() === cleanValue(context.actorProfile?.email).toLowerCase())
  ) {
    blockers.push("You cannot approve your own school access request.");
  }

  if (context.isSchoolReviewer && approvedRole !== normalizeRole(request.role)) {
    blockers.push("School-level reviewers cannot change the requested role during approval.");
  }

  if (approvedRole === "athletic_director" && schoolAdminState.hasVerifiedSchoolAdmin) {
    blockers.push(
      "Athletic Director access is already assigned for this school. Contact NPDS if this needs to be updated."
    );
  }

  if (approvedRole === "assistant_ad" && !schoolAdminState.hasVerifiedSchoolAdmin) {
    blockers.push(
      "Assistant AD access can only be requested after a verified school administrator is established for this school."
    );
  }

  if (
    context.isSchoolReviewer &&
    cleanValue(schoolAdminState.primarySchoolAdminUserId) !== cleanValue(context.actorProfile?.id)
  ) {
    blockers.push("This request is no longer assigned to you for review.");
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
    const reviewerUser = await getUserFromAccessToken(accessToken);
    const reviewerProfile = await getUserProfile(reviewerUser.id);

    if (!reviewerProfile) {
      return respond(403, { error: "Reviewer profile could not be verified." });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const requestId = String(body.requestId || "").trim();

    if (!requestId) {
      return respond(400, { error: "Request ID is required." });
    }

    const request = await getSchoolAccessRequest(requestId);
    if (!request) {
      return respond(404, { error: "The school access request could not be found." });
    }

    const requestedRole = normalizeRole(request?.approved_role || request?.role);
    const approvedRole = normalizeRole(body.approvedRole) || requestedRole;
    const overrideReason = cleanValue(body.overrideReason) || null;
    const isNpdsAdmin = normalizeRole(reviewerProfile.role) === "admin";
    const isSchoolReviewer = isApprovedSchoolReviewer(reviewerProfile, request);

    if (!isNpdsAdmin && !isSchoolReviewer) {
      return respond(403, {
        error:
          normalizeRole(request?.approval_route) === "school_admin"
            ? "This request is assigned to a different school reviewer."
            : "Admin or assigned school reviewer privileges are required.",
      });
    }

    const schoolAdminState = await getSchoolAdminState(request?.school_id);
    const blockers = buildApprovalBlockers(request, approvedRole, {
      actorProfile: reviewerProfile,
      isNpdsAdmin,
      isSchoolReviewer,
      schoolAdminState,
    });

    if (blockers.length) {
      return respond(422, {
        error: "School access approval is blocked.",
        blockers,
      });
    }

    const approvalStamp = new Date().toISOString();
    const approvalSource = resolveApprovalSource(request, isNpdsAdmin);

    const approvedRequest = await updateSchoolAccessRequest(requestId, {
      status: "approved",
      approved_role: approvedRole,
      approved_by: reviewerProfile.id,
      approved_at: approvalStamp,
      reviewed_by: reviewerProfile.id,
      reviewed_at: approvalStamp,
      approval_source: approvalSource,
      acting_admin_user_id: isNpdsAdmin ? reviewerProfile.id : null,
      acted_at: approvalStamp,
      override_reason: approvalSource === "npds_admin_override" ? overrideReason : null,
      rejection_reason: null,
    });

    const linkedAuthUserId = cleanValue(request.auth_user_id);

    if (linkedAuthUserId) {
      const approvedProfile = await upsertUserProfile(
        buildApprovedProfilePayload(request, approvedRole, reviewerProfile.id, approvalStamp)
      );

      return respond(200, {
        ok: true,
        flow: "linked_auth_user",
        approvalSource,
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
      approved_by: reviewerProfile.id,
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
        approvalSource,
        request: updatedRequest || approvedRequest,
      });
    } catch (activationError) {
      console.error("school access approved but activation email failed:", activationError);
      return respond(502, {
        error: `Request approved, but the activation email could not be sent. ${activationError.message || ""}`.trim(),
        requestApproved: true,
        approvalSource,
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
