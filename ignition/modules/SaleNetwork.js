// This script provides network-specific deployment configurations for the Sale contract

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

// Network-specific USDC addresses
const NETWORK_CONFIG = {
  base: {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    name: "Base Mainnet",
  },
  "base-sepolia": {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    name: "Base Sepolia Testnet",
  },
  hardhat: {
    usdc: "0x0000000000000000000000000000000000000000", // Mock address for testing
    name: "Hardhat Local Network",
  },
};

// Initial LBRY price in USDC (6 decimals)
// Example: 0.01 USDC per LBRY = 10000 (0.01 * 1e6)
const INITIAL_LBRY_PRICE_USDC = 10000; // 0.01 USDC per LBRY

module.exports = buildModule("SaleNetworkModule", (m) => {
  // Get network name from environment or default to hardhat
  const networkName = m.getParameter("network", "hardhat");
  const config = NETWORK_CONFIG[networkName] || NETWORK_CONFIG.hardhat;

  // Parameters
  const usdcAddress = m.getParameter("usdcAddress", config.usdc);
  const initialPrice = m.getParameter("initialPrice", INITIAL_LBRY_PRICE_USDC);
  const owner = m.getParameter("owner", m.getAccount(0));

  console.log(`Deploying Sale contract to ${config.name}`);
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`Initial LBRY Price: ${initialPrice / 1e6} USDC`);
  console.log(`Owner: ${owner}`);

  // Deploy the Sale contract
  const sale = m.contract("Sale", [usdcAddress, initialPrice, owner]);

  return { sale };
});
