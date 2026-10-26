# Base Radar

“DexScreener for Base Apps” MVP. The product can run in mock mode for local design work or Supabase mode for real approved apps, latest metrics, and submissions.

## Stack

- Next.js App Router
- TypeScript
- TailwindCSS
- shadcn/ui-style local primitives
- Lucide icons
- Zod validation
- Supabase-backed reads and submissions
- Viem-powered Base RPC activity indexing MVP

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Agent Task Tracking (Beads)

Base Radar uses [Beads](https://github.com/gastownhall/beads) to keep engineering
tasks and dependencies across Codex sessions. The project-scoped Codex skill,
hooks, and instructions are in `.agents/skills/beads/`, `.codex/`, and `AGENTS.md`.
Beads is development task tracking; it does not run the production refresh jobs.

Install the `bd` CLI once (macOS: `brew install beads`), then from this repository:

```bash
bd bootstrap                 # New clone: load task history from the Git remote
bd prime                     # Load agent workflow context
bd ready                     # See unblocked tasks
bd create "Short task title" --description="Scope and acceptance criteria" --type=task --priority=2
bd update <issue-id> --claim  # Mark work in progress
bd close <issue-id> --reason="Verified and complete"
```

The local Dolt database is the task source of truth. To share task changes with
other machines or agents, run `bd dolt push`; run `bd dolt pull` before taking
new work in an existing clone. This stores task history in `refs/dolt/data` on
the Git remote, separately from application code. A normal `git push` alone
does not sync Beads tasks. Keep secrets out of issue titles and descriptions.

## Environment

```bash
NEXT_PUBLIC_USE_MOCK_DATA=true
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
APP_URL=http://localhost:3000
BASE_RPC_URL=
BASE_RPC_CONTRACT_SCANS_ENABLED=false
REFRESH_SECRET=
CRON_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
DEFILLAMA_CACHE_TTL_SECONDS=1800
DEXSCREENER_CACHE_TTL_SECONDS=300
HONEYPOT_CACHE_TTL_SECONDS=900
DEX_FACTORY_BLOCK_RANGE=43200
MAX_DEX_FACTORY_POOLS=160
TOKEN_SNAPSHOT_LIMIT_PER_BUCKET=25
COIN_DISCOVERY_LIMIT_PER_BUCKET=50
BASE_TOKEN_WATCHLIST_JSON=[]
BASE_TOKEN_WATCHLIST_WALLETS=
SMART_WALLET_BLOCK_RANGE=7200
NEYNAR_API_KEY=
NEYNAR_CACHE_TTL_SECONDS=1800
```

Only `NEXT_PUBLIC_*` values are safe for the browser. `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `BASE_RPC_URL`, `REFRESH_SECRET`, `CRON_SECRET`, `BASE_TOKEN_WATCHLIST_JSON`, `BASE_TOKEN_WATCHLIST_WALLETS`, and `NEYNAR_API_KEY` must stay server-side. Cache TTL, scanner-range, and discovery-limit values are not secrets, but they still belong in server/runtime env. `APP_URL` is not a secret, but it is used by local scripts. `SUPABASE_SERVICE_ROLE_KEY` is only for server-only admin tasks such as seeding, moderation, and future metrics jobs.

## Public Source Policy

Base Radar does not currently use a private Base App trend API.
We do not scrape private, protected, or undocumented Base App data.
Base App internal trends are not claimed unless an official documented API is
added in a later phase.

Current trend and discovery inputs are public or manually verified:

- Base RPC activity from configured contract addresses
- DefiLlama public protocol, TVL, DEX volume, and fees endpoints
- Farcaster/Neynar public API data when the configured API key has access
- verified project documentation and official deployment sources
- public market data APIs when token trend adapters are explicitly added
- DexScreener public Base pair/token endpoints for token discovery, liquidity,
  volume, and pair freshness signals

Candidate discoveries are never automatically approved. New public-source
discoveries land in `candidate_apps` with `status = review` until a human
checks the project, source, contracts, and category.

## Production Env Checklist

Required public environment variables:

```bash
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Required server-only environment variables:

```bash
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BASE_RPC_URL=
REFRESH_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
DEFILLAMA_CACHE_TTL_SECONDS=1800
DEXSCREENER_CACHE_TTL_SECONDS=300
HONEYPOT_CACHE_TTL_SECONDS=900
COIN_DISCOVERY_LIMIT_PER_BUCKET=50
BASE_TOKEN_WATCHLIST_JSON=[]
BASE_TOKEN_WATCHLIST_WALLETS=
SMART_WALLET_BLOCK_RANGE=7200
NEYNAR_API_KEY=
NEYNAR_CACHE_TTL_SECONDS=1800
APP_URL=https://your-production-domain.com
```

Environment placement:

- Vercel Production: set every variable above. `NEXT_PUBLIC_USE_MOCK_DATA` must be `false`.
- Vercel Preview: use a separate Supabase project or clearly isolated preview data when possible. Keep all server-only values in Preview env too if preview cron/indexer checks are needed.
- Local: use `.env.local`. `APP_URL=http://localhost:3000` is fine locally. Mock mode can stay enabled for design work, but live verification requires `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- Leave `BASE_RPC_CONTRACT_SCANS_ENABLED=false` in Production and Preview until a private provider passes the bounded historical log probe and a staged refresh. This is server-only; changing it requires redeployment.

Security rules:

- Only `NEXT_PUBLIC_*` variables are browser-visible.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, Upstash token, `BASE_RPC_URL`, or `REFRESH_SECRET` in client code.
- Rotate any server-only key that appears in screenshots, logs, tickets, or public files.

## Supabase Setup

Create a Supabase project:

1. Open the Supabase dashboard and create a new project.
2. Go to the project's Connect dialog or Settings > API Keys.
3. Copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the publishable/anon key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Copy the secret/service role key into `SUPABASE_SERVICE_ROLE_KEY`.

Key rules:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe public values.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `NEXT_PUBLIC_`.
- Never paste the service role key into browser code, screenshots, URLs, logs, or public issue trackers.
- Prefer provider/platform secret storage in production deployments.

Apply the migration in `supabase/migrations/202605200001_create_base_radar_tables.sql`.

The migration creates:

- `apps`
- `app_metrics`
- `submissions`

The follow-up migration `202605210001_add_metric_metadata.sql` adds metric provenance:

- `source`: `mock`, `base_rpc`, `builder_codes`, or `farcaster`
- `confidence`: `low`, `medium`, or `high`
- `notes`: nullable explanation text

It also enables RLS:

- public users can read `apps` where `status = 'approved'`
- public users can read metrics only for approved apps
- public users can insert submissions
- public users cannot read submissions
- public users cannot update or delete apps, metrics, or submissions
- `anon` and `authenticated` table grants are restricted to least privilege
- service role/admin operations are server-side only

Seed the current 30-app mock dataset into Supabase:

```bash
npm run seed:supabase
```

The seed script reads `lib/mockData.ts`, upserts apps by `slug`, and upserts metric rows by `(app_id, measured_at)`.

For production-quality listings, prefer the verified real-app seed:

```bash
npm run seed:real-apps
npm run audit:real-apps
```

This seed upserts a smaller verified set, hides the old mock-looking local
prototype slugs, and inserts neutral low-confidence metric placeholders so old
mock metrics do not remain the latest visible data.

Switch from mock mode to Supabase mode:

```bash
NEXT_PUBLIC_USE_MOCK_DATA=false
```

Then restart the Next.js dev server so environment variables are reloaded.

## Supabase Verification

Required environment variables:

```bash
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Apply the migration:

```bash
supabase db push
```

Or paste/run `supabase/migrations/202605200001_create_base_radar_tables.sql` in the Supabase SQL editor.

Seed approved apps and latest metrics:

```bash
npm run seed:supabase
```

Start the app in Supabase mode:

```bash
NEXT_PUBLIC_USE_MOCK_DATA=false npm run dev
```

Run live verification:

```bash
npm run verify:supabase
```

The verifier checks:

- required env vars
- malformed Supabase URLs and API keys
- accidental `SUPABASE_SERVICE_ROLE_KEY` exposure through `NEXT_PUBLIC_*`
- anon read access for approved apps
- anon metrics reads scoped to approved apps
- hidden app and hidden metric RLS behavior
- public write restrictions for apps and metrics
- app + latest metric join shape
- `AppWithMetrics` camelCase output shape
- anon submission insert
- anon cannot insert non-pending submissions
- anon cannot read submissions
- service role can read submissions
- homepage, `/api/apps`, app detail, and submit API in Supabase mode
- invalid submit returns `400`
- service role key is not present in route responses or `.next/static`
- server-only Supabase admin code is not imported by client-facing components

Common failures:

- Missing env vars: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.
- No approved apps: run the migration, then `npm run seed:supabase`.
- Missing metrics: rerun `npm run seed:supabase`; it upserts metrics by `(app_id, measured_at)`.
- `/api/apps does not match Supabase rows`: restart Next.js with `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- Frontend route checks fail with connection errors: start the dev server first, or set `VERIFY_APP_BASE_URL=https://your-preview-url`.
- Anon can read submissions: reapply the migration and confirm there is no public select policy on `submissions`.
- Anon can write apps or metrics: reapply the migration and confirm table grants were revoked and only required grants were added.
- Service role key appears in `.next/static`: rotate the key immediately and remove any accidental client import or public env variable.

## RLS Model

The public Data API is intentionally narrow:

- `apps`: public `select` only, filtered by `status = 'approved'`.
- `app_metrics`: public `select` only when the related app is approved.
- `submissions`: public `insert` only, constrained to `status = 'pending'`.
- No public select/update/delete policy exists for `submissions`.
- No public insert/update/delete policy exists for `apps` or `app_metrics`.

The service role key bypasses RLS and is reserved for trusted server-side operations such as seeding, moderation, and future metrics jobs.

## Real Base App Data Policy

Production listings must favor correctness over breadth.

Rules:

- Contract addresses are only added from official project docs, official project GitHub, official deployment docs, Base official docs, or verified Basescan pages.
- Contract addresses from random blogs, social posts, copied token lists, or unverified aggregators are not seeded.
- If a contract address is uncertain, leave `contract_addresses` empty or keep the listing hidden/review-only.
- Builder Codes are only added when verified by the app/project itself. The current verified seed intentionally leaves `builder_code` empty.
- Metrics are estimated unless `source` and `confidence` say otherwise. Base RPC contract-log metrics are low confidence until richer attribution exists.
- Old local prototype apps are hidden instead of deleted so the cleanup is reversible.
- Users and builders should report incorrect listings or outdated contract addresses before the data is promoted further.

Verified real-app seed files:

- `lib/realApps.ts`: source-of-truth data used by scripts.
- `scripts/seed-real-apps.mjs`: Supabase upsert/hide script.
- `scripts/audit-real-apps.mjs`: local and DB audit checks.
- `supabase/seed-real-apps.sql`: SQL equivalent with source comments.

Current verified seed sources include:

- Uniswap Base deployments: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
- Aerodrome official contracts: https://github.com/aerodrome-finance/contracts
- Aerodrome security page: https://aerodrome.finance/security
- Moonwell contracts: https://docs.moonwell.fi/moonwell/protocol-information/contracts
- Aave addresses docs: https://aave.com/docs/resources/addresses
- Aave address book: https://github.com/bgd-labs/aave-address-book
- Base official contracts: https://docs.base.org/base-chain/network-information/base-contracts
- Zora support docs: https://support.zora.co/en/articles/5301825 and https://support.zora.co/en/articles/5654721
- Paragraph docs: https://paragraph.com/docs
- Base App / Smart Wallet docs: https://docs.base.org/base-account/reference/onchain-contracts/smart-wallet
- Basename: https://www.base.org/names and verified Basescan contract pages when seeded.
- Compound v3, Extra Finance, Seamless, Rodeo, Reserve, Across, Stargate, Beefy, Morpho, Spark, PancakeSwap, Curve, Pendle, Fluid, Euler, Yearn, Balancer, QuickSwap, SushiSwap, LayerZero, Hyperlane, Axelar, and Superfluid: official project sites plus DefiLlama protocol pages where a `defiLlamaSlug` is configured.
- Bridge category entries currently include Across Protocol on Base, Stargate on Base, LayerZero V2 on Base, Hyperlane on Base, and Axelar on Base.

## Hybrid Metrics Methodology

Base Radar uses the most trustworthy metric source available for each app.
The goal is to avoid fake precision while also avoiding trust-breaking zeroes
for major active protocols.

Metric priority:

1. Protocol adapter metrics
2. Builder Code attribution metrics
3. Base RPC contract-log samples (not daily TX or wallet totals)
4. Mock/placeholder metrics

Current protocol adapters:

- `uniswap-base`: DefiLlama Base DEX volume and TVL, plus an approximate 24h **V3 SwapRouter02 subset** counted by distinct transaction hash. Swap recipients are not claimed as unique users. If RPC fails, the subset is unavailable.
- `aerodrome`: DefiLlama Base DEX volume and the sum of Base TVL from Aerodrome V1 and Slipstream. Bounded contract-log scans are diagnostic only, not 24h TX/wallet totals.
- `zora`: DefiLlama Zora Coins DEX volume when Base-specific coverage is available; generic contract logs do not establish Zora app usage.
- `aave-base`: DefiLlama Base TVL/fees; generic Pool/provider log samples do not establish daily users or transactions.
- `moonwell`: DefiLlama Base TVL/fees; the selected market contracts cover only part of Moonwell and do not establish daily users or transactions.
- `compound-v3-base`, `morpho-base`, `fluid-base`, `euler-base`, `yearn-base`, `extra-finance`, `seamless-protocol`, `reserve-protocol`, and `beefy-base`: DefiLlama Base TVL/fees coverage where available; bounded Base RPC scans are not promoted to daily activity metrics.
- `pancakeswap-base`, `curve-base`, `pendle-base`, `balancer-base`, `quickswap-base`, `sushiswap-base`, and `superfluid-base`: DefiLlama Base overview rows for DEX/payment-style volume where available; no contract activity is fabricated when contracts are not verified.
- `across-protocol-base`, `stargate-base`, `layerzero-base`, `hyperlane-base`, `axelar-base`, and `spark-base`: DefiLlama Base-specific TVL/fees coverage where available; coverage may remain limited if public Base-specific metrics are not exposed. Across uses Base bridge fees, not Ethereum TVL.
- `rodeo-finance`: no active adapter until a Base-specific source is verified; old mock rows do not count as fresh measurements.

DefiLlama integration:

- Uses official public API endpoints documented at https://api-docs.defillama.com.
- Uses Base-specific DEX overview rows from `https://api.llama.fi/overview/dexs/base`.
- Uses Base-specific fees overview rows from `https://api.llama.fi/overview/fees/base` for lending protocols when DEX volume is not the right metric.
- Fees remain a separate metric and may inform trend scoring; they are never labeled as DEX volume.
- Uses TVL from `https://api.llama.fi/protocol/{slug}` only when a Base chain TVL series exists. Total protocol TVL is never substituted for Base TVL.
- Caches responses in-process. Default TTL is `DEFILLAMA_CACHE_TTL_SECONDS=1800`.
- Times out and fails gracefully so refresh jobs keep running if DefiLlama is unavailable.

Confidence levels:

- `high`: reliable, source-appropriate metrics with substantial verified coverage.
- `medium`: official contracts or partial hybrid metrics.
- `low`: heuristic Base RPC only or unavailable/placeholder coverage.

Coverage levels:

- `high`: multiple source-appropriate metrics with substantial coverage.
- `medium`: only external economic metrics or a documented activity subset are available.
- `limited`: app is real, but reliable metric coverage is incomplete.
- `experimental`: reserved for future sources that need validation.

The five-app contract/event audit is in [App activity coverage](docs/app-activity-coverage.md).
Exact daily active users cannot be measured from generic contract logs.
Some contracts emit events with indexed user addresses, some do not, and app
activity may route through aggregators, routers, wallets, relayers, or shared
infrastructure. When exact DAU is unavailable, the product should show coverage
limitations rather than fabricate activity.

Metric credibility presentation:

- Numeric user counts are labeled as `Tracked Wallets`, not exact users.
- For major protocols such as Uniswap on Base, Aerodrome, Aave V3 on Base, Moonwell, and Zora, tiny low-confidence wallet estimates from limited contract logs are hidden as `Limited coverage`.
- For broader protocol adapters, verified public app/protocol data and verified Base contract coverage are treated separately. DefiLlama-only listings can show real TVL/volume/fees, but tx/wallet fields remain `N/A` or `Limited` until app-specific contracts are verified.
- External-only protocol metrics are downweighted in ranking compared with hybrid metrics that combine public economic data and verified Base contract activity.
- Low-confidence transaction estimates for major protocols are shown as `Limited` when the tracked contract range is too narrow.
- Missing tx/wallet data is shown as `N/A`, never as a fabricated zero.
- Protocol adapter apps prioritize reliable economic signals such as 24h volume, TVL, and fees before low-confidence wallet/activity estimates.
- Trend scoring downweights low-confidence wallet and activity inputs; it does not fabricate replacement values.
- App detail pages expose source, confidence, coverage, origin, and notes so methodology is visible.

Verify adapters:

```bash
npm run verify-adapters
npm run verify-metric-credibility
npm run audit:coverage
```

## Social Metrics Methodology

Base Radar now includes a lightweight 7-day Farcaster signal as a supplementary ranking input.
Onchain and protocol metrics remain primary; social metrics are capped so discussion volume
cannot dominate real activity.

Implementation:

- `lib/social/farcaster.ts` calls Neynar's official cast search endpoint server-side.
- `NEYNAR_API_KEY` is server-only and must never use `NEXT_PUBLIC_`.
- `NEYNAR_CACHE_TTL_SECONDS=1800` controls in-process cache TTL.
- Missing or failing Neynar calls retain internal zero placeholders but mark social coverage unavailable or partial; the UI must not present those as verified zero mentions.
- Each app refresh run stops further Neynar searches after two consecutive transient failures, or immediately after an authentication/rate-limit rejection. A successful search resets the transient-failure count. This is an in-run circuit, not a persistent outage claim.
- Search is literal, 7-day rolling, and alias-based to reduce noisy matches.

Matching rules:

- Use verified app names/slugs and a small local alias registry.
- Reject generic aliases such as `base`, `app`, `wallet`, and other broad words.
- Keep confidence `low` when no API key or no reliable matches are available.
- Use `medium` only for recent Farcaster casts matching configured aliases.

Stored fields:

- `social_mentions_24h`
- `social_mentions_7d`
- `social_engagement_24h`
- `social_engagement_7d`
- `social_source`
- `social_confidence`
- `social_window`

Limitations:

- Farcaster mentions are approximate and depend on Neynar search coverage.
- If `npm run verify-social-metrics` reports a `402` warning, the key is present
  but Neynar cast search access or credits need to be enabled in Neynar.
- The system does not count X/Twitter yet.
- Social matching intentionally favors undercounting over false positives.
- Exact discussion velocity needs historical snapshots, which are not implemented yet.

Verify social metrics:

```bash
npm run verify-social-metrics
```

## Base Social Radar Methodology

Base Social Radar is a discovery-oriented layer that looks beyond tracked apps
and asks: what is the Base ecosystem talking about this week?

Collection:

- Uses Neynar cast search with broad Base-related queries:
  `base`, `on base`, `base app`, `base mini app`, `builder on base`, and `base ecosystem`.
- Uses a 7-day rolling window.
- Caches Neynar responses and times out safely.
- Runs during the scheduled refresh pipeline but never blocks onchain/protocol metrics.

Extraction:

- Deduplicates casts by hash or a safe fallback key.
- Extracts repeated known app/protocol names, builder/product phrases, tickers, and domains.
- Stores only safe previews in `sample_casts`; raw Neynar payloads are never exposed.
- Filters generic or noisy words such as `crypto`, `eth`, `airdrop`, `gm`, and broad `base` chatter.
- Filters obvious spam patterns such as excessive links, excessive tickers, or repeated low-variety text.

Confidence:

- `high`: repeated mentions from several unique users.
- `medium`: repeated mentions with some unique-user diversity.
- `low`: sparse or uncertain matches.

Storage and API:

- Trends are stored in `base_social_trends`.
- Public read is allowed through RLS.
- Public writes are blocked; service role manages inserts server-side.
- `GET /api/social/trends` returns top trends with `mentions7d`, `confidence`, and safe sample previews.

Limitations:

- Farcaster social metrics are approximate and depend on Neynar search coverage.
- Exact social analytics are not possible from public search alone because ranking, indexing coverage, deleted casts, quote context, bots, and API-plan limits can all affect results.
- Social radar is supplementary. Onchain activity, verified contracts, and protocol adapters remain primary ranking signals.
- The system intentionally undercounts when matching is uncertain.

Verify Base Social Radar:

```bash
npm run verify-base-social-radar
```

## Ecosystem Trend Expansion

Base Radar separates apps, social trends, and token trends.

Candidate apps:

- Stored in `candidate_apps`.
- Public users can read only rows with `status = approved`.
- Public writes are blocked.
- Service role/admin scripts manage discovery and review.
- DefiLlama Base protocol discovery and the manual verified app list can seed
  review candidates, but review candidates do not appear in app rankings.

Admin review:

```bash
npm run review:candidates
npm run review:candidates -- --refresh-public-sources
npm run review:candidates -- --approve <candidate_id>
npm run review:candidates -- --reject <candidate_id>
```

The script refuses to approve low-confidence candidates.

App discovery and ranking updates:

- Scheduled refresh jobs update app metrics and keep historical metric rows.
- The main app leaderboard favors recent interaction over passive credibility:
  tracked txs, tracked wallets, protocol volume/fees, and Farcaster discussion
  are treated as live engagement signals.
- Apps with no meaningful interaction in the last 7 days are not deleted, but
  their trend score is reduced so active apps move ahead of dormant listings.
- Large verified protocols can still appear through reliable TVL/volume data,
  but TVL-only apps are treated as lower engagement than apps with current
  usage.
- The public trend rank remains the established score. The shared ranking
  snapshot also exposes an Activity Score and a separate Verified 7d Momentum
  Score; TVL alone contributes to neither. Momentum requires a fresh metric,
  medium-or-better confidence and coverage, minimum tracked TX or volume, and
  a same-source observation near both ends of a seven-day window. Missing or
  stale history leaves momentum unavailable rather than inventing growth.
  Early Discoveries contains only recently tracked apps that pass these gates;
  it does not claim the app itself launched recently. Homepage, detail page and
  `/api/apps` consume the same ranking snapshot and signal eligibility.
- Newly discovered apps should enter `candidate_apps` first. They should only be
  promoted to the approved app leaderboard after source validation and enough
  interaction signal; Base Radar should not auto-approve every discovered link.

### Share card evidence and corrections

The app detail screenshot card is computed from one ranked app snapshot. Its
deterministic evidence ID covers the app identity, rank, score, measurement time,
source, confidence, coverage, and any comparable 24-hour baseline/current values.
A growth claim appears only when both observations use the same source and
metric origin, cover the full day, have meaningful activity, and are fresh with
medium-or-better confidence and coverage. Mock, low-confidence, stale, sparse,
mixed-source, or extreme changes show no growth claim. The card is not a
generated image pipeline and screenshots are not independently verified records.

If a source corrects or withdraws data, refresh the ranking and stop displaying
the old claim; recheck the source before reusing it. A saved screenshot cannot
be revoked, so its measurement time and source remain visible and should be
considered historical, not a current ranking. Do not distribute a card as a
performance claim after its underlying measurements are corrected or withdrawn.

### Watchlist browser alerts (opt-in preview)

Saved-app alerts are off by default. On `/watchlist`, the user must explicitly
enable them and grant the origin browser notification permission. The browser
records a baseline before any alert is eligible. While the watchlist page is
open, it checks `/api/apps` every 15 minutes and only notifies on a new,
server-ranked observation with verified 7d momentum of at least 20%, current
measurement, medium-or-better confidence and coverage, and non-mock provenance.
It never computes growth from an unverified client baseline. A browser-scoped
lock and local delivery log suppress duplicates: at most one notification per
app and three total in 24 hours. Disabling clears local consent and delivery
history; logs otherwise expire after 14 days. `npm run verify:browser-alerts`
checks the trust gates and deduplication rules.

This preview is **not** email or background push: the tab must be open and active,
the browser must support secure-context notifications, service workers and Web
Locks. Consent and delivery history are local to this browser, not a verified
cross-device user account. No server-side subscription or external provider is
enabled. Cross-device identity, provider verification, retention and delivery
monitoring remain prerequisites before server-sent alerts can launch.

Token trends:

- Stored in `base_token_trends`.
- Shown separately as "Base Token Radar".
- Token trends do not affect app rankings or app trend scores.
- Live token radar uses DexScreener public APIs server-side. No DexScreener API
  key is required.
- Prioritized pairs are checked with Honeypot.is `/v2/IsHoneypot` on Base
  (`chainID=8453`) for buy/sell simulation, honeypot status, summary risk,
  buy tax, and sell tax.
- Current live coverage comes from DexScreener latest token profiles, community
  takeovers, ads, latest boosts, top boosts, expanded Base-focused public search
  candidates, verified Base DEX factory `PoolCreated` events, liquidity and
  volume filters, optional watchlist-wallet token transfer signals, then
  resolves Base token pairs. This is not a complete all-Base-pairs index.
- `Newest Pools` is powered by Base RPC factory-event discovery for a capped
  recent block window, then cross-checks those pools/tokens with DexScreener
  market data before display. Current verified factory sources:
  - Uniswap V3 Factory on Base:
    `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`
    from the official Uniswap Base deployments docs.
  - Aerodrome PoolFactory:
    `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`
    from the Aerodrome contracts repository deployment list.
  - PancakeSwap V3 Factory:
    `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
    from the official PancakeSwap V3 addresses docs.
  - Alien Base V2 Factory:
    `0x3e84d913803b02a4a7f027165e8ca42c14c0fde7`
    from the official Alien Base contracts docs.
  - Alien Base V3 Factory:
    `0x0Fd83557b2be93617c9C1C1B6fd549401C74558C`
    from the official Alien Base V3 contracts docs.
- Sushi is intentionally not enabled yet. It should be added only after a
  current official Sushi deployment/config source confirms the Base factory
  address and event shape.
- Factory discovery range controls:
  ```bash
  DEX_FACTORY_BLOCK_RANGE=43200
  MAX_DEX_FACTORY_POOLS=160
  ```
  These values are intentionally capped so token discovery cannot accidentally
  scan from genesis or abuse the configured Base RPC provider.
- Sections are kept separate:
  - Top 24h Volume
  - Volume Velocity
  - Liquidity Leaders
  - Top 24h Gainers
  - Fresh Finds
  - Newest Pools
  - Early Discovery
  - Meme Radar
  - Smart Wallet Signals
- `Early Discovery` highlights younger or mid-liquidity Base pairs that pass
  basic tradability and scam-risk filters. It is designed for discovery, not a
  safety endorsement.
- `Volume Velocity` highlights tokens where 24h volume is unusually strong
  relative to available liquidity. This is useful for early discovery because a
  token can become interesting before it is one of the absolute largest-volume
  markets. It still requires observed sells, minimum transactions, minimum
  liquidity, and scam-risk filtering.
- Scheduled refresh writes `Volume Velocity` and `Fresh Finds` snapshots into
  `token_radar_snapshots`. The API uses this history to label:
  - `New signal`: first seen in the last hour.
  - `3x rising`: volume increased across three refresh observations, or the
    latest snapshot has strong positive volume acceleration.
  - `Vol accel`: percentage change versus the previous stored snapshot.
- `TOKEN_SNAPSHOT_LIMIT_PER_BUCKET` controls how many `velocity` and `fresh`
  tokens are persisted per cron run. It is server-only and capped in code.
- `Fresh Finds` uses lower liquidity thresholds than the main volume/liquidity
  tabs so newer or under-the-radar tokens can appear earlier. It still requires
  observed sells, minimum trading activity, and scam-risk filtering.
- `Liquidity Leaders` is the closest thing to the “trusted market signal”
  described in product discussions: high liquidity, meaningful 24h volume,
  active trading, and observed sells from DexScreener data. It does not require
  wallet watchlists.
- `Smart Wallet Signals` is disabled unless `BASE_TOKEN_WATCHLIST_WALLETS` is
  configured server-side. It scans recent Base ERC-20 `Transfer` logs received
  by those configured wallets and cross-checks the token through DexScreener and
  Honeypot.is where available. This is labeled as a transfer/accumulation signal,
  not a confirmed buy, until swap decoding is implemented.
- Watchlist format:
  ```bash
  BASE_TOKEN_WATCHLIST_WALLETS="researcher=0x...,fund=0x..."
  SMART_WALLET_BLOCK_RANGE=7200
  ```
- Preferred auditable watchlist format:
  ```bash
  BASE_TOKEN_WATCHLIST_JSON='[
    {
      "label": "verified-public-wallet",
      "address": "0x0000000000000000000000000000000000000000",
      "confidence": "medium",
      "sourceUrl": "https://example.com/source",
      "notes": "Publicly documented wallet label."
    }
  ]'
  ```
- Use `high` confidence only when the wallet address and label are backed by a
  high-quality public source. Do not add private individuals, doxxed wallets, or
  unverified social-media claims.
- Audit before enabling:
  ```bash
  npm run audit:smart-wallets
  npm run audit:smart-wallets -- --require
  ```
- Scam-risk checks exclude tokens with Honeypot.is honeypot/high-risk results,
  failed or inconclusive sell simulation, extreme sell tax, no observed 24h
  sells, very low liquidity, extremely illiquid price moves, or very low trading
  activity.
- These checks are not a guarantee of safety. GoPlus contract-risk checks can be
  added later as an additional static-analysis layer.
- `DEXSCREENER_CACHE_TTL_SECONDS` controls server-side in-memory cache TTL.
- `HONEYPOT_CACHE_TTL_SECONDS` controls server-side in-memory simulation cache TTL.
- `SMART_WALLET_BLOCK_RANGE` is capped server-side to avoid abusive Base RPC
  scans. Never scan from genesis.

Coin tracking:

- Stored in `base_coins`.
- Ranked through `lib/ranking/coins.ts`; React components do not calculate coin
  ranks.
- Discovery writes are server-only and protected by `REFRESH_SECRET`.
- `firstSeenAt` is preserved across reruns, so repeated discovery updates do not
  erase the original early-detection timestamp.
- Low-liquidity and high-risk coins can appear in discovery views, but risk
  flags and confidence penalties reduce their ranking.
- App rankings and coin rankings are intentionally separate. Token momentum
  never changes app trend score.
- Stale thresholds:
  - app metrics: 2 hours
  - coin metrics: 20 minutes
  - new coin discovery: 15 minutes

Token API:

```bash
curl "$APP_URL/api/tokens?limit=8"
curl "$APP_URL/api/coins?limit=300"
curl "$APP_URL/api/coins/<token-address>"
```

The `/coins` page supports server-rendered list expansion:

- `/coins?limit=100`
- `/coins?limit=300`
- `/coins?sort=newest&limit=300`
- `/coins?cohort=new-launches&sort=newest&limit=300`
- `/coins?cohort=early-momentum`
- `/coins?cohort=established-leaders`
- `/coins?cohort=unusual-activity`

`/coins?new=true` remains a legacy alias for New Launches. A coin enters that
view only if its pair address and reported pair-creation time place it within
the last 24 hours and its market snapshot is fresh. `firstSeenAt` is not used as
pool age: a newly discovered old asset such as cbBTC is not a new launch.
Early Momentum requires a 1-7 day pool, liquidity, trades and volume. Established
Leaders require a pool at least seven days old, stronger liquidity/volume and
medium-or-better confidence. Unusual Activity surfaces extreme movement or
turnover separately, including risky assets. Coins without adequate evidence
remain in All coins. Cohorts are mutually exclusive; they do not verify token
safety. "No major flags" is an incomplete automated screen, not a guarantee
that a token can be sold. The UI exposes Top 100, Top 300, Newest, and Load more
without mixing coin rankings into app rankings.

Verify token radar:

```bash
npm run verify-token-radar
npm run verify:coins
```

Verify trend expansion:

```bash
npm run verify-trend-expansion
```

## Production Deployment Notes

- Set `NEXT_PUBLIC_USE_MOCK_DATA=false` in the deployment environment.
- Store `SUPABASE_SERVICE_ROLE_KEY` as a server-side secret only.
- Set `APP_URL` to the production domain, for example `https://your-app.vercel.app`.
- Run `npm run build` after changing public env vars.
- Run `npm run verify:supabase` against the deployed preview using:

```bash
VERIFY_APP_BASE_URL=https://your-preview-url npm run verify:supabase
```

- Run the production smoke test against the deployed app:

```bash
APP_URL=https://your-production-domain.com npm run verify:production
```

The smoke test checks `/api/health`, homepage, `/api/apps`, `/api/coins`, one
app detail page, one coin detail page when coin data exists,
protected refresh/admin/discovery endpoints, and obvious secret leaks in public responses.
`/api/health` is intentionally lightweight and does not perform DB or RPC checks.

- Rotate any key that may have been pasted into client code, logs, screenshots, or a public repository.
- Re-run the verifier after every migration or policy change.

Deployment safety checklist:

- Supabase migrations applied.
- Seed data loaded.
- RLS verified with `npm run verify:supabase`.
- Upstash verified with `npm run verify:rate-limit`.
- Base RPC verified with `npm run verify:base-indexer`.
- Refresh cron verified with `npm run verify:refresh-cron`.
- Refresh monitoring verified with `npm run verify:refresh-monitoring`.
- Production env vars set in Vercel Production.
- Preview env vars set intentionally, not copied blindly.
- Cron configured in `vercel.json`. Hobby deployments use daily Vercel Cron;
  use Vercel Pro or an external scheduler for 30-minute app refresh and
  5-minute coin discovery.
- `SUPABASE_SERVICE_ROLE_KEY` is not exposed through any `NEXT_PUBLIC_*` var.
- `NEXT_PUBLIC_USE_MOCK_DATA=false`.
- `npm run build` passes.

Official references:

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase secure data guide: https://supabase.com/docs/guides/database/secure-data

## Rate Limiting

Public API routes are protected before external indexing or social integrations are added.

Server-only environment variables:

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Create an Upstash Redis database, copy the REST URL and REST token, and store both as server-side secrets. Never prefix them with `NEXT_PUBLIC_`.

Route limits:

- `POST /api/submit`: 5 requests per 10 minutes per identifier
- `POST /api/refresh-metrics`: 10 requests per hour per identifier
- `GET /api/apps`: 120 requests per minute per identifier

Identifier priority:

- first IP in `x-forwarded-for`
- `x-real-ip`
- hashed `user-agent`
- `anonymous`

Behavior:

- If Upstash env vars exist, rate limits use persistent Upstash Redis.
- If Upstash env vars are missing in development, an in-memory fallback is used.
- If Upstash env vars are missing in production, write/refresh routes fail closed and read routes fail open with server-side warning logs.
- Redis/internal failures never leak detailed infrastructure errors to clients.

Manual verification:

```bash
npm run verify:rate-limit
```

The verifier checks:

- `/api/apps` works under normal use and returns rate limit headers
- `/api/submit` returns `429` after 5 requests
- `/api/refresh-metrics` returns `429` after 10 requests
- development fallback enforces limits when Upstash env vars are missing

Production fallback check:

```bash
NODE_ENV=production npm run build
```

Deploy without Upstash only for a deliberate smoke test: write and refresh routes should return `429` rather than allowing unsafe spam. Configure Upstash before real production traffic.

Official references:

- Upstash Redis: https://upstash.com/docs/redis
- Upstash Ratelimit: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview

## Base RPC Indexing MVP

The refresh job can now collect conservative real onchain activity from Base using each approved app's `contract_addresses`.

What it does:

- Uses a server-only viem Base public client from `BASE_RPC_URL`.
- Base's shared `https://mainnet.base.org` endpoint is rate-limited and unsuitable for production log indexing. In production, contract-log scans are skipped when this endpoint is configured; protocol adapters continue and the refresh response/run notes explain the limited coverage. This does not disable other Base RPC features.
- Reads recent logs for each approved app contract.
- Scans only a small bounded block range.
- Counts logs and distinct transaction hashes as a bounded diagnostic sample. Indexed event topics are not counted as users.
- Inserts a metadata row with `source = base_rpc`, `confidence = low`, `coverage = experimental`, and the observed block range in notes. Daily TX/wallet fields are withheld.
- Recalculates trend score with the existing ranking formula.

Server-only environment variables:

```bash
BASE_RPC_URL=
REFRESH_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
```

Safety limits:

- Default scan range: 1,000 recent Base blocks.
- This range applies only when contract-log scans are enabled for the configured provider; reducing it to five blocks did not resolve the public endpoint's observed `-32011` rejection.
- Hard max scan range: 2,000 blocks.
- Default app limit per run: 20 approved apps.
- Apps with invalid contract addresses or too many contract addresses are skipped.
- Scans exceeding the per-app log budget fail rather than silently truncating a partial count.
- Each app refresh has a timeout and failures are isolated.
- One app failure is isolated; the refresh continues for other apps.
- RPC/internal errors are logged server-side with safe summaries only.

Run a refresh:

```bash
curl -X POST "http://localhost:3000/api/refresh-metrics" \
  -H "Authorization: Bearer $REFRESH_SECRET"
```

For a tiny smoke test:

```bash
curl -X POST "http://localhost:3000/api/refresh-metrics?limit=1&blockRange=20" \
  -H "Authorization: Bearer $REFRESH_SECRET"
```

Verify the Base indexer:

```bash
npm run verify:base-indexer
```

### Restoring production log scans

The public Base RPC is unsuitable for production log scans. Production scans are disabled by default even when `BASE_RPC_URL` points to a private provider. Do not re-enable them by assuming a private endpoint supports `eth_getLogs`. First select a Base RPC provider and confirm its free-tier method limits, monthly quota, and whether overage can incur charges. For example, Chainstack advertises a free Developer plan with 3 million request units per month, but its pricing page also lists paid extra usage. Its Developer `eth_getLogs` limit is 100 blocks per request. Do not enable a billing method or paid overage for this project without a separate decision.

Keep the provider URL only in server-side `BASE_RPC_URL` (local `.env.local`, then Vercel Production Secret). Never send the URL to the browser, paste it in chat, or put it in a cron URL. Before changing production, test the endpoint locally:

```bash
npm run verify:base-rpc-provider
```

Set `BASE_RPC_LOG_PAGE_BLOCKS=100` locally for Chainstack Developer. The indexer scans its 1,000-block sample in ten bounded pages, querying all verified app contracts together per page. Each page must succeed; partial results are discarded on failure. The read-only probe checks Base chain ID and latest block, then queries 5 recent blocks, the latest configured-size page, and the immediately preceding page against the verified Basenames registrar. It makes no database writes and prints no endpoint or raw provider error. It refuses the shared `mainnet.base.org` endpoint. Only after all checks pass should the URL and page limit be staged in Vercel and a single authorized, bounded refresh be tested. Confirm quota/overage controls and monitor refresh failures before relying on the scheduled job. **Only after the staged scan succeeds**, set server-only `BASE_RPC_CONTRACT_SCANS_ENABLED=true` on the verified deployment and redeploy. The public RPC stays disabled regardless of this flag. `/api/health` and refresh summaries expose `contractLogScanStatus` without exposing endpoint credentials. Existing adapter metrics remain available while log scans are skipped.

On 2026-10-26, the free Chainstack Base node passed the latest 100-block page but rejected the preceding page with RPC `-32002` (archive access unavailable on the current plan). A staged Vercel refresh confirmed zero Base RPC metric rows and an isolated source failure. This node is therefore **not** production-ready for the current 10-minute refresh cadence or the 1,000-block sample. The live deployment stays on the public Base RPC with contract scans disabled; do not infer that recent-only log access provides complete 24h activity. No paid upgrade or overage was enabled.

### Recent-tip capture (staged, not scheduled)

`POST /api/scan-contract-tip` is a separate, disabled-by-default experiment for a private RPC that can read the latest blocks but not historical pages. With `BASE_RPC_TIP_SCANNER_ENABLED=true`, `REFRESH_SECRET`, a verified private server-only `BASE_RPC_TIP_URL`, and the `base_contract_scan_windows` migration applied, it queries at most 80 blocks ending 12 blocks behind the head. This endpoint is separate from `BASE_RPC_URL` so the existing app and coin refresh jobs keep their current RPC behavior. It queries all approved tracked contracts together, groups distinct transaction hashes by app, and stores a private window record. A rerun of the same block tip does not create another record. The first record has no continuity baseline; later records explicitly store the number of skipped blocks. Invalid or excessive contract sets, incomplete logs, and over-budget responses fail without writing a partial window. No wallet counts are inferred from log topics.

The table has RLS enabled and no public policies or grants; only the server-side service role can write it. The API requires the refresh secret, its own 40/hour rate limit, and a 90-second Upstash lease to avoid overlapping serverless executions. It **does not write `app_metrics` or change rankings**. Do not schedule it until the migration, provider quota, consecutive-window continuity, and real cron latency have been checked. A two-minute schedule would mean about 720 scans/day plus `eth_blockNumber` calls; confirm actual request-unit use in Chainstack before leaving it enabled. If a run arrives too late for the provider's recent-tip window, it records a gap rather than inventing coverage. Never call these samples 24h activity until a full, gap-free day and source semantics are independently validated.

Local verification:

```bash
npm run verify:tip-scanner
```

Keep `BASE_RPC_TIP_SCANNER_ENABLED=false` in Production until a separate staged rollout decision. This flag does not turn on the existing 1,000-block contract scanner (`BASE_RPC_CONTRACT_SCANS_ENABLED`); both flags are server-only. There is no Vercel or cron-job.org schedule for this experimental route.

Provider references: [Base public RPC limitations](https://www.base.org/blog/base-mainnet-is-open-for-builders), [Chainstack pricing](https://chainstack.com/pricing/), [Chainstack log-query limits](https://chainstack.com/learn/how-to/how-to-fix-rpc-rate-limit-errors-429/), [Alchemy Base `eth_getLogs` limits](https://www.alchemy.com/docs/chains/base/base-api-endpoints/eth-get-logs).

Limitations:

- Base RPC rows are explicitly marked as `source = base_rpc`, `confidence = low`, `coverage = experimental`, with a block-range sample in notes.
- API responses include metric `source`, `confidence`, and `notes` so the UI can label estimated metrics in a later polish pass.
- A 1,000-block scan is not a 24h or 7d index. Its counts are not written to `tx_24h`, `tx_7d`, `unique_users_24h`, or `unique_users_7d`; the sample remains in the row notes.
- Historical rows from earlier releases may contain short-window counts in daily fields. The display layer suppresses numeric TX/wallet values from those generic RPC sources.
- `volume_24h`, `volume_7d`, and `social_mentions_24h` are set to `0` in this phase.
- Builder Code attribution is separate from this generic contract-log sample.

## Builder Codes / ERC-8021 MVP

The project now includes a conservative Builder Codes attribution parser and storage layer.

What is implemented:

- `lib/builderCodes/parser.ts` parses known ERC-8021-style calldata suffixes.
- `lib/builderCodes/attribution.ts` converts transaction calldata into a stable attribution object.
- `builder_code_attributions` stores detected transaction-level attribution rows.
- Refresh can sample transaction hashes discovered by the Base RPC log indexer, fetch transaction calldata, parse Builder Codes, and upsert attribution rows.
- Duplicate transaction hashes are handled with `upsert` on `transaction_hash`.

Database table:

- `transaction_hash`: unique transaction id
- `builder_code`: decoded builder/app code
- `from_address` / `to_address`: transaction endpoints when available
- `confidence`: currently `low`
- `raw_suffix`: detected suffix bytes when available
- `detected_at`: insertion timestamp

RLS model:

- public users can read attribution rows
- public users cannot insert, update, or delete attribution rows
- service role writes happen only in trusted server-side indexer jobs

Parser limitations:

- This is not a full historical chain indexer.
- The parser only supports the known schema-0 suffix shape used by current Builder Codes tooling.
- It intentionally returns `confidence = low` until exact registry validation and broader schema decoding are added.
- Malformed calldata never throws; it returns a safe miss with a reason.
- No user-submitted attribution writes are accepted.

Why this is separate from Base RPC contract activity:

- Contract activity says "this app's listed contracts emitted logs."
- Builder Codes say "this transaction declares attribution to this builder/app in calldata."
- Those are related but different signals. The current ranking keeps Base RPC metrics working and stores Builder Code attributions separately until attribution confidence is high enough to affect metrics directly.

Future ranking bridge:

- Apps with a matching `builder_code` can later receive higher-confidence transaction/user attribution.
- Once parser confidence improves, `builder_codes` metric rows can be inserted with `confidence = medium` or `high`.
- The UI can later show "estimated" or "attributed" using metric `source`, `confidence`, and `notes`.

Verify:

```bash
npm run verify:builder-codes
```

## Builder Code Metrics Bridge

Detected Builder Code attribution rows can now produce app-level metric rows without replacing Base RPC metrics.

Local registry:

- The registry is local and uses `apps.builder_code`.
- Matching is case-insensitive and trims whitespace.
- Empty or malformed codes are rejected.
- No external Builder Code registry API is called yet.

Bridge behavior:

- `lib/builderCodes/registry.ts` resolves a Builder Code to an approved app.
- `lib/builderCodes/metricsBridge.ts` counts recent `builder_code_attributions` rows for that app's registered code.
- Default window is 24 hours.
- `attributedTx24h` is the unique attributed transaction count.
- `attributedUsers24h` is estimated from unique `from_address` values.
- Bridge confidence remains `low` while the parser is heuristic and not externally registry-verified.

Refresh behavior:

- Base RPC metrics are still inserted as separate `source = base_rpc` rows.
- When matching attribution rows exist, refresh inserts an additional `source = builder_codes` metric row.
- The bridge note is: `Attributed from locally registered Builder Code matches. Parser is conservative and not registry-verified externally.`
- Base RPC metrics are not deleted or overwritten.

Data source precedence:

1. Prefer recent reliable `protocol_adapter` metrics.
2. Otherwise prefer recent `builder_codes` metrics when `tx_24h > 0`.
3. Otherwise use `base_rpc`.
4. Otherwise use `mock`.

This keeps rankings conservative while letting the UI/API expose `source`, `confidence`, and `notes`.

Verify:

```bash
npm run verify:builder-code-bridge
```

## Scheduled Metric Refresh

Production deployments can refresh metrics automatically.

Required server-side environment variables:

```bash
APP_URL=https://your-production-domain.com
BASE_RPC_URL=
REFRESH_SECRET=
CRON_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
```

Manual local refresh:

```bash
npm run refresh:metrics
```

That script calls:

```bash
POST /api/refresh-metrics
Authorization: Bearer <REFRESH_SECRET>
```

Cron behavior:

- `vercel.json` uses daily schedules because Vercel Hobby deployments reject
  cron expressions that run more than once per day.
- Set `CRON_SECRET` in Vercel Production for the daily backup. Vercel sends it
  automatically as a Bearer header; no secret belongs in `vercel.json`.
- Use cron-job.org for faster runs. It supports a custom
  `Authorization: Bearer <REFRESH_SECRET>` header. Query-string secret fallback
  remains available, but avoid it when possible because URLs can enter logs.
- For app metrics on cron-job.org, use `mode=fast&limit=2` every 10 minutes.
  Each call selects a different stable batch of two contract-tracked apps and
  two adapter-only apps. Up to 20 adapter-only apps therefore complete a cycle
  within 100 minutes; source outages may still leave individual apps stale.
  Apps without verified Base contracts or a reliable Base-specific adapter
  remain unmeasured instead of receiving synthetic values. The daily Vercel backup runs the default pipeline but
  remains bounded by `MAX_INDEXER_APPS_PER_RUN`.
- Missing or invalid secrets return `401`.
- Failed refreshes return `503` rather than a misleading `200`; partial
  successes retain their safe aggregate counters.
- Refresh responses never include secrets or raw RPC errors.
- Confirm cron execution in Vercel Logs by filtering for `/api/refresh-metrics`.
- Confirm coin discovery in Vercel Logs by filtering for `/api/discover-coins`
  or `[coin-discovery]`.

Safe response shape:

```json
{
  "ok": true,
  "processedApps": 12,
  "baseRpcMetricsInserted": 10,
  "builderCodeMetricsInserted": 2,
  "attributionsInserted": 4,
  "skippedApps": 3,
  "errors": 1
}
```

Verification:

```bash
npm run verify:refresh-cron
```

Monitoring notes:

- Watch `errors` and `skippedApps` in refresh responses.
- Keep `MAX_INDEXER_APPS_PER_RUN` conservative until RPC provider limits are understood.
- Rotate `REFRESH_SECRET` if it is ever pasted into logs, screenshots, tickets, or public files.

Official references: [Vercel Cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and [cron-job.org custom headers and 30-second timeout](https://cron-job.org/en/faq/).

## Running Base Radar on Vercel Hobby with cron-job.org

Base Radar is designed to stay compatible with the Vercel Hobby/free plan.
Vercel Cron remains a daily backup only. Fast refresh jobs should be triggered
by an external scheduler such as cron-job.org.

Use `GET` and configure a custom `Authorization` header with value
`Bearer YOUR_REFRESH_SECRET` for each job. Do not put the secret in the URL.
cron-job.org's default timeout is 30 seconds; check the execution history.
The fast app mode limits work per request, but its actual duration still needs
production measurement.

Job 1 — Discover new Base coins:

- Frequency: every 10 minutes
- URL:
  `https://base-radar.vercel.app/api/discover-coins?summary=1`
- Expected success status: `200`
- Expected response: `success: true`, plus discovered/refreshed/skipped/failure counters
- `summary=1` omits the large `coins` response array only. It does not lower
  the configured discovery limit, change persistence, or reduce source coverage.
  Keep the existing Authorization header; do not put the secret in the URL.
- Health fields to watch: `lastCoinDiscoveryAt`, `isCoinDiscoveryStale`, `warnings`

Job 2 — Refresh tracked coin metrics:

- Frequency: every 15 minutes
- URL:
  `https://base-radar.vercel.app/api/refresh-coins`
- Expected success status: `200`
- Expected response: `refreshedCount`, `skippedCount`, `failedCount`, and warnings
- This job only refreshes persisted token addresses in DexScreener batches;
  the discovery job is separate. When coin persistence is unavailable, it
  falls back to a small discovery run rather than failing.
- Apply `20261014151740_coin_pool_provenance_and_safety.sql` before enabling
  this job in production. The application remains compatible before migration,
  but pool age and explicit safety evidence cannot be persisted yet.
- Apply `20261014152307_coin_job_run_tracking.sql` to persist independent
  discovery and refresh results. `coin_job_runs` is service-role-only; the
  public health endpoint shows only each job's last successful finish time.
- Apply `20261020214503_coin_refresh_skip_reasons.sql` to persist aggregate
  `skip_reasons` in each refresh run. The API response and server log also show
  these counts without listing wallet or token addresses. `no_active_pair`
  means a separate DexScreener token lookup returned no Base pair;
  `not_returned_in_batch` means the batch omitted the token and its individual
  lookup has not yet been attempted; `quote_side_only` and `invalid_pair_data`
  identify pairs that cannot safely produce token metrics. A small rotating
  set of missing tokens is checked individually each run to stay within API
  and function budgets. Source-request failures count as failures, not skips.
  Missing tokens keep their previous metrics; a skip is not zero activity.
- Health fields to watch: `coinLastUpdated`, `lastCoinRefreshAt`, `isCoinDataStale`, `warnings`

Coin age and safety provenance:

- `first_seen_at` means first observed by Base Radar, not token launch time.
- `pair_created_at` is the DexScreener-reported pool creation time. "New pools"
  filtering and the age score use only this timestamp; missing dates receive
  no recency boost.
- A Honeypot.is timeout or unavailable check is not a positive honeypot result.
  Only an explicit positive result sets `honeypot_flagged`. Legacy ambiguous
  flags are shown as safety checks needing verification, not a confirmed label.

Job 3 — Refresh app metrics in rotating short batches:

- Frequency: every 10 minutes
- URL:
  `https://base-radar.vercel.app/api/refresh-metrics?mode=fast&limit=2`
- Expected success status: `200`
- Expected response: app metrics counters such as `processedApps`, `skippedApps`, and `errors`
- Health fields to watch: `lastAppRefreshAt`, `isAppDataStale`, `latestRefreshStatus`, `warnings`
- Health reports this as a rotating partial batch every 10 minutes. Its
  `lastAppRefreshAt` and `isAppDataStale` describe the newest measured app,
  not proof that every tracked app was refreshed. `recentlyMeasuredAppCount`
  and `isAppCoverageLimited` show approved-app coverage over the same two-hour
  window. The bounded default-mode Vercel backup is daily; use per-app measured
  timestamps to assess individual coverage.

cron-job.org settings:

- Method: `GET`
- Timeout: use the default 30 seconds and inspect actual durations. If the
  app job times out, reduce `limit` to 1 and investigate; do not mark it healthy.
- Retry behavior: enable one retry at most. The current lock prevents concurrent
  runs, but a completed retry can write another metric snapshot in the same slot.
- Success condition: HTTP `200` with `success: true` or `ok: true`. `401` means
  the secret is wrong, `429` means rate-limited, and `503` means refresh failed.
- Confirm jobs are working by opening `/api/health` and checking that stale
  warnings clear and timestamps move forward.

Run `npm run verify:scheduler` against the public site to fail loudly when
any of the app, coin, or discovery timestamps are stale. A successful daily
backup alone does not meet the intended fast-refresh cadence.

If `base_coins` has not been migrated yet, coin endpoints still return live
DexScreener fallback data. Coin discovery will return a warning and
`persistenceAvailable: false` instead of failing the whole request.

## Refresh Monitoring

Every authorized metrics refresh records one operational row in `refresh_runs`.
This is intentionally admin-only infrastructure data, not public product data.

Stored fields:

- timestamps: `started_at`, `finished_at`, `duration_ms`
- status: `running`, `success`, `partial_failure`, or `failed`
- counters: processed apps, inserted Base RPC metrics, inserted Builder Code metrics, inserted attributions, skipped apps, errors
- trigger metadata: `trigger_type` as `manual`, `cron`, or `verification`
- short notes for safe operational context

Security model:

- RLS is enabled on `refresh_runs`.
- No public read/write policy is created.
- `anon` and `authenticated` grants are revoked.
- Server-side service role code writes and reads run history.
- The admin API requires `Authorization: Bearer <REFRESH_SECRET>`.

Inspect latest runs:

```bash
curl -H "Authorization: Bearer $REFRESH_SECRET" \
  "$APP_URL/api/admin/refresh-runs"
```

Verify monitoring:

```bash
npm run verify:refresh-monitoring
```

Manual refresh:

```bash
npm run refresh:metrics
```

Inspect latest refresh runs:

```bash
curl -H "Authorization: Bearer $REFRESH_SECRET" \
  "$APP_URL/api/admin/refresh-runs"
```

Production recommendation:

- Monitor the latest run status after deployment.
- Alert on repeated `failed` or `partial_failure` statuses.
- Track whether `duration_ms` grows after adding more apps or richer indexing.
- Keep this API server-only/admin-only; do not build public UI on top of it.

## Search Visibility and Privacy-Conscious Measurement

- The canonical origin is fixed at `https://base-radar.vercel.app`; Vercel preview hosts and `APP_URL` never become canonical URLs. Update `lib/site.ts` deliberately if the public domain changes.
- `/sitemap.xml` lists the homepage, coin tracker, submit page and only approved app detail pages. Pending app discoveries and individual coin pages are excluded. Non-production Vercel previews use `noindex` and a disallow-all robots policy.
- `npm run verify:seo` checks canonicals, robots and sitemap against `APP_URL` (for example `APP_URL=https://base-radar.vercel.app npm run verify:seo`).
- Product analytics are **planned, not enabled**. Proposed aggregate events are `app_detail_open` (source view and approved app slug), `coin_detail_open` (source view and address), `discovery_cohort_select` (cohort name), and `return_visit` (coarse first-party returning-session flag). Do not send wallet addresses, IPs, contact details, searches, referral query strings, or raw user identifiers as event properties.
- Before enabling measurement, choose an analytics provider, configure retention and any applicable consent controls, and document the collection purpose. Count aggregate events only; do not claim traffic, conversion or repeat-visit results without actual analytics or Search Console access.

## Local Watchlist and App Comparison

- Star an app or coin detail to save it in this browser. `/watchlist` is browser-local, has no login or server write, and is not indexed by search engines. Clearing local storage or changing devices removes the list; the page explains this before use.
- App comparison requires two saved, public apps with recent snapshots from the same metric source and measurement method, medium-or-better confidence/coverage, and available reliable observations. Incompatible metrics show a reason instead of a fabricated zero or ratio.
- Coin watchlisting does not endorse a token or provide an investment recommendation. The watchlist stores only public slugs, contract addresses and display names, up to 100 items.

## Builder Claim Verification Boundary

The current `Claim app` entry point is a **manual listing review request** through `/submit?claim=<slug>`. It does not verify builder identity, grant listing ownership, or display a verified-builder badge. The submitted contact is not proof; the slug only pre-fills the form. Moderators must not treat an approved listing submission as an approved ownership claim.

Before verified builder profiles go live, use a separate claim record bound to an existing approved app ID and its stored canonical website domain, not a domain supplied in the claim. A short-lived, single-use DNS TXT challenge can demonstrate domain control; store only a challenge hash and expiry. Domain control alone is still insufficient: a moderator must cross-check official project references and approve the claim. Keep pending, proof-checked, approved, rejected, disputed, and revoked states distinct. Revocation immediately removes any public verification signal.

`supabase/migrations/20261024053655_builder_claim_review_boundary.sql` defines private claim and transition-audit tables with RLS, no public policies, service-role-only claim writes, append-only audit writes, and unique active-contact/approved-owner constraints. Its privileged audit trigger lives in an unexposed schema. `20261024053822_builder_claim_audit_order.sql` adds an ordered audit sequence; timestamps alone cannot order events within one transaction. `20261024055551_builder_claim_expiry.sql` allows a timed-out pending challenge to be marked `expired` so a claimant may safely retry. The Supabase advisor's `rls_enabled_no_policy` info notice is intentional for these private tables.

The claim API is feature-gated and off by default (`BUILDER_CLAIMS_ENABLED=false`). It is separate from the listing-submission UI, which remains review-only. To enable it, first apply the three migrations above, configure Supabase server credentials and persistent write rate limiting, and provision at least one **non-anonymous** Supabase Auth moderator. Only a trusted Supabase administrator may set that user's `app_metadata.base_radar_role` to `claim_moderator`; do not use editable `user_metadata`, an email address, or `REFRESH_SECRET` as moderation authority. Rebuild/redeploy after changing the server-only flag.

The private `/admin/builder-claims` page accepts a Supabase Auth magic-link session for an existing user (`shouldCreateUser=false`). `POST /api/admin/auth/magic-link` is same-origin, validated and persistently rate-limited; it returns a generic response so account existence is not disclosed. The browser uses only the public Supabase client and sends its short-lived access token to the same-origin moderation API. The API calls Supabase Auth `getUser` and checks current `app_metadata` server-side before returning private contacts or applying a decision. A signed-in user without the moderator role cannot access the queue. This page is not indexed and does not grant ownership or show a public badge.

For production magic links, set the Supabase Auth **Site URL** to `https://base-radar.vercel.app` and allow the exact redirect `https://base-radar.vercel.app/admin/builder-claims` in Authentication > URL Configuration. Add `http://localhost:3000/admin/builder-claims` only for local development. Do not use broad production redirect wildcards. The email template must honor Supabase's redirect target. Confirm the user's email, role, and a successful moderator sign-in before enabling the claim flag. Domain proof testing still requires control of the stored official app domain; never use someone else's protocol domain or create a fake approved listing in production for a test.

Claim flow (all responses use `Cache-Control: no-store`):

1. `POST /api/claims` with `{"appSlug":"verified-app-slug","contact":"builder@example.org"}` creates a 15-minute challenge for the **stored official HTTPS website hostname** of an approved app. The response returns `claimId`, `dnsRecord`, and a one-time `dnsValue`; the database stores only the SHA-256 digest. Never send this value to a logger, analytics service, or third party except the project's DNS provider.
2. The domain owner publishes the exact TXT value at the returned DNS record. `POST /api/claims/{claimId}/verify` with `{"challengeToken":"<64-character token from dnsValue>"}` performs a bounded TXT lookup. Wrong-domain, expired, already-used, changed-website, and malformed challenges fail. A successful check moves the claim to `proof_checked` and consumes the challenge; it **does not** verify builder identity or grant a public badge.
3. A moderator obtains a normal Supabase Auth access token and calls `GET /api/admin/builder-claims?status=proof_checked` or `POST /api/admin/builder-claims/{claimId}/decision` with `Authorization: Bearer <user access token>` and `{"decision":"approve"}`. Other decisions are `reject`, `dispute`, and `revoke`. The server verifies the token with Supabase Auth, checks the current app domain and state, and conditionally updates one row. A normal Auth user, an anonymous user, or the cron secret cannot moderate. Decisions and proof transitions are audit-triggered. No public verified-builder badge is rendered yet.

Run `npm run verify:builder-claims` for local security checks. Public API operations require persistent write rate limiting in production; absent Upstash configuration fails closed. Do not enable the flag until a real moderator account and an operations process for disputes and revocation are ready. Before displaying a badge, run a controlled end-to-end claim with an official domain owner, audit moderator access and domain changes in production, and add a public read model that exposes no private contact or challenge fields.

## Architecture

- UI reads app data through `lib/data.ts` only.
- Mock source data lives in `lib/mockData.ts`.
- Supabase browser/server/admin clients are separated under `lib/supabase/`.
- Persistent rate limiting lives in `lib/rateLimit.ts`.
- Base RPC client lives in `lib/baseClient.ts`.
- Contract activity indexing lives in `lib/indexer/baseActivity.ts`.
- Builder Codes parsing lives in `lib/builderCodes/`.
- Builder Code registry and metrics bridge logic also lives in `lib/builderCodes/`.
- Farcaster/social discovery lives in `lib/social/`.
- Public-source candidate discovery lives in `lib/discovery/`.
- Token trend reads and future adapters live in `lib/tokens/`.
- Coin schema checks and typed coin models live in `lib/coins/`.
- Coin ranking and app ranking snapshots live in `lib/ranking/`.
- Coin risk scoring lives in `lib/risk/` and `lib/scoring/coins.ts`.
- Shared external cron authentication lives in `lib/cronAuth.ts`.
- Refresh observability lives in `refresh_runs` and `/api/admin/refresh-runs`.
- Trend ranking lives in `lib/scoring.ts`.
- Submit validation lives in `lib/validation.ts`.
- Security helpers live in `lib/security.ts`.

When `NEXT_PUBLIC_USE_MOCK_DATA=true`, `lib/data.ts` uses mock data. When `NEXT_PUBLIC_USE_MOCK_DATA=false`, it reads approved apps and latest metrics from Supabase without changing UI components.

## Later Phases

Not implemented yet:

- external Builder Code registry validation and high-confidence attribution metrics
- X/Twitter social metrics
- historical charts
- generated share image pipeline

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run build
npm run verify:production
npm run verify:coins
npm run verify:api
```
