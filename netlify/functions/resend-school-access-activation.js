const {
  getSchoolAccessRequest,
  getUserFromAccessToken,
  getUserProfile,
  respond,
  updateSchoolAccessRequest,
} = require("./_supabase");
const {
  buildActivationRedirectUrl,
  sendActivationEmail,
} = require("./_school-access-activation");

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
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

    if (!requestId) {
      return respond(400, { error: "Request ID is required." });
    }

    const request = await getSchoolAccessRequest(requestId);
    if (!request) {
      return respond(404, { error: "The school access request could not be found." });
    }

    if (String(request.status || "").toLowerCase() !== "approved") {
      return respond(422, {
        error: "Activation can only be resent for approved requests that are still awaiting activation.",
      });
    }

    if (String(request.auth_user_id || "").trim()) {
      return respond(409, {
        error: "This approved account already has a linked auth user and does not use the legacy activation email flow.",
      });
    }

    if (request.activated_at || request.activated_user_id) {
      return respond(409, {
        error: "This school access request is already activated.",
      });
    }

    const approvedRole = normalizeRole(request.approved_role || request.role || "school_staff");
    const redirectTo = buildActivationRedirectUrl(event, requestId);
    const activationMode = await sendActivationEmail(request, approvedRole, redirectTo);
    const stamp = new Date().toISOString();
    const updatedRequest = await updateSchoolAccessRequest(requestId, {
      activation_email_sent_at: stamp,
      updated_at: stamp,
    });

    return respond(200, {
      ok: true,
      activationMode,
      request: updatedRequest || request,
    });
  } catch (error) {
    console.error("resend-school-access-activation failed:", error);
    return respond(error.statusCode || 500, {
      error: error.message || "Could not resend this activation email.",
    });
  }
};
