// Deploys the LBRY Bridge stack: the wLBC token, the bridge, and wires the
// bridge as the token's sole mint/burn authority.
//
//   npx hardhat ignition deploy ignition/modules/Bridge.js --network <net>
//
// Learn more at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BridgeModule", (m) => {
  const token = m.contract("Token");
  const bridge = m.contract("Bridge", [token]);

  // Grant the bridge mint/burn rights on the token. Ordered after `bridge`
  // via the argument dependency so Ignition sequences it last.
  m.call(token, "setBridge", [bridge]);

  return { token, bridge };
});
