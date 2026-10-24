import { z } from "zod";
import { sanitizeText } from "@/lib/security";

export const claimIdSchema = z.string().uuid();

export const claimRequestSchema = z.object({
  appSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  contact: z.string().min(3).max(240)
    .refine((value) => !/[\u0000-\u001f\u007f<>`]/.test(value))
    .transform((value) => sanitizeText(value, 240).toLowerCase())
    .refine((value) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
      /^@?[a-zA-Z0-9_]{2,30}$/.test(value) ||
      /^https:\/\/(?:x\.com|twitter\.com|warpcast\.com)\/[a-zA-Z0-9_.-]+\/?$/.test(value)
    ),
  honeypot: z.string().max(0).optional()
});

export const claimProofSchema = z.object({
  challengeToken: z.string().regex(/^[a-f0-9]{64}$/)
});

export const claimDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "dispute", "revoke"])
});

export const claimStatusSchema = z.enum([
  "pending", "proof_checked", "approved", "rejected", "disputed", "revoked", "expired"
]);

export const approvedClaimAppSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  website_url: z.string(),
  status: z.literal("approved")
});

export const claimRecordSchema = z.object({
  id: z.string().uuid(),
  app_id: z.string().uuid(),
  claimant_contact: z.string(),
  canonical_hostname: z.string(),
  token_digest: z.string().regex(/^[a-f0-9]{64}$/),
  challenge_issued_at: z.string(),
  challenge_expires_at: z.string(),
  challenge_used_at: z.string().nullable(),
  proof_checked_at: z.string().nullable(),
  status: claimStatusSchema,
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string()
});

export type ClaimRecord = z.infer<typeof claimRecordSchema>;
