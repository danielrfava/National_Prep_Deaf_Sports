import { supabase } from "../supabaseClient.js";

export * from "./schoolAccessShared.js";

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

  return {
    session,
    profile: Array.isArray(profileRows) ? profileRows[0] || null : null,
    profileError,
  };
}
