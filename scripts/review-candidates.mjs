import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filename) {
  const filePath = path.join(rootDir, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function resolveTsSpecifier(specifier, parentFilename) {
  if (specifier === "server-only") {
    return path.join(rootDir, "scripts/stubs/server-only.js");
  }

  if (specifier.startsWith("@/")) {
    return path.join(rootDir, specifier.slice(2));
  }

  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(parentFilename), specifier);
  }

  return null;
}

function findTsModule(modulePath) {
  const candidates = [
    modulePath,
    `${modulePath}.ts`,
    `${modulePath}.tsx`,
    `${modulePath}.js`,
    path.join(modulePath, "index.ts")
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to resolve local module: ${modulePath}`);
  }
  return match;
}

const tsModuleCache = new Map();

function loadTsModule(filename) {
  const resolvedFilename = findTsModule(filename);
  const cachedModule = tsModuleCache.get(resolvedFilename);
  if (cachedModule) {
    return cachedModule.exports;
  }

  const source = fs.readFileSync(resolvedFilename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: resolvedFilename
  }).outputText;
  const tsModule = new Module(resolvedFilename);
  tsModule.filename = resolvedFilename;
  tsModule.paths = Module._nodeModulePaths(path.dirname(resolvedFilename));
  tsModuleCache.set(resolvedFilename, tsModule);

  const nativeRequire = Module.createRequire(resolvedFilename);
  tsModule.require = (specifier) => {
    const localModule = resolveTsSpecifier(specifier, resolvedFilename);
    return localModule ? loadTsModule(localModule) : nativeRequire(specifier);
  };
  tsModule._compile(output, resolvedFilename);
  return tsModule.exports;
}

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}.`);
  }
  return value;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printUsage() {
  process.stdout.write(`Candidate review commands:
  npm run review:candidates
  npm run review:candidates -- --refresh-public-sources
  npm run review:candidates -- --approve <candidate_id>
  npm run review:candidates -- --reject <candidate_id>

Low-confidence candidates are never auto-approved. Approval is a manual command.
`);
}

async function listCandidates(supabase) {
  const { data, error } = await supabase
    .from("candidate_apps")
    .select("id, name, slug, category, source, source_url, confidence, status, detected_at")
    .order("detected_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(`Unable to list candidates: ${error.message}`);
  }

  if (!data?.length) {
    process.stdout.write("No candidate apps found.\n");
    return;
  }

  for (const candidate of data) {
    process.stdout.write(
      [
        candidate.id,
        candidate.status,
        candidate.confidence ?? "unknown",
        candidate.name,
        candidate.source ?? "unknown",
        candidate.source_url ?? ""
      ].join(" | ") + "\n"
    );
  }
}

async function updateCandidateStatus(supabase, id, status) {
  const { data: candidate, error: readError } = await supabase
    .from("candidate_apps")
    .select("id, confidence, status")
    .eq("id", id)
    .single();

  if (readError || !candidate) {
    throw new Error("Candidate not found.");
  }

  if (status === "approved" && candidate.confidence === "low") {
    throw new Error("Refusing to approve a low-confidence candidate.");
  }

  const { error } = await supabase
    .from("candidate_apps")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(`Unable to update candidate: ${error.message}`);
  }

  process.stdout.write(`Candidate ${id} marked ${status}.\n`);
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const stubDir = path.join(rootDir, "scripts/stubs");
fs.mkdirSync(stubDir, { recursive: true });
fs.writeFileSync(path.join(stubDir, "server-only.js"), "module.exports = {};\n");

try {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  if (process.argv.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  if (process.argv.includes("--refresh-public-sources")) {
    const { collectCandidateApps, upsertCandidateApps } = loadTsModule(
      path.join(rootDir, "lib/discovery/index.ts")
    );
    const candidates = await collectCandidateApps();
    const summary = await upsertCandidateApps(candidates);
    process.stdout.write(
      `Collected ${candidates.length} public-source candidates; upserted ${summary.upserted} for review.\n`
    );
  }

  const approveId = argValue("--approve");
  const rejectId = argValue("--reject");

  if (approveId) {
    await updateCandidateStatus(supabase, approveId, "approved");
  } else if (rejectId) {
    await updateCandidateStatus(supabase, rejectId, "rejected");
  }

  await listCandidates(supabase);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Candidate review failed."}\n`);
  process.exit(1);
}
