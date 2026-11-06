import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!url && !!key;
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export async function anonymousSession() {
  if (!supabase)
    throw new Error(
      "Online Together needs Supabase configuration. Solo and event booths are ready to use.",
    );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error("Could not start a private session.");
  return data.session;
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Online Together is not configured.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function roomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
