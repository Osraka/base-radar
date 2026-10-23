import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const isPreviewOrDevelopment = process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV !== "production";

  return {
    rules: isPreviewOrDevelopment
      ? { userAgent: "*", disallow: "/" }
      : { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: siteUrl("/sitemap.xml")
  };
}
