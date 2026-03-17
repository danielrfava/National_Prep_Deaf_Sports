const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase server environment is incomplete. Set SUPABASE URL and service-role key.");
  }
}

function jsonHeaders(apiKey, extra = {}) {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
    ...extra,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      data?.msg ||
      data?.message ||
      data?.error_description ||
      data?.error ||
      `Supabase request failed with status ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function supabaseRest(path, options = {}) {
  ensureEnv();

  const {
    method = "GET",
    body,
    query = "",
    headers = {},
    apiKey = SUPABASE_SERVICE_ROLE_KEY,
    bearerToken = SUPABASE_SERVICE_ROLE_KEY,
  } = options;

  const response = await fetch(`${SUPABASE_URL}${path}${query}`, {
    method,
    headers: {
      ...jsonHeaders(apiKey, {
        Authorization: `Bearer ${bearerToken}`,
      }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse(response);
}

async function callRpc(name, payload = {}) {
  const data = await supabaseRest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: payload,
  });

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

async function getUserFromAccessToken(accessToken) {
  ensureEnv();

  if (!accessToken) {
    throw new Error("Missing admin session token.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseResponse(response);
}

async function getUserProfile(userId) {
  const rows = await supabaseRest("/rest/v1/user_profiles", {
    query: `?id=eq.${encodeURIComponent(
      userId
    )}&select=id,email,full_name,role,status,school_id,school_name,archived_at&limit=1`,
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getSchoolAdminState(schoolId) {
  const requestedSchoolId = String(schoolId || "").trim();
  if (!requestedSchoolId) {
    return {
      hasVerifiedSchoolAdmin: false,
      primarySchoolAdminUserId: null,
    };
  }

  const row = await callRpc("get_school_admin_state", {
    requested_school_id: requestedSchoolId,
  });

  return {
    hasVerifiedSchoolAdmin: Boolean(row?.has_verified_school_admin),
    primarySchoolAdminUserId: String(row?.primary_school_admin_user_id || "").trim() || null,
  };
}

async function upsertUserProfile(payload) {
  const rows = await supabaseRest("/rest/v1/user_profiles", {
    method: "POST",
    query: "?select=*",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: [payload],
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getSchoolAccessRequest(requestId) {
  const rows = await supabaseRest("/rest/v1/school_access_requests", {
    query: `?id=eq.${encodeURIComponent(requestId)}&select=*`,
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateSchoolAccessRequest(requestId, payload) {
  const rows = await supabaseRest("/rest/v1/school_access_requests", {
    method: "PATCH",
    query: `?id=eq.${encodeURIComponent(requestId)}&select=*`,
    headers: {
      Prefer: "return=representation",
    },
    body: payload,
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateLegacyProfilesByEmail(email, payload) {
  return supabaseRest("/rest/v1/user_profiles", {
    method: "PATCH",
    query:
      `?email=eq.${encodeURIComponent(email)}` +
      "&role=neq.admin" +
      "&status=in.(pending,invited,rejected)" +
      "&select=id,email,status",
    headers: {
      Prefer: "return=representation",
    },
    body: payload,
  });
}

async function sendInviteEmail({ email, redirectTo, data }) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";

  return supabaseRest("/auth/v1/invite", {
    method: "POST",
    query,
    body: {
      email,
      data,
    },
  });
}

async function sendRecoveryEmail({ email, redirectTo }) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";

  return supabaseRest("/auth/v1/recover", {
    method: "POST",
    query,
    body: {
      email,
    },
  });
}

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

module.exports = {
  SUPABASE_URL,
  getSchoolAdminState,
  getSchoolAccessRequest,
  getUserFromAccessToken,
  getUserProfile,
  upsertUserProfile,
  respond,
  sendInviteEmail,
  sendRecoveryEmail,
  updateLegacyProfilesByEmail,
  updateSchoolAccessRequest,
};
