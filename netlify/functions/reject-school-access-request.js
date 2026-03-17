const {
  getSchoolAdminState,
  getSchoolAccessRequest,
  getUserFromAccessToken,
  getUserProfile,
  respond,
  updateLegacyProfilesByEmail,
  updateSchoolAccessRequest,
} = require("./_supabase");

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

function extractBearerToken(headers = {}) {
  const rawHeader = headers.authorization || headers.Authorization || "";
  if (!rawHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return rawHeader.slice(7).trim();
}

function isApprovedSchoolReviewer(profile, request, schoolAdminState) {
  return (
    normalizeRole(profile?.role) === "athletic_director" &&
    normalizeStatus(profile?.status) === "approved" &&
    !cleanValue(profile?.archived_at) &&
    cleanValue(profile?.school_id) &&
    cleanValue(profile?.school_id) === cleanValue(request?.school_id) &&
    normalizeRole(request?.approval_route) === "school_admin" &&
    cleanValue(request?.assigned_reviewer_user_id) === cleanValue(profile?.id) &&
    cleanValue(schoolAdminState?.primarySchoolAdminUserId) === cleanValue(profile?.id)
  );
}

function appendReviewNote(existingNotes, reason, reviewerName) {
  const stamp = new Date().toISOString().split("T")[0];
  const prefix = `[Access review ${stamp}] ${reviewerName || "Reviewer"} rejected this request: ${reason}`;
  return [String(existingNotes || "").trim(), prefix].filter(Boolean).join("\n\n");
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
    const requestId = cleanValue(body.requestId);
    const reason = cleanValue(body.reason);

    if (!requestId) {
      return respond(400, { error: "Request ID is required." });
    }

    if (!reason) {
      return respond(400, { error: "A rejection reason is required." });
    }

    const request = await getSchoolAccessRequest(requestId);
    if (!request) {
      return respond(404, { error: "The school access request could not be found." });
    }

    if (normalizeStatus(request.status) !== "pending") {
      return respond(422, {
        error: `This request is no longer pending. Current status: ${request.status || "unknown"}.`,
      });
    }

    const isNpdsAdmin = normalizeRole(reviewerProfile.role) === "admin";
    const schoolAdminState = await getSchoolAdminState(request.school_id);
    const isSchoolReviewer = isApprovedSchoolReviewer(reviewerProfile, request, schoolAdminState);
    const approvalSource = resolveApprovalSource(request, isNpdsAdmin);
    const overrideReason =
      approvalSource === "npds_admin_override"
        ? cleanValue(body.overrideReason) || reason
        : null;

    if (!isNpdsAdmin && !isSchoolReviewer) {
      return respond(403, {
        error:
          normalizeRole(request.approval_route) === "school_admin"
            ? "This request is assigned to a different school reviewer."
            : "Admin or assigned school reviewer privileges are required.",
      });
    }

    if (
      cleanValue(request.auth_user_id) === cleanValue(reviewerProfile.id) ||
      cleanValue(request.email).toLowerCase() === cleanValue(reviewerProfile.email).toLowerCase()
    ) {
      return respond(422, {
        error: "You cannot review your own school access request.",
      });
    }

    const reviewedAt = new Date().toISOString();
    const reviewNote = appendReviewNote(
      request.verification_notes,
      reason,
      reviewerProfile.full_name || reviewerProfile.email || "Reviewer"
    );

    const rejectedRequest = await updateSchoolAccessRequest(requestId, {
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: reviewerProfile.id,
      reviewed_at: reviewedAt,
      approval_source: approvalSource,
      acting_admin_user_id: isNpdsAdmin ? reviewerProfile.id : null,
      acted_at: reviewedAt,
      override_reason: overrideReason,
      updated_at: reviewedAt,
      verification_notes: reviewNote,
    });

    await updateLegacyProfilesByEmail(request.email, {
      status: "rejected",
      updated_at: reviewedAt,
      verification_notes: reviewNote,
    }).catch(() => []);

    return respond(200, {
      ok: true,
      approvalSource,
      request: rejectedRequest || request,
    });
  } catch (error) {
    console.error("reject-school-access-request failed:", error);
    return respond(error.statusCode || 500, {
      error: error.message || "Could not reject this school access request.",
    });
  }
};
