import Link from "next/link";
import { Header } from "@/components/Header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-semibold text-white">App not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This Base app is not tracked yet or has not been approved for the leaderboard.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-6")}>
          Back to rankings
        </Link>
      </main>
    </>
  );
}
