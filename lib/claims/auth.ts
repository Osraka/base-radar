import "server-only";

import { USE_MOCK_DATA } from "@/lib/constants";
import { isClaimModerator } from "@/lib/claims/roles";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export { isClaimModerator } from "@/lib/claims/roles";

export function isClaimWorkflowEnabled(): boolean {
  return process.env.BUILDER_CLAIMS_ENABLED === "true" && !USE_MOCK_DATA &&
    isSupabaseServerConfigured() && isSupabaseAdminConfigured();
}

export async function getClaimModerator(request: Request): Promise<string | null> {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
    request.headers.get("authorization") ?? ""
  );
  if (!match || !isSupabaseServerConfigured()) return null;

  try {
    const { data, error } = await createSupabaseServerClient(5_000).auth.getUser(match[1]);
    return !error && isClaimModerator(data.user) ? data.user.id : null;
  } catch {
    return null;
  }
}
