import { createClient } from "@supabase/supabase-js";

export interface RegisteredBuilderCodeApp {
  appId: string;
  slug: string;
  name: string;
  builderCode: string;
  normalizedBuilderCode: string;
}

interface AppRegistryRow {
  id: string;
  slug: string;
  name: string;
  builder_code: string | null;
}

const BUILDER_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,63}$/;

export function normalizeBuilderCode(builderCode: string | null | undefined) {
  const value = builderCode?.trim();

  if (!value || !BUILDER_CODE_PATTERN.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

function createRegistryClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase registry client is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function toRegisteredApp(row: AppRegistryRow): RegisteredBuilderCodeApp | null {
  const normalizedBuilderCode = normalizeBuilderCode(row.builder_code);

  if (!normalizedBuilderCode || !row.builder_code) {
    return null;
  }

  return {
    appId: row.id,
    slug: row.slug,
    name: row.name,
    builderCode: row.builder_code.trim(),
    normalizedBuilderCode
  };
}

export async function getRegisteredBuilderCodes(): Promise<RegisteredBuilderCodeApp[]> {
  const supabase = createRegistryClient();
  const { data, error } = await supabase
    .from("apps")
    .select("id, slug, name, builder_code")
    .eq("status", "approved")
    .not("builder_code", "is", null);

  if (error) {
    throw new Error("Unable to load local Builder Code registry.");
  }

  return ((data ?? []) as AppRegistryRow[])
    .map(toRegisteredApp)
    .filter((app): app is RegisteredBuilderCodeApp => Boolean(app));
}

export async function findAppByBuilderCode(builderCode: string) {
  const normalizedBuilderCode = normalizeBuilderCode(builderCode);

  if (!normalizedBuilderCode) {
    return null;
  }

  const registeredApps = await getRegisteredBuilderCodes();
  return (
    registeredApps.find(
      (app) => app.normalizedBuilderCode === normalizedBuilderCode
    ) ?? null
  );
}
