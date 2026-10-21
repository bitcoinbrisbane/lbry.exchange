// Rehearses the Bridge deployment as the configured deployer on the in-process
// Hardhat chain, then prices it against the live target network.
//
//   DRY_RUN=1 npx hardhat run scripts/dry-run-deploy.js
//   TARGET_RPC_URL (default: Ethereum mainnet via publicnode) picks the chain to price against.
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const steps = [];
  const record = async (label, txPromise) => {
    const tx = await txPromise;
    const receipt = await (tx.deploymentTransaction ? tx.deploymentTransaction().wait() : tx.wait());
    steps.push({ label, gasUsed: receipt.gasUsed });
    return tx;
  };

  const token = await record("deploy Token", ethers.getContractFactory("Token").then((f) => f.deploy()));
  const bridge = await record("deploy Bridge", ethers.getContractFactory("Bridge").then((f) => f.deploy(token.target)));
  await record("token.setBridge", token.setBridge(bridge.target));

  const checks = {
    "token.bridge() == bridge": (await token.bridge()) === bridge.target,
    "token.owner() == deployer": (await token.owner()) === deployer.address,
    "bridge.owner() == deployer": (await bridge.owner()) === deployer.address,
    "bridge.signer() == deployer": (await bridge.signer()) === deployer.address,
    "bridge.token() == token": (await bridge.token()) === token.target,
    "token.decimals() == 8": Number(await token.decimals()) === 8,
  };

  const totalGas = steps.reduce((s, x) => s + x.gasUsed, 0n);
  const targetUrl = process.env.TARGET_RPC_URL || process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com";
  const target = new ethers.JsonRpcProvider(targetUrl);
  const [net, fee, balance] = await Promise.all([target.getNetwork(), target.getFeeData(), target.getBalance(deployer.address)]);
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  const cost = totalGas * gasPrice;

  console.log(`deployer            ${deployer.address}`);
  for (const s of steps) console.log(`${s.label.padEnd(20)}${s.gasUsed.toString().padStart(10)} gas`);
  console.log(`${"total".padEnd(20)}${totalGas.toString().padStart(10)} gas`);
  console.log(`\ntarget              ${net.name} (chain ${net.chainId}) via ${targetUrl}`);
  console.log(`max fee per gas     ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`estimated cost      ${ethers.formatEther(cost)} ETH (upper bound at max fee)`);
  console.log(`deployer balance    ${ethers.formatEther(balance)} ETH`);
  console.log(`\nwiring checks`);
  let ok = true;
  for (const [label, pass] of Object.entries(checks)) {
    ok &&= pass;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${label}`);
  }
  console.log(`\nverdict             ${!ok ? "wiring checks failed" : balance >= cost * 2n ? "ready to deploy" : balance >= cost ? "deployable, but little headroom" : "fund the deployer first"}`);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
