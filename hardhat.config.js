require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, MAINNET_RPC_URL, BASE_RPC_URL, ETHERSCAN_API_KEY, BASESCAN_API_KEY } =
  process.env;

// Only attach an account when a key is present, so tasks that don't need to
// sign (compile, test) work without a configured key.
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL || "",
      accounts,
    },
    base: {
      url: BASE_RPC_URL || "https://mainnet.base.org",
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY || "",
      base: BASESCAN_API_KEY || "",
    },
  },
};
