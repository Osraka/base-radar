# Base app activity coverage audit

Audited 2026-10-23. This is an event-semantics audit, not a claim that Base
Radar has full daily activity coverage. A 1,000-block contract-log scan covers
only a short, variable interval; a log can be emitted without a distinct user
action, and a transaction can emit several logs. Indexed addresses can be
contracts, pools, beneficiaries, or recipients rather than transaction senders.

The [production app API](https://base-radar.vercel.app/api/apps) returned
`tx24h = 0` and `users24h = 0` for each app below, with `metricOrigin =
defillama` and measured times between 05:30 and 06:01 UTC on 2026-10-23.
These zeros are unavailable activity fields, **not** evidence of no activity.
An independent 100-block sample (blocks 52973557-52973656) was attempted on
the [Base public RPC](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getTransactionCount);
`eth_getLogs` returned `-32011 request limit reached` for all five apps.
No log sample was inferred from that failure.

| App | Verified contract and relevant event | Coverage and confidence | Observed sample / missing reason |
| --- | --- | --- | --- |
| [Aerodrome](https://github.com/aerodrome-finance/contracts) | PoolFactory `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`, Router `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`, AERO token `0x940181a94A35A4569E4529A3CDfB74e38FD98631`. Actual `Swap` events are emitted by pools, not these three contracts as a complete protocol-wide series. | Verified addresses; **low** TX/wallet coverage. | Production daily fields 0/0; pool set is not enumerated, and token `Transfer` events do not equal swaps or users. |
| [Uniswap on Base](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments) | V3 Factory `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`, SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`. [V3 pool `Swap` events](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol) expose `sender` and `recipient`; neither is automatically the trader. | Official contracts; **low** activity-subset confidence. | Production daily fields 0/0. The dedicated adapter queries V3 Swap events with router sender over ~43,200 blocks, deduplicates transaction hashes, and withholds wallet counts. V2/V4/other routers are excluded. |
| [Aave V3 on Base](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3Base.sol) | PoolAddressesProvider `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D`, Pool `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`. The [Pool](https://aave.com/docs/aave-v3/smart-contracts/pool) has Supply, Withdraw, Borrow, Repay, and other distinct actions; `onBehalfOf` need not equal the transaction sender. | Official Pool; **low** generic TX/wallet coverage. | Production daily fields 0/0. Provider/configuration logs and unfiltered Pool logs are not a verified action or unique-wallet series. |
| [Moonwell](https://docs.moonwell.fi/moonwell/protocol-information/contracts) | Comptroller `0xfBb21d0380beE3312B33c4353c8936a0F13EF26C`, mUSDC `0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22`, mWETH `0x628ff693426583D9a7FB391E54366292F509D457`. Market-specific Mint/Borrow/Repay/Redeem actions would require decoded event filters. | Official contracts but only two of many listed Base markets; **low** protocol-wide activity coverage. | Production daily fields 0/0. Unfiltered market logs include transfers and accruals; other Moonwell markets are absent. |
| [Zora](https://support.zora.co/en/articles/5301825) | Protocol Rewards `0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B` and [ZORA token](https://support.zora.co/en/articles/7881089) `0x1111111111166b7fe7bd91427724b487980afc69`. | Official addresses but not a complete creator/mint/swap contract set; **low** app-usage coverage. | Production daily fields 0/0. Rewards events and token transfers cannot be counted as all Zora app transactions or distinct users. |

The generic Base RPC scan now records only its block range, log count, and
distinct transaction-hash count in metric notes. It does not populate 24h/7d
TX or wallet fields, and an incomplete RPC scan does not write a false zero.
Protocol-level DefiLlama TVL, volume, and fees remain separate. Accurate daily
wallets would require a verified action-event map, transaction-sender or
beneficiary semantics per event, a complete 24h interval, and deduplication
across all participating contracts.
