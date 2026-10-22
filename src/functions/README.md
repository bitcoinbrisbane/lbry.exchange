# LBRY Bridge functions

DigitalOcean Functions (TypeScript) that run the custodial side of the
LBC ↔ wLBC bridge defined in `contracts/Bridge.sol`.

```
wrap    LBC  → wLBC   give the user a deposit address; approve the mint once LBC arrives
unwrap  wLBC → LBC    read the burn on Ethereum; pay native LBC from the treasury
status                progress of either flow
config                public parameters for the UI
```

## How it works

**No database.** Both chains are the ledger.

- Every deposit gets its own LBC deposit address, derived from one BIP39 seed:
  `m/44'/140'/0'/2/c0/…/c5/n`, where `c0..c5` are the 160 bits of the Ethereum
  address split into 31-bit child indexes (`src/lib/custody.ts`). The address
  handed out is the first `n` with no history, and a user's deposits are found
  by walking `n` up to the first unused one (`src/lib/deposits.ts`). LBC sent to
  any of them can only ever be minted to that Ethereum address. The old
  one-per-user address (`…/c5`, no `n`) is still scanned but never handed out.
- A mint approval is an EIP-191 signature over `Bridge.wrapMessageHash`. The
  user relays it to `Bridge.wrap`; the contract's `processed[lbcTxid]` map makes
  each deposit mintable once.
- Unwrap payouts spend from a treasury at `m/44'/140'/1'/0/0` and carry an
  `OP_RETURN "wLBC" || burnTxHash || unwrapId` output. Before paying, the
  treasury's history is scanned for that marker, so repeating a request never
  pays twice (`src/lib/marker.ts`).
- Deposit addresses can be enumerated from the bridge's `Wrapped` events and
  swept into the treasury with `Custody.depositPrivateKey`; a sweep function is
  not written yet.

LBRY chain access goes through the public hubs with the wallet code vendored in
`src/lib/lbc` from
[bitcoinbrisbane/lBC-wallet-with-mining-ability](https://github.com/bitcoinbrisbane/lBC-wallet-with-mining-ability)
(MIT, `packages/core/src` at commit `93e19c1`). Those files are kept verbatim
so they can be refreshed; bridge code lives outside that directory.

## Endpoints

With DO's default prefix `/api/v1/web/bridge/`:

| Call | Purpose | Reply |
| --- | --- | --- |
| `GET wrap?ethAddress=0x…` | Deposit address for an Ethereum address | `{ depositAddress, path, minConfirmations, … }` |
| `POST wrap { ethAddress, lbcTxid }` | Approve a confirmed deposit | `200 { status: "approved", wrapArgs: { to, amount, lbcTxid, signature } }`, `202` pending, `409` already minted |
| `POST unwrap { burnTxid }` | Pay out a `Bridge.unwrap` burn | `200 { payouts: [{ id, lbcAddress, amount, status, lbcTxid }] }`, `202` pending, `503` treasury short |
| `GET status?ethAddress=` | All deposits for a user (what the Wrap page polls) | `deposits: [{ lbcTxid, amount, confirmations, status: pending / ready / minted }]` |
| `GET status?ethAddress=&lbcTxid=` | One deposit in detail | `status: not_found / no_payment / pending / confirmed / minted` |
| `GET status?burnTxid=` | Unwrap progress | `status: not_found / reverted / pending / ready / paid` |
| `GET config` | Chain ids, addresses, thresholds, treasury | |
| `GET reserves` | Proof of reserves | `{ supply, reserves, backingBps, fullyBacked, merkle: { root, leaves }, xpubs }` |

Amounts are decimal strings in dewies (1e-8 LBC), which is also the wLBC unit.

## Configuration

See `.env.example`. `CUSTODY_MNEMONIC` controls all customer deposits and the
treasury; `SIGNER_PRIVATE_KEY` must match `Bridge.signer()`. The wrap function
refuses to sign when it does not.

## Develop

```sh
nvm use                 # Node 24, matching the nodejs:24 runtime
npm install
npm test                # vitest unit tests
npm run typecheck
npm run build           # esbuild → packages/bridge/<fn>/index.js (gitignored)
npm run dev             # build, then serve them at http://localhost:8787/api/v1/web/bridge/<fn>
```

For the UI, point `VITE_BRIDGE_API_URL` at `http://localhost:8787/api/v1/web/bridge`.

Deploy with the doctl serverless plugin once the environment is exported:

```sh
set -a; source .env; set +a
npm run deploy          # = npm run build && doctl serverless deploy .
```

## Known limits

- Two simultaneous `unwrap` calls for the same burn both pass the marker check.
  They select the same treasury coins, so the second broadcast is rejected as a
  double spend, but this relies on the hub's mempool view.
- Payout fees come from the treasury; the user receives the full burned amount.
- No sweep of deposit addresses into the treasury yet.
