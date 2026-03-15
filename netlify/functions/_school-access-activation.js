const { sendInviteEmail, sendRecoveryEmail } = require("./_supabase");

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function isLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function detectOrigin(event) {
  const configuredOrigin = [
    process.env.PUBLIC_SITE_URL,
    process.env.NPDS_SITE_URL,
    process.env.URL,
    process.env.SITE_URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.DEPLOY_URL,
  ]
    .map(normalizeOrigin)
    .find(Boolean);

  if (configuredOrigin) {
    return configuredOrigin;
  }

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

  const headerOrigin = normalizeOrigin(host ? `${forwardedProto}://${host}` : "");
  if (headerOrigin && !isLocalOrigin(headerOrigin)) {
    return headerOrigin;
  }

  return headerOrigin;
}

function buildActivationRedirectUrl(event, requestId) {
  const origin = detectOrigin(event);
  if (!origin) {
    throw new Error("Activation URL is not configured. Set PUBLIC_SITE_URL to the live Netlify site URL.");
  }

  return `${origin}/portal/activate-account.html?request=${encodeURIComponent(requestId)}`;
}

async function sendActivationEmail(request, approvedRole, redirectTo) {
  // Supabase invite/recovery emails should be branded as NPDS in the dashboard templates.
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

module.exports = {
  buildActivationRedirectUrl,
  sendActivationEmail,
};
