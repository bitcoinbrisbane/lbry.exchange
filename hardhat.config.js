require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, MAINNET_RPC_URL, BASE_RPC_URL, BASE_SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, BASESCAN_API_KEY } =
  process.env;

// Only attach an account when a key is present, so tasks that don't need to
// sign (compile, test) work without a configured key.
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // DRY_RUN=1 puts the real deployer key on the in-process chain with a
      // funded balance, so a deployment can be rehearsed as that account.
      ...(process.env.DRY_RUN && PRIVATE_KEY
        ? {
            accounts: [
              {
                privateKey: PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`,
                balance: "1000000000000000000",
              },
            ],
          }
        : {}),
    },
    mainnet: {
      url: MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
      chainId: 1,
      accounts,
    },
    base: {
      url: BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
    "base-sepolia": {
      url: BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY || "",
      base: BASESCAN_API_KEY || "",
      "base-sepolia": BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};
