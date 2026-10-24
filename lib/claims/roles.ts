import type { User } from "@supabase/supabase-js";

export function isClaimModerator(
  user: Pick<User, "id" | "is_anonymous" | "app_metadata"> | null
): boolean {
  return Boolean(user?.id && !user.is_anonymous &&
    user.app_metadata?.base_radar_role === "claim_moderator");
}
