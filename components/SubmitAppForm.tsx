"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_CATEGORIES } from "@/lib/constants";
import type { AppCategory } from "@/lib/types";
import { submitAppSchema } from "@/lib/validation";

const initialForm = {
  appName: "",
  websiteUrl: "",
  category: "DeFi" as AppCategory,
  description: "",
  contractAddresses: "",
  builderCode: "",
  farcasterUrl: "",
  xUrl: "",
  submitterContact: "",
  honeypot: ""
};

interface SubmitAppFormProps {
  claimSlug?: string;
}

function labelText(label: string, required = false) {
  return `${label} ${required ? "(required)" : "(optional)"}`;
}

export function SubmitAppForm({ claimSlug = "" }: SubmitAppFormProps) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof initialForm, string>>>({});

  useEffect(() => {
    if (!claimSlug) {
      return;
    }

    setForm((current) => ({
      ...current,
      appName: current.appName || claimSlug.replaceAll("-", " "),
      description:
        current.description ||
        `I want to claim or update the Base Radar listing for ${claimSlug}.`
    }));
  }, [claimSlug]);

  function updateField<Key extends keyof typeof initialForm>(
    key: Key,
    value: (typeof initialForm)[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    setFieldErrors({});

    const parsed = submitAppSchema.safeParse(form);
    if (!parsed.success) {
      const nextFieldErrors: Partial<Record<keyof typeof initialForm, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof typeof initialForm | undefined;
        if (field && !nextFieldErrors[field]) {
          nextFieldErrors[field] = issue.message;
        }
      }
      setStatus("error");
      setError(parsed.error.issues[0]?.message ?? "Form alanlarını kontrol edin.");
      setFieldErrors(nextFieldErrors);
      return;
    }

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed.data)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Başvuru gönderilemedi.");
      }

      setForm(initialForm);
      setFieldErrors({});
      setStatus("success");
    } catch (submitError) {
      setStatus("error");
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Başvuru sırasında beklenmeyen bir hata oluştu."
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input
        tabIndex={-1}
        autoComplete="off"
        value={form.honeypot}
        onChange={(event) => updateField("honeypot", event.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      {status === "success" ? (
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-5 text-emerald-100">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                Thanks — your app has been submitted for review.
              </p>
              <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                We will verify the website, category, contract addresses, and Builder
                Code evidence before the app is approved or metrics are promoted.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setStatus("idle")}
          >
            Submit another app
          </Button>
        </div>
      ) : null}

      {status !== "success" ? (
        <>
      {status === "error" ? (
        <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {claimSlug ? (
        <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4 text-sm text-blue-100">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-white">Claim flow started for {claimSlug}</p>
            <p className="mt-1 leading-6">
              Add a contact we can verify and include official docs, deployment links,
              or Basescan references in the contract field.
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-white">Required listing details</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These fields let us decide whether the app belongs in Base Radar.
          </p>
        </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="appName">{labelText("App name", true)}</Label>
          <Input
            id="appName"
            value={form.appName}
            required
            aria-invalid={Boolean(fieldErrors.appName)}
            aria-describedby={fieldErrors.appName ? "appName-error" : undefined}
            onChange={(event) => updateField("appName", event.target.value)}
          />
          {fieldErrors.appName ? (
            <p id="appName-error" className="text-xs text-rose-200">
              {fieldErrors.appName}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="websiteUrl">{labelText("Website URL", true)}</Label>
          <Input
            id="websiteUrl"
            type="url"
            value={form.websiteUrl}
            required
            aria-invalid={Boolean(fieldErrors.websiteUrl)}
            aria-describedby={fieldErrors.websiteUrl ? "websiteUrl-error" : undefined}
            onChange={(event) => updateField("websiteUrl", event.target.value)}
          />
          {fieldErrors.websiteUrl ? (
            <p id="websiteUrl-error" className="text-xs text-rose-200">
              {fieldErrors.websiteUrl}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">{labelText("Category", true)}</Label>
          <select
            id="category"
            value={form.category}
            onChange={(event) =>
              updateField("category", event.target.value as AppCategory)
            }
            className="flex h-10 w-full rounded-md border border-input bg-white/[0.04] px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {APP_CATEGORIES.map((category) => (
              <option key={category} value={category} className="bg-[#07101f]">
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="submitterContact">{labelText("Submitter contact", true)}</Label>
          <Input
            id="submitterContact"
            value={form.submitterContact}
            required
            placeholder="email, @xhandle, or farcaster"
            aria-invalid={Boolean(fieldErrors.submitterContact)}
            aria-describedby={
              fieldErrors.submitterContact ? "submitterContact-error" : undefined
            }
            onChange={(event) =>
              updateField("submitterContact", event.target.value)
            }
          />
          {fieldErrors.submitterContact ? (
            <p id="submitterContact-error" className="text-xs text-rose-200">
              {fieldErrors.submitterContact}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="description">{labelText("Description", true)}</Label>
        <Textarea
          id="description"
          value={form.description}
          required
          minLength={20}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={fieldErrors.description ? "description-error" : undefined}
          onChange={(event) => updateField("description", event.target.value)}
        />
        {fieldErrors.description ? (
          <p id="description-error" className="text-xs text-rose-200">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
        <div className="mb-4 flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-white">Optional verification signals</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Contract addresses are not required, but they will not be used for
              rankings until verified from official docs, project GitHub, or verified
              Basescan pages.
            </p>
          </div>
        </div>

      <div className="space-y-2">
        <Label htmlFor="contractAddresses">{labelText("Contract addresses")}</Label>
        <Textarea
          id="contractAddresses"
          value={form.contractAddresses}
          placeholder="One or more Base contract addresses"
          aria-invalid={Boolean(fieldErrors.contractAddresses)}
          aria-describedby={
            fieldErrors.contractAddresses ? "contractAddresses-error" : undefined
          }
          onChange={(event) =>
            updateField("contractAddresses", event.target.value)
          }
        />
        {fieldErrors.contractAddresses ? (
          <p id="contractAddresses-error" className="text-xs text-rose-200">
            {fieldErrors.contractAddresses}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="builderCode">{labelText("Builder Code")}</Label>
          <Input
            id="builderCode"
            value={form.builderCode}
            onChange={(event) => updateField("builderCode", event.target.value)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Add this only if the Builder Code is published or verifiable from the
            project. Unverified codes are stored for review, not ranking.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="farcasterUrl">{labelText("Farcaster link")}</Label>
          <Input
            id="farcasterUrl"
            type="url"
            value={form.farcasterUrl}
            aria-invalid={Boolean(fieldErrors.farcasterUrl)}
            aria-describedby={fieldErrors.farcasterUrl ? "farcasterUrl-error" : undefined}
            onChange={(event) => updateField("farcasterUrl", event.target.value)}
          />
          {fieldErrors.farcasterUrl ? (
            <p id="farcasterUrl-error" className="text-xs text-rose-200">
              {fieldErrors.farcasterUrl}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="xUrl">{labelText("X link")}</Label>
          <Input
            id="xUrl"
            type="url"
            value={form.xUrl}
            aria-invalid={Boolean(fieldErrors.xUrl)}
            aria-describedby={fieldErrors.xUrl ? "xUrl-error" : undefined}
            onChange={(event) => updateField("xUrl", event.target.value)}
          />
          {fieldErrors.xUrl ? (
            <p id="xUrl-error" className="text-xs text-rose-200">
              {fieldErrors.xUrl}
            </p>
          ) : null}
        </div>
      </div>
      </div>

      <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Submit for review
      </Button>
      </>
      ) : null}
    </form>
  );
}
