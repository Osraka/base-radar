// Stable public origin: preview deployments must never become canonical URLs.
export const SITE_ORIGIN = "https://base-radar.vercel.app";

export function siteUrl(path: string) {
  return new URL(path, SITE_ORIGIN).toString();
}
