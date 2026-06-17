import { z } from "zod";
import { APP_CATEGORIES } from "@/lib/constants";
import { isValidEthereumAddress, safeParseUrl, sanitizeText } from "@/lib/security";

const optionalUrl = z
  .preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().optional()
  )
  .refine((value) => !value || Boolean(safeParseUrl(value)), {
    message: "Geçerli bir http(s) URL girin."
  })
  .transform((value) => (value ? safeParseUrl(value) ?? undefined : undefined));

const contractAddresses = z
  .string()
  .optional()
  .default("")
  .refine((value) => {
    const addresses = value
      .split(/[\s,]+/)
      .map((address) => address.trim())
      .filter(Boolean);

    return addresses.length === 0 || addresses.every(isValidEthereumAddress);
  }, "Kontrat adresleri Ethereum adresi formatında olmalı.")
  .transform((value) => sanitizeText(value, 800));

const contact = z
  .string()
  .min(2, "İletişim bilgisi gerekli.")
  .max(120, "İletişim bilgisi çok uzun.")
  .refine((value) => {
    const normalized = value.trim();
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      /^@?[a-zA-Z0-9_]{2,30}$/.test(normalized) ||
      /^https:\/\/(x\.com|twitter\.com|warpcast\.com)\/[a-zA-Z0-9_.-]+\/?$/.test(normalized)
    );
  }, "E-posta, X handle veya Farcaster kullanıcı adı girin.")
  .transform((value) => sanitizeText(value, 120));

export const submitAppSchema = z.object({
  appName: z
    .string()
    .min(1, "App adı gerekli.")
    .max(80, "App adı çok uzun.")
    .transform((value) => sanitizeText(value, 80)),
  websiteUrl: z
    .string()
    .min(1, "Website gerekli.")
    .refine((value) => Boolean(safeParseUrl(value)), "Geçerli bir website URL girin.")
    .transform((value) => safeParseUrl(value) ?? value),
  category: z.enum(APP_CATEGORIES),
  description: z
    .string()
    .min(20, "Açıklama en az 20 karakter olmalı.")
    .max(600, "Açıklama çok uzun.")
    .transform((value) => sanitizeText(value, 600)),
  contractAddresses,
  builderCode: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().optional())
    .transform((value) => (value ? sanitizeText(value, 80) : undefined)),
  xUrl: optionalUrl,
  farcasterUrl: optionalUrl,
  submitterContact: contact,
  honeypot: z.string().max(0).optional()
});

export type SubmitAppSchemaInput = z.infer<typeof submitAppSchema>;
