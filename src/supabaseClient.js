import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = window.ENV?.SUPABASE_URL;
const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are missing. Check env.js.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
