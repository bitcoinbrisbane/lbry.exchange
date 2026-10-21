# lbry.exchange

A custodial 1:1 bridge between native LBC (LBRY Credits) and **wLBC**, an
ERC-20 on Ethereum / Base.

```
contracts/      Token.sol (wLBC), Bridge.sol (mint on verified deposit, burn to unwrap)
src/functions/  DigitalOcean Functions (TypeScript): deposit addresses, mint approvals, payouts
src/ui/         React + Chakra front end: Wrap and Unwrap
test/           Hardhat tests
```

There is no database. Deposit addresses derive from a seed per Ethereum
address, mint state lives in the contract, and payouts are tagged on the LBRY
chain. See [src/functions/README.md](src/functions/README.md) for the design
and endpoints.

## Develop

Node 24 (`nvm use`).

```sh
yarn                      # hardhat + contracts
npx hardhat test

cd src/functions && yarn && yarn test && yarn build
cd src/ui && yarn && yarn dev
```

Deploy contracts with Ignition, for example on Base Sepolia:

```sh
cp .env.example .env      # PRIVATE_KEY, RPC URLs, explorer keys
npx hardhat ignition deploy ignition/modules/Bridge.js --network base-sepolia
```
