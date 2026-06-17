import Link from "next/link";
import { Radar, Send, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050812]/80 backdrop-blur-xl">
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
            Trending
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
