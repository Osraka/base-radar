import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p>Base Radar tracks app-level growth signals across the Base ecosystem.</p>
        <div className="flex gap-4">
          <Link href="/api/apps" className="hover:text-white">
            API
          </Link>
          <Link href="/submit" className="hover:text-white">
            Submit
          </Link>
        </div>
      </div>
    </footer>
  );
}
