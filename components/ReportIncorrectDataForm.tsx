"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AppWithMetrics } from "@/lib/types";

interface ReportIncorrectDataFormProps {
  app: AppWithMetrics;
}

export function ReportIncorrectDataForm({ app }: ReportIncorrectDataFormProps) {
  const [contact, setContact] = useState("");
  const [issue, setIssue] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          appName: `Data report: ${app.name}`,
          websiteUrl: app.websiteUrl,
          category: app.category,
          description: `Incorrect data report for ${app.name} (${app.slug}): ${issue}`,
          contractAddresses: "",
          submitterContact: contact
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Report could not be submitted.");
      }

      setStatus("success");
      setContact("");
      setIssue("");
      setMessage("Thanks — the data report has been submitted for review.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to submit report.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message ? (
        <div
          className={
            status === "success"
              ? "flex items-start gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100"
              : "flex items-start gap-2 rounded-md border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-100"
          }
        >
          {status === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="report-contact">Contact</Label>
        <Input
          id="report-contact"
          value={contact}
          placeholder="email, @xhandle, or farcaster"
          required
          onChange={(event) => setContact(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="report-issue">What looks wrong?</Label>
        <Textarea
          id="report-issue"
          value={issue}
          minLength={20}
          required
          placeholder="Example: the contract set is missing the current router, or the displayed source should be TVL-only."
          onChange={(event) => setIssue(event.target.value)}
        />
      </div>

      <Button type="submit" variant="secondary" disabled={status === "submitting"}>
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Report incorrect data
      </Button>
    </form>
  );
}
