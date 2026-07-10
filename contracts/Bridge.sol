// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Token} from "./Token.sol";

/// @title LBRY Bridge
/// @notice Custodial 1:1 bridge between native LBC (LBRY chain) and wLBC (this chain).
///
///         Wrap  (LBC -> wLBC): a user deposits native LBC to the custodial LBRY
///         address off-chain. A trusted signer (the owner) verifies the deposit
///         and produces a signature; anyone can relay it here to mint wLBC 1:1.
///         `processed[lbcTxid]` makes each LBC deposit redeemable exactly once,
///         so the mint is idempotent and replay-safe on-chain — no database.
///
///         Unwrap (wLBC -> LBC): a user burns wLBC here and names the LBRY
///         address to receive native LBC. The burn is recorded on-chain via the
///         `Unwrap` event; an off-chain worker reads it (by the emitting tx) and
///         broadcasts the native LBC payout.
///
/// @dev Trust model (MVP): a single owner key is the mint authority and the
///      off-chain custodian. This is fully custodial and trusted. The authority
///      is a distinct `signer` slot (not raw `owner()`) so it can later move to a
///      multisig/threshold signer without changing this interface.
contract Bridge is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice The wLBC token this bridge mints and burns.
    Token public immutable token;

    /// @notice Key authorised to sign wrap approvals. Starts as the deployer.
    address public signer;

    /// @notice LBC deposit txids that have already been minted. The on-chain ledger.
    mapping(bytes32 => bool) public processed;

    /// @notice Monotonic id for unwrap requests, so each burn is uniquely referable.
    uint256 public unwrapCount;

    event SignerUpdated(address indexed previousSigner, address indexed newSigner);

    /// @param to        recipient of the minted wLBC
    /// @param amount    wLBC minted (1:1 with deposited LBC, 8 decimals)
    /// @param lbcTxid   the native LBC deposit transaction id that funded this mint
    event Wrapped(address indexed to, uint256 amount, bytes32 indexed lbcTxid);

    /// @param id           sequential unwrap id
    /// @param from         address that burned wLBC
    /// @param amount       wLBC burned (native LBC to be paid out 1:1)
    /// @param lbcAddress   destination LBRY address for the native LBC payout
    event Unwrap(uint256 indexed id, address indexed from, uint256 amount, string lbcAddress);

    error AlreadyProcessed(bytes32 lbcTxid);
    error InvalidSignature();
    error ZeroAmount();
    error ZeroAddress();
    error EmptyLbcAddress();

    constructor(address _token) Ownable(msg.sender) {
        if (_token == address(0)) revert ZeroAddress();
        token = Token(_token);
        signer = msg.sender;
    }

    /// @notice Rotate the wrap-approval signer (mint authority).
    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerUpdated(signer, newSigner);
        signer = newSigner;
    }

    /// @notice The exact message a `signer` must sign to authorise a wrap.
    /// @dev Binds the mint to this specific chain and this specific bridge so a
    ///      signature can't be replayed on another deployment. Exposed for the
    ///      off-chain signer/relayer to reproduce.
    function wrapMessageHash(
        address to,
        uint256 amount,
        bytes32 lbcTxid
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(block.chainid, address(this), to, amount, lbcTxid)
        );
    }

    /// @notice Mint wLBC 1:1 against a verified native-LBC deposit.
    /// @dev Permissionless to call — security comes from the signature and the
    ///      `processed` guard, so anyone (typically the user or a relayer) can
    ///      submit a valid approval. Reverts if `lbcTxid` was already redeemed.
    /// @param to         recipient of the wLBC
    /// @param amount     amount to mint (must equal the deposited LBC, 8 decimals)
    /// @param lbcTxid    the native LBC deposit txid backing this mint
    /// @param signature  `signer`'s signature over `wrapMessageHash(...)`
    function wrap(
        address to,
        uint256 amount,
        bytes32 lbcTxid,
        bytes calldata signature
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (processed[lbcTxid]) revert AlreadyProcessed(lbcTxid);

        bytes32 digest = wrapMessageHash(to, amount, lbcTxid).toEthSignedMessageHash();
        if (digest.recover(signature) != signer) revert InvalidSignature();

        processed[lbcTxid] = true;
        token.mint(to, amount);

        emit Wrapped(to, amount, lbcTxid);
    }

    /// @notice Burn wLBC to redeem native LBC on the LBRY chain.
    /// @dev Records the request on-chain via `Unwrap`; the off-chain custodian
    ///      watches for it (looked up by this tx's hash) and pays out native LBC.
    ///      No signature needed — burning the caller's own balance is the auth.
    /// @param amount      amount of wLBC to burn (native LBC paid out 1:1)
    /// @param lbcAddress  destination LBRY address for the payout
    function unwrap(uint256 amount, string calldata lbcAddress) external {
        if (amount == 0) revert ZeroAmount();
        if (bytes(lbcAddress).length == 0) revert EmptyLbcAddress();

        token.burn(msg.sender, amount);

        uint256 id = unwrapCount++;
        emit Unwrap(id, msg.sender, amount, lbcAddress);
    }
}
