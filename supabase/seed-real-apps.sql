-- Verified Base apps seed cleanup.
-- Policy:
-- - Only seed contracts from official docs, official GitHub, Base official docs,
--   or verified Basescan pages.
-- - Builder Codes are intentionally null until verified from the project itself.
-- - Old local mock-looking rows are hidden, not deleted.
-- - Neutral low-confidence metric placeholders are inserted so old mock metrics do
--   not remain the latest visible metric for approved real apps.

begin;

with verified_apps as (
  select *
  from (
    values
      -- Source: Aerodrome official contracts GitHub and security page.
      -- https://github.com/aerodrome-finance/contracts
      -- https://aerodrome.finance/security
      (
        'aerodrome',
        'Aerodrome',
        'DeFi',
        'Base-native liquidity marketplace and AMM for swaps, gauges, voting incentives, and protocol liquidity.',
        'https://aerodrome.finance',
        'https://aerodrome.finance/favicon.ico',
        null,
        null,
        null,
        array[
          '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
          '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
          '0x940181a94A35A4569E4529A3CDfB74e38FD98631'
        ]::text[]
      ),
      -- Source: Uniswap official Base deployment docs.
      -- https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
      (
        'uniswap-base',
        'Uniswap on Base',
        'DeFi',
        'Uniswap protocol deployment on Base for swaps and liquidity through v3 factory, router, and universal router contracts.',
        'https://app.uniswap.org',
        'https://app.uniswap.org/favicon.ico',
        null,
        null,
        null,
        array[
          '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
          '0x2626664c2603336E57B271c5C0b26F421741e481',
          '0x6fF5693b99212Da76ad316178A184AB56D299b43'
        ]::text[]
      ),
      -- Source: Aave docs address book reference and verified Basescan Pool page.
      -- https://aave.com/docs/resources/addresses
      -- https://github.com/bgd-labs/aave-address-book
      -- https://basescan.org/address/0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
      (
        'aave-base',
        'Aave V3 on Base',
        'DeFi',
        'Aave V3 lending market on Base for supplying, borrowing, and managing collateral through the Aave Pool.',
        'https://app.aave.com',
        'https://app.aave.com/favicon.ico',
        null,
        null,
        null,
        array[
          '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
          '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
        ]::text[]
      ),
      -- Source: Moonwell official contracts docs.
      -- https://docs.moonwell.fi/moonwell/protocol-information/contracts
      (
        'moonwell',
        'Moonwell',
        'DeFi',
        'Base lending and borrowing protocol with Moonwell markets, rewards, and vault infrastructure.',
        'https://moonwell.fi',
        'https://moonwell.fi/favicon.ico',
        null,
        null,
        null,
        array[
          '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
          '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22',
          '0x628ff693426583D9a7FB391E54366292F509D457'
        ]::text[]
      ),
      -- Source: Zora official support docs.
      -- https://support.zora.co/en/articles/5301825
      -- https://support.zora.co/en/articles/5654721
      (
        'zora',
        'Zora',
        'NFT',
        'Creator and collector network for minting, collecting, rewards, and onchain media experiences on Base and other networks.',
        'https://zora.co',
        'https://zora.co/favicon.ico',
        null,
        null,
        null,
        array[
          '0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B',
          '0x1111111111166b7fe7bd91427724b487980afc69'
        ]::text[]
      ),
      -- Source: BasePaint official site and verified Basescan label.
      -- https://basepaint.xyz
      -- https://basescan.org/address/0xba5e05cb26b78eda3a2f8e3b3814726305dcac83
      (
        'basepaint',
        'BasePaint',
        'NFT',
        'Collaborative daily pixel-art project where contributors paint together and mint the finished canvas on Base.',
        'https://basepaint.xyz',
        'https://basepaint.xyz/favicon.ico',
        null,
        null,
        null,
        array['0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83']::text[]
      ),
      -- Source: Coinbase/Base official docs.
      -- https://help.coinbase.com/en-us/wallet/getting-started/create-a-coinbase-wallet
      -- https://docs.base.org/base-account/reference/onchain-contracts/smart-wallet
      (
        'base-app',
        'Base App',
        'Wallet',
        'Coinbase''s Base app and smart wallet experience for wallets, social, mini apps, and Base-native transactions.',
        'https://wallet.coinbase.com',
        'https://wallet.coinbase.com/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Base names product and provided verified Base contract.
      -- https://www.base.org/names
      -- https://basescan.org/address/0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a
      (
        'basename',
        'Basename',
        'Infrastructure',
        'Base-native identity and naming surface for registering human-readable names and connecting onchain profiles to Base accounts.',
        'https://www.base.org/names',
        'https://www.base.org/favicon.ico',
        null,
        null,
        null,
        array['0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a']::text[]
      ),
      -- Source: Compound docs, DefiLlama compound-v3, and provided Base contract.
      -- https://docs.compound.finance/
      -- https://defillama.com/protocol/compound-v3
      -- https://basescan.org/address/0xb125E6687d4313864e53df431d5425969c15Eb2F
      (
        'compound-v3-base',
        'Compound v3 on Base',
        'DeFi',
        'Compound III deployment on Base for supplying collateral and borrowing through isolated Comet markets.',
        'https://compound.finance',
        'https://compound.finance/favicon.ico',
        null,
        null,
        null,
        array['0xb125E6687d4313864e53df431d5425969c15Eb2F']::text[]
      ),
      -- Source: Extra Finance docs, DefiLlama extra-finance, and provided Base contract.
      -- https://docs.extrafi.io/
      -- https://defillama.com/protocol/extra-finance
      -- https://basescan.org/address/0x2dAD3a13ef0C6366220f989157009e501e7938F8
      (
        'extra-finance',
        'Extra Finance',
        'DeFi',
        'Base DeFi protocol for leveraged yield farming, lending markets, and strategy vault activity.',
        'https://extrafi.io',
        'https://extrafi.io/favicon.ico',
        null,
        null,
        null,
        array['0x2dAD3a13ef0C6366220f989157009e501e7938F8']::text[]
      ),
      -- Source: Seamless docs, DefiLlama seamless-protocol, and provided Base contract.
      -- https://docs.seamlessprotocol.com/
      -- https://defillama.com/protocol/seamless-protocol
      -- https://basescan.org/address/0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7
      (
        'seamless-protocol',
        'Seamless Protocol',
        'DeFi',
        'Base-native lending protocol focused on integrated liquidity markets and automated DeFi strategies.',
        'https://www.seamlessprotocol.com',
        'https://www.seamlessprotocol.com/favicon.ico',
        null,
        null,
        null,
        array['0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7']::text[]
      ),
      -- Source: OpenSea public product/support pages.
      -- https://opensea.io
      -- https://support.opensea.io/
      (
        'opensea-base',
        'OpenSea on Base',
        'NFT',
        'OpenSea marketplace support for discovering, buying, and selling Base NFTs through the broader OpenSea product.',
        'https://opensea.io',
        'https://opensea.io/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Rodeo Finance public app and DefiLlama rodeo-finance.
      -- https://www.rodeo.finance
      -- https://defillama.com/protocol/rodeo-finance
      (
        'rodeo-finance',
        'Rodeo Finance',
        'DeFi',
        'Yield and leverage protocol with Base strategy activity tracked through public protocol metrics.',
        'https://www.rodeo.finance',
        'https://www.rodeo.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Reserve public site and DefiLlama reserve-protocol.
      -- https://reserve.org
      -- https://defillama.com/protocol/reserve-protocol
      (
        'reserve-protocol',
        'Reserve Protocol',
        'DeFi',
        'Asset-backed stablecoin and collateralized asset protocol with Base ecosystem deployments and public protocol metrics.',
        'https://reserve.org',
        'https://reserve.org/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Across public docs and DefiLlama across-v3.
      -- https://across.to
      -- https://docs.across.to/
      -- https://defillama.com/protocol/across-v3
      (
        'across-protocol-base',
        'Across Protocol on Base',
        'Bridge',
        'Crosschain bridge and intent-based interoperability protocol supporting fast transfers to and from Base.',
        'https://across.to',
        'https://across.to/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Stargate public docs and DefiLlama stargate-finance.
      -- https://stargate.finance
      -- https://docs.stargate.finance/
      -- https://defillama.com/protocol/stargate-finance
      (
        'stargate-base',
        'Stargate on Base',
        'Bridge',
        'Omnichain liquidity transport and bridge protocol supporting Base transfers through Stargate and LayerZero infrastructure.',
        'https://stargate.finance',
        'https://stargate.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Beefy public docs and DefiLlama beefy.
      -- https://beefy.com
      -- https://docs.beefy.finance/
      -- https://defillama.com/protocol/beefy
      (
        'beefy-base',
        'Beefy Finance on Base',
        'DeFi',
        'Multichain yield optimizer with Base vaults, strategy automation, and public protocol-level TVL coverage.',
        'https://beefy.com',
        'https://beefy.com/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Morpho app and DefiLlama morpho-blue Base coverage.
      -- https://app.morpho.org
      -- https://defillama.com/protocol/morpho-blue
      (
        'morpho-base',
        'Morpho on Base',
        'DeFi',
        'Base lending market infrastructure for isolated Morpho Blue markets, vault curation, and permissionless credit activity.',
        'https://app.morpho.org',
        'https://app.morpho.org/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Spark app and DefiLlama spark-liquidity-layer Base coverage.
      -- https://app.spark.fi
      -- https://defillama.com/protocol/spark-liquidity-layer
      (
        'spark-base',
        'Spark on Base',
        'DeFi',
        'Spark liquidity and savings infrastructure with Base ecosystem deployment coverage through public protocol metrics.',
        'https://app.spark.fi',
        'https://app.spark.fi/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: PancakeSwap public site and DefiLlama pancakeswap-amm Base coverage.
      -- https://pancakeswap.finance
      -- https://defillama.com/protocol/pancakeswap-amm
      (
        'pancakeswap-base',
        'PancakeSwap on Base',
        'DeFi',
        'PancakeSwap AMM deployment supporting Base swaps and liquidity pools through public DEX and protocol metrics.',
        'https://pancakeswap.finance',
        'https://pancakeswap.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Curve public site and DefiLlama curve-dex Base coverage.
      -- https://curve.finance
      -- https://defillama.com/protocol/curve-dex
      (
        'curve-base',
        'Curve on Base',
        'DeFi',
        'Curve DEX deployment on Base for stable and correlated-asset liquidity, swaps, and pool activity.',
        'https://curve.finance',
        'https://curve.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Pendle public site and DefiLlama pendle Base coverage.
      -- https://pendle.finance
      -- https://defillama.com/protocol/pendle
      (
        'pendle-base',
        'Pendle on Base',
        'DeFi',
        'Yield trading protocol with Base market coverage for fixed yield, points strategies, and tokenized future yield activity.',
        'https://pendle.finance',
        'https://pendle.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Fluid public site and DefiLlama fluid-lending Base coverage.
      -- https://fluid.io
      -- https://defillama.com/protocol/fluid-lending
      (
        'fluid-base',
        'Fluid on Base',
        'DeFi',
        'Fluid lending and liquidity protocol with Base market coverage for collateral, borrowing, and vault-style activity.',
        'https://fluid.io',
        'https://fluid.io/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Euler public site and DefiLlama euler-v2 Base coverage.
      -- https://www.euler.finance
      -- https://defillama.com/protocol/euler-v2
      (
        'euler-base',
        'Euler V2 on Base',
        'DeFi',
        'Euler V2 lending market infrastructure with Base coverage for vault-based borrowing, lending, and risk-managed markets.',
        'https://www.euler.finance',
        'https://www.euler.finance/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Yearn public site and DefiLlama yearn-finance Base coverage.
      -- https://yearn.fi
      -- https://defillama.com/protocol/yearn-finance
      (
        'yearn-base',
        'Yearn Finance on Base',
        'DeFi',
        'Yield aggregation protocol with Base vault coverage for automated strategies and managed onchain yield activity.',
        'https://yearn.fi',
        'https://yearn.fi/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Balancer public site and DefiLlama balancer-v3 Base coverage.
      -- https://balancer.fi
      -- https://defillama.com/protocol/balancer-v3
      (
        'balancer-base',
        'Balancer on Base',
        'DeFi',
        'Balancer protocol deployment on Base for weighted pools, liquidity management, and DEX activity.',
        'https://balancer.fi',
        'https://balancer.fi/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: QuickSwap public site and DefiLlama quickswap-dex Base coverage.
      -- https://quickswap.exchange
      -- https://defillama.com/protocol/quickswap-dex
      (
        'quickswap-base',
        'QuickSwap on Base',
        'DeFi',
        'QuickSwap DEX deployment with Base swap and liquidity coverage through public protocol and DEX metrics.',
        'https://quickswap.exchange',
        'https://quickswap.exchange/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: SushiSwap public site and DefiLlama sushiswap Base coverage.
      -- https://sushi.com
      -- https://defillama.com/protocol/sushiswap
      (
        'sushiswap-base',
        'SushiSwap on Base',
        'DeFi',
        'SushiSwap DEX deployment supporting Base swaps and liquidity pools with public DEX metric coverage.',
        'https://sushi.com',
        'https://sushi.com/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: LayerZero public site and DefiLlama layerzero-v2 Base coverage.
      -- https://layerzero.network
      -- https://defillama.com/protocol/layerzero-v2
      (
        'layerzero-base',
        'LayerZero V2 on Base',
        'Bridge',
        'Omnichain messaging and interoperability infrastructure with Base support and public bridge/protocol metrics.',
        'https://layerzero.network',
        'https://layerzero.network/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Hyperlane public site and DefiLlama hyperlane Base coverage.
      -- https://www.hyperlane.xyz
      -- https://defillama.com/protocol/hyperlane
      (
        'hyperlane-base',
        'Hyperlane on Base',
        'Bridge',
        'Permissionless interoperability protocol with Base support for crosschain messaging, routing, and bridge-style activity.',
        'https://www.hyperlane.xyz',
        'https://www.hyperlane.xyz/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Axelar public site and DefiLlama axelar Base coverage.
      -- https://axelar.network
      -- https://defillama.com/protocol/axelar
      (
        'axelar-base',
        'Axelar on Base',
        'Bridge',
        'Crosschain communication and bridge infrastructure supporting Base connections through Axelar network routing.',
        'https://axelar.network',
        'https://axelar.network/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Superfluid public site and DefiLlama superfluid Base coverage.
      -- https://superfluid.org
      -- https://defillama.com/protocol/superfluid
      (
        'superfluid-base',
        'Superfluid on Base',
        'Infrastructure',
        'Streaming payment and money-flow protocol with Base support for continuous settlement and programmable distribution flows.',
        'https://superfluid.org',
        'https://superfluid.org/favicon.ico',
        null,
        null,
        null,
        array[]::text[]
      ),
      -- Source: Base official contract addresses.
      -- https://docs.base.org/base-chain/network-information/base-contracts
      (
        'base-system-contracts',
        'Base System Contracts',
        'Infrastructure',
        'Canonical Base L2 infrastructure contracts for bridging, messaging, fee vaults, attestations, and chain operations.',
        'https://docs.base.org/base-chain/network-information/base-contracts',
        'https://docs.base.org/favicon.ico',
        null,
        null,
        null,
        array[
          '0x4200000000000000000000000000000000000007',
          '0x4200000000000000000000000000000000000010',
          '0x4200000000000000000000000000000000000021'
        ]::text[]
      )
  ) as app(
    slug,
    name,
    category,
    description,
    website_url,
    logo_url,
    x_url,
    farcaster_url,
    builder_code,
    contract_addresses
  )
),
hidden_legacy as (
  update public.apps
  set status = 'hidden', updated_at = now()
  where slug in (
    'avantis',
    'bankr',
    'base-batch',
    'based-agents',
    'blackbird',
    'brian-ai',
    'coinbase-wallet',
    'extra-finance',
    'farcaster-frames',
    'friend-tech',
    'fren-pet',
    'highlight',
    'mint-fun',
    'onchainkit',
    'paragraph',
    'parallel-colony',
    'privy',
    'rainbow-wallet',
    'sablier',
    'seamless-protocol',
    'superfluid',
    'talent-protocol',
    'thirdweb',
    'virtuals'
  )
  returning slug
),
upserted as (
  insert into public.apps (
    slug,
    name,
    category,
    description,
    website_url,
    logo_url,
    x_url,
    farcaster_url,
    builder_code,
    contract_addresses,
    status,
    updated_at
  )
  select
    slug,
    name,
    category,
    description,
    website_url,
    logo_url,
    x_url,
    farcaster_url,
    builder_code,
    contract_addresses,
    'approved',
    now()
  from verified_apps
  on conflict (slug) do update set
    name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    website_url = excluded.website_url,
    logo_url = excluded.logo_url,
    x_url = excluded.x_url,
    farcaster_url = excluded.farcaster_url,
    builder_code = excluded.builder_code,
    contract_addresses = excluded.contract_addresses,
    status = 'approved',
    updated_at = now()
  returning id
)
insert into public.app_metrics (
  app_id,
  tx_24h,
  tx_7d,
  unique_users_24h,
  unique_users_7d,
  volume_24h,
  volume_7d,
  growth_24h,
  growth_7d,
  social_mentions_24h,
  social_mentions_7d,
  social_engagement_24h,
  social_engagement_7d,
  social_source,
  social_confidence,
  social_window,
  trend_score,
  source,
  confidence,
  volume_24h_usd,
  fees_24h_usd,
  revenue_24h_usd,
  tvl_usd,
  metric_origin,
  coverage,
  notes,
  measured_at
)
select
  id,
  0,
  0,
  0,
  0,
  0,
  0,
  null,
  null,
  0,
  0,
  0,
  0,
  null,
  null,
  '7d',
  0,
  'mock',
  'low',
  0,
  0,
  0,
  0,
  'verified_seed_placeholder',
  'limited',
  'Verified real-app seed placeholder. No measured metrics are available yet.',
  now()
from upserted
on conflict (app_id, source, measured_at) do nothing;

commit;
