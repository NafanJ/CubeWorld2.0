import { createClient } from "@supabase/supabase-js";

// For Vite use import.meta.env.VITE_...; if you use a different env system, adjust accordingly.
// cast import.meta to any to avoid TS errors when the project doesn't include Vite types
const env = (import.meta as any).env || process.env;
const supabaseUrl = (env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string) || "";

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast in dev so it's obvious when env is missing; in production you may want a gentler fallback
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or your env system)."
  );
}

// Singleton supabase client for the browser
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
