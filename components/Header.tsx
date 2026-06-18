import Link from "next/link";
import { Coins, Radar, Send, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { USE_MOCK_DATA } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Header() {
  const showMockBanner =
    USE_MOCK_DATA &&
    (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview");

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050812]/80 backdrop-blur-xl">
      {showMockBanner ? (
        <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-center text-xs font-medium text-amber-100">
          Mock data mode is active. Production must run with NEXT_PUBLIC_USE_MOCK_DATA=false.
        </div>
      ) : null}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white shadow-glow">
            <Radar className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-white">Base Radar</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Apps Terminal
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link href="/#trending" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            <TrendingUp className="h-4 w-4" />
            Apps
          </Link>
          <Link href="/coins" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            <Coins className="h-4 w-4" />
            Coins
          </Link>
          <Link href="/submit" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            <Send className="h-4 w-4" />
            Submit
          </Link>
        </nav>

        <Link
          href="/submit"
          className={cn(buttonVariants({ variant: "secondary", size: "icon" }), "md:hidden")}
          aria-label="Submit app"
        >
          <Send className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
