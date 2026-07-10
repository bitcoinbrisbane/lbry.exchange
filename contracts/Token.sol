// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Wrapped LBRY (wLBC)
/// @notice ERC-20 representation of native LBC bridged from the LBRY chain.
///         Minting and burning are restricted to the bridge contract, which
///         enforces a strict 1:1 backing with custodied native LBC.
/// @dev Native LBC uses 8 decimals; wLBC mirrors that so amounts map 1:1
///      without scaling. The bridge is set once by the owner after deployment
///      (the bridge needs the token address in its own constructor, so the two
///      cannot reference each other at construction time).
contract Token is ERC20, Ownable {
    /// @notice The only address permitted to mint and burn wLBC.
    address public bridge;

    event BridgeUpdated(address indexed previousBridge, address indexed newBridge);

    error NotBridge();
    error ZeroAddress();

    modifier onlyBridge() {
        if (msg.sender != bridge) revert NotBridge();
        _;
    }

    constructor() ERC20("Wrapped LBRY", "wLBC") Ownable(msg.sender) {}

    /// @notice Native LBC has 8 decimals; keep wLBC in lockstep for a clean 1:1.
    function decimals() public pure override returns (uint8) {
        return 8;
    }

    /// @notice Set (or rotate) the bridge that controls mint/burn.
    /// @dev Owner-only. Intended to be called once immediately after the
    ///      bridge is deployed. Can be re-pointed for an upgrade/migration.
    function setBridge(address newBridge) external onlyOwner {
        if (newBridge == address(0)) revert ZeroAddress();
        emit BridgeUpdated(bridge, newBridge);
        bridge = newBridge;
    }

    /// @notice Mint wLBC to `to`. Bridge-only; called after a verified LBC deposit.
    function mint(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }

    /// @notice Burn `amount` of wLBC held by `from`. Bridge-only; called during
    ///         unwrap so the bridge is the single source of supply changes.
    function burn(address from, uint256 amount) external onlyBridge {
        _burn(from, amount);
    }
}
