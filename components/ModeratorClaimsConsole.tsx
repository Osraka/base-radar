"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimSummarySchema, claimStatusSchema, type ClaimSummary } from "@/lib/claims/schemas";
import { isClaimModerator } from "@/lib/claims/roles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthState = "checking" | "signed_out" | "unauthorized" | "ready" | "unavailable";
type Decision = "approve" | "reject" | "dispute" | "revoke";
type Filter = "all" | z.infer<typeof claimStatusSchema>;

const claimListSchema = z.object({ data: z.array(claimSummarySchema) });
const filters: Filter[] = ["all", ...claimStatusSchema.options];

function formatUtc(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "Time unavailable";
}

function decisionsFor(status: ClaimSummary["status"]): Decision[] {
  if (status === "proof_checked") return ["approve", "reject"];
  if (status === "pending" || status === "disputed") return ["reject", ...(status === "disputed" ? ["revoke" as const] : [])];
  if (status === "approved") return ["dispute", "revoke"];
  return [];
}

interface Props {
  configured: boolean;
  claimsEnabled: boolean;
}

export function ModeratorClaimsConsole({ configured, claimsEnabled }: Props) {
  const client = useMemo(() => configured ? createSupabaseBrowserClient() : null, [configured]);
  const [authState, setAuthState] = useState<AuthState>(configured ? "checking" : "unavailable");
  const [email, setEmail] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [filter, setFilter] = useState<Filter>("proof_checked");
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listError, setListError] = useState("");
  const [pending, setPending] = useState<{ claim: ClaimSummary; decision: Decision } | null>(null);
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setAuthState("signed_out");
      } else if (!isClaimModerator(data.user)) {
        setAuthState("unauthorized");
        setSignedInEmail(data.user.email ?? "");
      } else {
        setAuthState("ready");
        setSignedInEmail(data.user.email ?? "");
      }
    }).catch(() => { if (active) setAuthState("unavailable"); });
    return () => { active = false; };
  }, [client]);

  const token = useCallback(async () => {
    const { data, error } = await client!.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Your session expired. Sign in again.");
    return data.session.access_token;
  }, [client]);

  const loadClaims = useCallback(async (selected: Filter) => {
    if (!client || !claimsEnabled) return;
    setListState("loading");
    setListError("");
    try {
      const accessToken = await token();
      const query = selected === "all" ? "" : `?status=${encodeURIComponent(selected)}`;
      const response = await fetch(`/api/admin/builder-claims${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      if (response.status === 401) throw new Error("Your moderator session is no longer authorized.");
      if (!response.ok) throw new Error("Claim reviews could not be loaded. Try again.");
      const payload: unknown = await response.json();
      const parsed = claimListSchema.safeParse(payload);
      if (!parsed.success) throw new Error("Claim reviews could not be loaded. Try again.");
      setClaims(parsed.data.data);
      setListState("ready");
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Claim reviews could not be loaded.");
      setListState("error");
    }
  }, [claimsEnabled, client, token]);

  useEffect(() => {
    if (authState === "ready" && claimsEnabled) void loadClaims(filter);
  }, [authState, claimsEnabled, filter, loadClaims]);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinkState("sending");
    try {
      const response = await fetch("/api/admin/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setLinkState(response.ok ? "sent" : "error");
    } catch {
      setLinkState("error");
    }
  }

  async function signOut() {
    await client?.auth.signOut();
    setClaims([]);
    setSignedInEmail("");
    setAuthState("signed_out");
  }

  async function decide() {
    if (!pending || (pending.decision === "approve" && !evidenceChecked)) return;
    setDeciding(true);
    try {
      const accessToken = await token();
      const response = await fetch(`/api/admin/builder-claims/${pending.claim.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ decision: pending.decision })
      });
      if (!response.ok) throw new Error("Review decision was not saved. Reload and check the claim state.");
      setPending(null);
      setEvidenceChecked(false);
      await loadClaims(filter);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Review decision was not saved.");
      setListState("error");
    } finally {
      setDeciding(false);
    }
  }

  if (!configured || authState === "unavailable") {
    return <p role="status" className="text-sm text-amber-200">Moderator sign-in is temporarily unavailable.</p>;
  }

  if (authState === "checking") {
    return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking session...</p>;
  }

  if (authState === "signed_out") {
    return (
      <form onSubmit={sendLink} className="max-w-md space-y-4 rounded-lg border border-white/10 bg-white/[0.035] p-5">
        <h2 className="text-lg font-semibold text-white">Moderator sign-in</h2>
        <div className="space-y-2">
          <Label htmlFor="moderator-email">Email address</Label>
          <Input id="moderator-email" type="email" autoComplete="email" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <Button type="submit" disabled={linkState === "sending"}>Send sign-in link</Button>
        {linkState === "sent" ? <p role="status" className="text-sm text-emerald-200">If the account is eligible, check your email for a sign-in link.</p> : null}
        {linkState === "error" ? <p role="alert" className="text-sm text-rose-200">Sign-in link could not be sent. Check the address or try later.</p> : null}
      </form>
    );
  }

  if (authState === "unauthorized") {
    return (
      <div className="space-y-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-5 text-sm">
        <p role="alert" className="text-amber-100">This account does not have claim review access.</p>
        <p className="text-muted-foreground">{signedInEmail}</p>
        <Button variant="secondary" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
      </div>
    );
  }

  return (
    <section className="space-y-5" aria-label="Builder claim review queue">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">Signed in as <span className="text-white">{signedInEmail}</span></p>
        <Button variant="secondary" size="sm" onClick={signOut}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
      </div>
      {!claimsEnabled ? (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p>Moderator identity is ready. The claim review API remains disabled until controlled proof and decision tests pass.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 space-y-2">
              <Label htmlFor="claim-filter">Status</Label>
              <select id="claim-filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}
                className="h-10 w-full rounded-md border border-input bg-[#07101f] px-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {filters.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
              </select>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void loadClaims(filter)} disabled={listState === "loading"}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
          {listState === "loading" ? <p role="status" className="text-sm text-muted-foreground">Loading claim reviews...</p> : null}
          {listState === "error" ? <p role="alert" className="rounded-lg border border-rose-400/20 p-4 text-sm text-rose-200">{listError}</p> : null}
          {listState === "ready" && claims.length === 0 ? <p role="status" className="rounded-lg border border-white/10 p-5 text-sm text-muted-foreground">No claims match this status.</p> : null}
          {listState === "ready" ? claims.map((claim) => (
            <article key={claim.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{claim.canonical_hostname}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">App ID: {claim.app_id}</p>
                </div>
                <span className="rounded border border-white/15 px-2 py-1 text-xs text-white">{claim.status.replaceAll("_", " ")}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Contact</dt><dd className="mt-1 break-all text-white">{claim.claimant_contact}</dd></div>
                <div><dt className="text-muted-foreground">Requested</dt><dd className="mt-1 text-white">{formatUtc(claim.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">Proof checked</dt><dd className="mt-1 text-white">{claim.proof_checked_at ? formatUtc(claim.proof_checked_at) : "Not checked"}</dd></div>
                <div><dt className="text-muted-foreground">Reviewed</dt><dd className="mt-1 text-white">{claim.reviewed_at ? formatUtc(claim.reviewed_at) : "Not reviewed"}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {decisionsFor(claim.status).map((decision) => (
                  <Button key={decision} variant={decision === "approve" ? "default" : "secondary"} size="sm"
                    onClick={() => { setPending({ claim, decision }); setEvidenceChecked(false); }}>
                    {decision.charAt(0).toUpperCase() + decision.slice(1)}
                  </Button>
                ))}
              </div>
            </article>
          )) : null}
          {pending ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5" role="group" aria-label="Confirm review decision">
              <p className="text-sm font-semibold text-white">Confirm {pending.decision} for {pending.claim.canonical_hostname}</p>
              <p className="mt-2 text-sm text-muted-foreground">This changes the private claim record and creates an audit event. Domain proof alone is not builder identity.</p>
              {pending.decision === "approve" ? (
                <label className="mt-4 flex items-start gap-3 text-sm text-white">
                  <input type="checkbox" checked={evidenceChecked} onChange={(event) => setEvidenceChecked(event.target.checked)} className="mt-1 h-4 w-4" />
                  I independently checked the official project references and stored website.
                </label>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button onClick={() => void decide()} disabled={deciding || (pending.decision === "approve" && !evidenceChecked)}>
                  {deciding ? "Saving..." : "Confirm decision"}
                </Button>
                <Button variant="secondary" onClick={() => setPending(null)} disabled={deciding}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
