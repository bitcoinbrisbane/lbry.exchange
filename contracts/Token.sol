// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Wrapped lbry
contract Token is ERC20 {
    constructor() ERC20("Wrapped LBRY", "wLBC") {

    }
}