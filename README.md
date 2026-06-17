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
REFRESH_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
DEFILLAMA_CACHE_TTL_SECONDS=1800
DEXSCREENER_CACHE_TTL_SECONDS=300
HONEYPOT_CACHE_TTL_SECONDS=900
DEX_FACTORY_BLOCK_RANGE=21600
MAX_DEX_FACTORY_POOLS=80
TOKEN_SNAPSHOT_LIMIT_PER_BUCKET=25
BASE_TOKEN_WATCHLIST_JSON=[]
BASE_TOKEN_WATCHLIST_WALLETS=
SMART_WALLET_BLOCK_RANGE=7200
NEYNAR_API_KEY=
NEYNAR_CACHE_TTL_SECONDS=1800
```

Only `NEXT_PUBLIC_*` values are safe for the browser. `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `BASE_RPC_URL`, `REFRESH_SECRET`, `BASE_TOKEN_WATCHLIST_JSON`, `BASE_TOKEN_WATCHLIST_WALLETS`, and `NEYNAR_API_KEY` must stay server-side. Cache TTL and scanner-range values are not secrets, but they still belong in server/runtime env. `APP_URL` is not a secret, but it is used by local scripts. `SUPABASE_SERVICE_ROLE_KEY` is only for server-only admin tasks such as seeding, moderation, and future metrics jobs.

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
3. Base RPC contract-log estimates
4. Mock/placeholder metrics

Current protocol adapters:

- `uniswap-base`: DefiLlama Base DEX volume and TVL, plus a dedicated 24h Base RPC router-log activity sample from the verified Base Uniswap router. TX/wallet fields are `N/A` if that RPC sample fails.
- `aerodrome`: DefiLlama Base DEX volume and TVL, plus Base RPC contract-log activity estimates.
- `zora`: Base RPC activity estimates first; DefiLlama Zora Coins DEX volume when available.
- `aave-base`: DefiLlama Base TVL/fees, plus Base RPC contract-log activity estimates.
- `moonwell`: DefiLlama Base TVL/fees, plus Base RPC contract-log activity estimates.
- `compound-v3-base`, `morpho-base`, `fluid-base`, `euler-base`, `yearn-base`, `extra-finance`, `seamless-protocol`, `rodeo-finance`, `reserve-protocol`, and `beefy-base`: DefiLlama TVL/fees coverage where available; Base RPC activity is only used when verified contracts are configured.
- `pancakeswap-base`, `curve-base`, `pendle-base`, `balancer-base`, `quickswap-base`, `sushiswap-base`, and `superfluid-base`: DefiLlama Base overview rows for DEX/payment-style volume where available; no contract activity is fabricated when contracts are not verified.
- `across-protocol-base`, `stargate-base`, `layerzero-base`, `hyperlane-base`, `axelar-base`, and `spark-base`: DefiLlama protocol TVL/fees coverage where available; coverage may remain limited if public Base-specific activity metrics are not exposed.

DefiLlama integration:

- Uses official public API endpoints documented at https://api-docs.defillama.com.
- Uses Base-specific DEX overview rows from `https://api.llama.fi/overview/dexs/base`.
- Uses Base-specific fees overview rows from `https://api.llama.fi/overview/fees/base` for lending protocols when DEX volume is not the right metric.
- Uses protocol TVL from `https://api.llama.fi/protocol/{slug}` with Base chain TVL where available.
- Caches responses in-process. Default TTL is `DEFILLAMA_CACHE_TTL_SECONDS=1800`.
- Times out and fails gracefully so refresh jobs keep running if DefiLlama is unavailable.

Confidence levels:

- `high`: verified contracts plus reliable external metrics, usually DefiLlama + Base RPC estimates.
- `medium`: official contracts or partial hybrid metrics.
- `low`: heuristic Base RPC only or unavailable/placeholder coverage.

Coverage levels:

- `high`: volume/TVL and activity coverage are both available.
- `medium`: only external economic metrics or activity estimates are available.
- `limited`: app is real, but reliable metric coverage is incomplete.
- `experimental`: reserved for future sources that need validation.

Exact daily active users cannot always be measured from generic contract logs.
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
- Missing or failing Neynar calls return low-confidence zero metrics and do not break refresh jobs.
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
- Newly discovered apps should enter `candidate_apps` first. They should only be
  promoted to the approved app leaderboard after source validation and enough
  interaction signal; Base Radar should not auto-approve every discovered link.

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
  DEX_FACTORY_BLOCK_RANGE=21600
  MAX_DEX_FACTORY_POOLS=80
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

Token API:

```bash
curl "$APP_URL/api/tokens?limit=8"
```

Verify token radar:

```bash
npm run verify-token-radar
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

The smoke test checks `/api/health`, homepage, `/api/apps`, one detail page,
protected refresh/admin endpoints, and obvious secret leaks in public responses.
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
- Cron configured in `vercel.json`.
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
- Reads recent logs for each approved app contract.
- Scans only a small bounded block range.
- Counts logs, unique transaction hashes, and indexed wallet-looking addresses from event topics.
- Inserts a new `app_metrics` row per refreshed app with `source = base_rpc`, `confidence = low`, and estimation notes.
- Recalculates trend score with the existing ranking formula.

Server-only environment variables:

```bash
BASE_RPC_URL=
REFRESH_SECRET=
MAX_INDEXER_APPS_PER_RUN=20
```

Safety limits:

- Default scan range: 1,000 recent Base blocks.
- Hard max scan range: 2,000 blocks.
- Default app limit per run: 20 approved apps.
- Apps with invalid contract addresses or too many contract addresses are skipped.
- Per-app log counts are clamped to avoid runaway metric spikes.
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

Limitations:

- Base RPC rows are explicitly marked as `source = base_rpc`, `confidence = low`, with notes saying they are estimated from recent logs over a limited block range.
- API responses include metric `source`, `confidence`, and `notes` so the UI can label estimated metrics in a later polish pass.
- `tx_24h` and `unique_users_24h` are conservative estimates from the scanned recent block window, not a full 24-hour index yet.
- `tx_7d` and `unique_users_7d` currently mirror the scanned window until historical backfill exists.
- `volume_24h`, `volume_7d`, and `social_mentions_24h` are set to `0` in this phase.
- Builder Codes / ERC-8021 are intentionally not parsed yet. Contract-based activity is the first safe indexing layer; attribution parsing comes after this is stable.
- Farcaster/Neynar mention tracking, historical charts, and generated share images are later phases.

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

- `vercel.json` schedules `/api/refresh-metrics?secret=$REFRESH_SECRET` daily by default so Hobby deployments can ship.
- On Vercel Pro, change the schedule to `*/30 * * * *` for a 30-minute refresh cadence.
- The endpoint accepts either `Authorization: Bearer <REFRESH_SECRET>` or `?secret=<REFRESH_SECRET>`.
- The query fallback exists because cron providers cannot always send custom headers.
- Missing or invalid secrets return `401`.
- Refresh responses return only safe aggregate counts and never include `REFRESH_SECRET` or raw RPC errors.
- Confirm cron execution in Vercel Logs by filtering for `/api/refresh-metrics`.

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

Official reference: Vercel Cron makes a scheduled HTTP request to the configured `path`: https://vercel.com/docs/cron-jobs

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
```
