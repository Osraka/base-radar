import type { MetadataRoute } from "next";
import { getApps } from "@/lib/data";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/coins"), changeFrequency: "hourly", priority: 0.9 },
    { url: siteUrl("/submit"), changeFrequency: "monthly", priority: 0.3 }
  ];

  try {
    // getApps reads only approved Supabase apps; pending discoveries and coins stay out.
    const apps = await getApps();
    return [
      ...staticPages,
      ...apps.map((app) => ({
        url: siteUrl(`/apps/${encodeURIComponent(app.slug)}`),
        lastModified: app.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7
      }))
    ];
  } catch {
    return staticPages;
  }
}
