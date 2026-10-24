import "server-only";

import { createClient } from "@supabase/supabase-js";

export function isSupabaseServerConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createSupabaseServerClient(timeoutMs?: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server client is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    ...(timeoutMs ? {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
            : AbortSignal.timeout(timeoutMs)
        })
      }
    } : {})
  });
}
