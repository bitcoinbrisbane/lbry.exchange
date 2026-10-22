# lbc.exchange

A custodial 1:1 bridge between native **LBC** (LBRY Credits) and **wLBC**, an
ERC-20 on Ethereum mainnet. Deposit LBC, mint wLBC. Burn wLBC, get LBC back.

```
contracts/      Token.sol (wLBC), Bridge.sol (mint on verified deposit, burn to unwrap), Sale.sol
src/functions/  DigitalOcean Functions (TypeScript): deposit addresses, mint approvals, LBC payouts
src/ui/         React + Chakra front end: Wrap and Unwrap pages
test/           Hardhat tests
```

## Architecture

```
            ┌──────────────┐   GET wrap / status / POST wrap, unwrap   ┌──────────────────────┐
            │  Front end   │ ─────────────────────────────────────────▶ │  Functions (DO FaaS) │
            │  src/ui      │ ◀───────────────────────────────────────── │  src/functions       │
            └──────┬───────┘        JSON, no sessions, no database      └───┬──────────────┬───┘
                   │                                                        │              │
     Bridge.wrap / │ user's wallet                      Electrum-style RPC  │              │ JSON-RPC
     Bridge.unwrap │                                                        ▼              ▼
            ┌──────▼────────────────────┐                        ┌────────────────┐ ┌────────────┐
            │  Ethereum mainnet         │                        │  LBRY hubs     │ │  ETH RPC   │
            │  Token.sol  Bridge.sol    │                        │  (public)      │ │            │
            └───────────────────────────┘                        └────────────────┘ └────────────┘
```

### Components

- **Token.sol** — wLBC, an OpenZeppelin ERC-20 with 8 decimals so 1 dewey = 1
  token unit. Only the bridge can mint and burn.
- **Bridge.sol** — holds a `signer` address and a `processed[lbcTxid]` map.
  `wrap(to, amount, lbcTxid, signature)` mints once per LBC deposit if the
  signature over `wrapMessageHash` came from the signer. `unwrap(amount,
  lbcAddress)` burns the caller's wLBC and emits `Unwrap(id, from, amount,
  lbcAddress)`. Both are permissionless to call.
- **Functions** — four small HTTP endpoints. `wrap` derives deposit addresses and
  signs mint approvals, `unwrap` pays native LBC for burns, `status` reports
  progress, `config` publishes parameters. LBRY chain access uses the wallet core
  from [bitcoinbrisbane/lBC-wallet-with-mining-ability](https://github.com/bitcoinbrisbane/lBC-wallet-with-mining-ability)
  (MIT), vendored verbatim under `src/functions/src/lib/lbc`: HD keys,
  addresses, transaction building and signing, and a hub client that copes with
  both hub implementations.
- **Front end** — connects a wallet, shows the user's deposit address with a QR
  code, polls for progress and relays `Bridge.wrap` from the user's own wallet.
  State is cached in `localStorage` for convenience only.

### Stateless by design

There is no database. Both chains are the ledger.

| Fact | Where it lives | How it is recovered |
| --- | --- | --- |
| A user's deposit address | derived from the custody seed | pure function of the Ethereum address |
| Deposits and their confirmations | LBRY chain | hub history of the deposit address |
| Whether a deposit is minted | `Bridge.processed[lbcTxid]` | contract read |
| Mint approval signature | never stored | RFC 6979 makes re-signing yield the same bytes |
| Unwrap requests | `Unwrap` events | Ethereum receipt of the burn |
| Whether an unwrap is paid | LBRY chain | treasury history, OP_RETURN marker `"wLBC" ‖ burn hash ‖ id` |

If a user clears their browser mid-flow they reconnect the wallet and continue.
If the functions are redeployed nothing is lost. If the seed is restored into
any BIP44 wallet, account 1 shows the treasury.

### Keys

One BIP39 phrase (`CUSTODY_MNEMONIC`) controls the LBC side:

```
deposits   m/44'/140'/0'/2/c0/c1/c2/c3/c4/c5    c0..c5 = the user's 160-bit Ethereum address
                                                 split into six 31-bit child indexes
treasury   m/44'/140'/1'/0/0                     pays out unwraps
```

Production treasury (mainnet LBC): `bU3qvW4ecNWnnjpZffgGZKBYWaUfGwYP3n`. Payout
fees come from here, so it needs a float.

Because a deposit address is a function of the recipient, LBC sent to it can
only ever be minted to that recipient. Handing out an address needs no
authentication: anyone requesting X's address can only help X.

A separate Ethereum key (`SIGNER_PRIVATE_KEY`) must match `Bridge.signer()`.
It signs mint approvals and nothing else. The wrap function refuses to sign
when the two disagree.

### Wrap: LBC → wLBC

```
user                front end              functions                 LBRY        Ethereum
 │ connect wallet       │                      │                       │             │
 │─────────────────────▶│ GET wrap?ethAddress  │                       │             │
 │                      │─────────────────────▶│ derive address        │             │
 │   show address + QR  │◀─────────────────────│                       │             │
 │ send LBC ───────────────────────────────────────────────────────────▶│             │
 │                      │ GET status?ethAddress (poll)                 │             │
 │                      │─────────────────────▶│ history ─────────────▶│             │
 │                      │                      │ processed? ─────────────────────────▶│
 │   pending n/6        │◀─────────────────────│                       │             │
 │                      │ POST wrap {ethAddress, lbcTxid}  (when ≥ 6)  │             │
 │                      │─────────────────────▶│ verify, sign approval │             │
 │                      │◀─────────────────────│ {to, amount, lbcTxid, signature}    │
 │ confirm in wallet    │ Bridge.wrap(...) ───────────────────────────────────────────▶│ mint
 │   minted             │◀────────────────────────────────────────────────────────────│
```

The user pays the Ethereum gas. The custodian never holds an Ethereum key with
funds, only the approval signer.

### Unwrap: wLBC → LBC

```
user                front end              functions                 LBRY        Ethereum
 │ Bridge.unwrap(amount, lbcAddress) ──────────────────────────────────────────────────▶│ burn + event
 │                      │ POST unwrap {burnTxid}                       │             │
 │                      │─────────────────────▶│ receipt, events ────────────────────▶│
 │                      │                      │ wait ≥ 12 confirmations             │
 │                      │                      │ marker already paid? ▶│             │
 │                      │                      │ build, sign, broadcast▶│ payout      │
 │   paid, lbc txid     │◀─────────────────────│                       │             │
```

The payout spends from the treasury, pays the full burned amount (fees come
from the treasury), and carries the OP_RETURN marker. Repeating the request is
harmless.

### Trust model

This is fully custodial. Whoever holds the seed holds every deposit and the
treasury; whoever holds the signer key can mint. The `signer` slot on the
contract is separate from `owner` so it can move to a multisig or threshold
signer later without changing the interface. The bridge should hold only what
the operator is prepared to be liable for.

### Proving 1:1

The liability side is already public: `Token.totalSupply()`. What needs proving
is the asset side, that custodied LBC covers it, and that anyone can check it
without trusting the operator.

**Open the books.** Publish the two account extended public keys:

```
deposits xpub   m/44'/140'/0'    every deposit address is /2/c0..c5 below it
treasury xpub   m/44'/140'/1'    the treasury is /0/0 below it
```

The deposit path is non-hardened below the account, so from the deposits xpub
and the bridge's `Wrapped` events (each names the recipient) anyone derives the
full set of deposit addresses and sums their balances on any LBRY hub. Private
keys stay private; only the address set becomes computable. For a transparent
bridge that is the point.

**Commit snapshots.** On a schedule (and on demand) the functions build a Merkle
tree over the reserves at an LBC block height:

```
leaf   = keccak256(lbcAddress ‖ balanceDewies ‖ lbcHeight)        sorted by address
root   = standard binary tree, odd node duplicated
```

and post `(root, totalReserves, totalSupply, lbcHeight, ethBlock)` to a small
`Reserves` attestation contract. A `reserves` endpoint serves the leaves,
totals and a proof for any address, and the UI shows the ratio. A verifier with
the xpubs recomputes the tree from scratch; a light client checks that the
treasury or their own deposit address is in the committed set.

**What 1:1 means here.** At any moment `reserves ≥ supply` should hold:
confirmed-but-unminted deposits and burned-but-unpaid unwraps both push reserves
above supply, never below. The one thing that erodes it is payout fees, which
come from the treasury, so the operator must top up fees and the attestation
makes any shortfall visible.

## Plan

Done

- [x] Token and Bridge contracts with tests
- [x] Functions: per-user deposit addresses, mint approvals, idempotent LBC
      payouts, status and config; unit tests including a hash vector from the
      real contract
- [x] Front end shell on Node 24 with Wrap and Unwrap routes
- [x] Old order-book API, Mongo and Docker removed

Next

- [ ] `status?ethAddress=` lists a user's deposits as pending / ready / minted
- [ ] Wrap page: deposit address with QR, polling, one-click `Bridge.wrap`
- [ ] Unwrap page: burn from the wallet, then hand the burn hash to the functions
- [x] Token and Bridge deployed to Ethereum mainnet and verified on Etherscan;
      front end on App Platform
- [x] Functions deployed to DigitalOcean with a production custody seed
- [ ] End-to-end test with a small LBC deposit against the live site
- [ ] Sweep function: enumerate deposit addresses from `Wrapped` events and
      consolidate into the treasury
- [x] Proof of 1:1: `reserves` endpoint (supply vs treasury + deposit
      balances, Merkle root, published xpubs) and the Verify page, which
      recomputes the root in the browser
- [ ] `Reserves` attestation contract: post signed roots on Ethereum
- [ ] Alerting on treasury balance, unpaid unwraps and `reserves < supply`

Later

- [ ] Move `signer` to a multisig or threshold scheme
- [ ] Decide the future of `Sale.sol` (USDC-priced LBC sales), which is
      independent of the bridge

## Develop

Node 24 (`nvm use`).

```sh
yarn && npx hardhat test                      # contracts
cd src/functions && yarn && yarn test && yarn build
cd src/ui && yarn && yarn dev
```

Deploy contracts with Ignition (see Deployments below):

```sh
cp .env.example .env                          # PRIVATE_KEY, RPC URLs, explorer keys
npx hardhat ignition deploy ignition/modules/Bridge.js --network mainnet --verify
```

### Hosting

| What | Where |
| --- | --- |
| Front end | DigitalOcean App Platform, static site from `src/ui`, spec in `.do/app.yaml`, domain **lbc.exchange** (and `www`), Sydney |
| Functions | DigitalOcean Functions, namespace `lbc-exchange` (syd1), `src/functions/project.yml`. Base URL `https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-c50fc3e2-222d-4f13-ab7e-6eca05bd715d/bridge` |
| DNS | `lbc.exchange` zone in DigitalOcean DNS (registrar name servers → `ns1`, `ns2`, `ns3.digitalocean.com`). Apex `A` → App Platform ingress `162.159.140.98`, `172.66.0.96`; `www` `CNAME` → `lbc-exchange-4geaw.ondigitalocean.app` |

### Deployments

| Network | Deployer / `Bridge.signer()` | Token (wLBC) | Bridge |
| --- | --- | --- | --- |
| Ethereum mainnet (1) | [`0xdc3988Ce217c27db9d46377aF25b537cC229e658`](https://etherscan.io/address/0xdc3988Ce217c27db9d46377aF25b537cC229e658) | [`0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1`](https://etherscan.io/token/0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1) | [`0xa3A3E8304C88b017153bA5dFCCDACCB7116a185f`](https://etherscan.io/address/0xa3A3E8304C88b017153bA5dFCCDACCB7116a185f) |

Deployed 21 October 2026 with `ignition/modules/Bridge.js` and source-verified on
Etherscan; the Ignition journal is in `ignition/deployments/chain-1`. `Bridge.signer()` and both `owner()`s are the
deployer.

Rehearse and price a deployment before sending it:

```sh
DRY_RUN=1 npx hardhat run scripts/dry-run-deploy.js
npx hardhat ignition deploy ignition/modules/Bridge.js --network mainnet --verify
```

The deployer key is `PRIVATE_KEY` in the root `.env` and, with a `0x` prefix,
`SIGNER_PRIVATE_KEY` for the functions.

### Secrets

`.env` files are gitignored. To carry them between machines they are encrypted
with GPG to the Bitcoin Brisbane key and the `.env.gpg` files committed:

```sh
scripts/env-encrypt.sh        # .env -> .env.gpg (also src/functions and src/ui when present)
scripts/env-decrypt.sh        # .env.gpg -> .env on a new machine
```

`scripts/env-encrypt.sh --symmetric` uses a passphrase instead of the key.

Function configuration, endpoints and deployment are in
[src/functions/README.md](src/functions/README.md).
