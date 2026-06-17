"use client";

import { AlertTriangle } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-300" />
        <h1 className="mt-5 text-2xl font-semibold text-white">Unable to load Base Radar</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The metrics feed could not be read. Retry the request or check the configured Supabase
          and Base RPC environment variables.
        </p>
        <Button type="button" className="mt-6" onClick={reset}>
          Retry
        </Button>
      </main>
    </>
  );
}
