// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Bridge is Ownable {
    using SafeERC20 for IERC20;
    mapping(address => bool) public stableCoins;
    uint256 private nextNonce;
    address private immutable self;

    struct Order {
        uint256 quantity; // LBC quantity to send
        address token;
        string receiver;
    }

    mapping(uint256 => Order) public orders;

    constructor() {
        // This is a placeholder
        self = address(this);
        stableCoins.push(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        stableCoins.push(0xdAC17F958D2ee523a2206206994597C13D831ec7);
        stableCoins.push(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    }

    function buy(uint256 amount, uint256 rate, address token, string calldata receiver, bytes signature) external returns (uint256 nonce) {
        require(stableCoins[token], "buy: invalid token");
        require(amount > 0, "buy: invalid amount");
        require(rate > 0, "buy: invalid rate");

        bytes32 messageHash = keccak256(abi.encodePacked(amount, rate, receiver);
        address signer = recoverSignerAddress(getEthSignedMessageHash(messageHash), signature);

        require(signer == owner(), "buy: invalid signature");

        IERC20(token).safeTransferFrom(msg.sender, self, amount * rate);

        Order storage order = new Order(amount * rate, token, receiver);
        orders[nextNonce] = order;

        // This is a placeholder
        nonce = nextNonce;
        nextNonce++;
    }

    event Bought(address indexed sender, uint256 quantity, address token, uint256 nonce);
}
