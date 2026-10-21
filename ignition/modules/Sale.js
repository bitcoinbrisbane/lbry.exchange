// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

// Base network USDC contract address
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Initial LBRY price in USDC (6 decimals)
// Example: 0.01 USDC per LBRY = 10000 (0.01 * 1e6)
const INITIAL_LBRY_PRICE_USDC = 10000; // 0.01 USDC per LBRY

module.exports = buildModule("SaleModule", (m) => {
  // Get parameters from deployment or use defaults
  const usdcAddress = m.getParameter("usdcAddress", BASE_USDC_ADDRESS);
  const initialPrice = m.getParameter("initialPrice", INITIAL_LBRY_PRICE_USDC);
  const owner = m.getParameter("owner", m.getAccount(0)); // Use deployer as default owner

  // Deploy the Sale contract
  const sale = m.contract("Sale", [usdcAddress, initialPrice, owner]);

  return { sale };
});
