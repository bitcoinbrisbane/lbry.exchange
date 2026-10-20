// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

/**
 * @title IERC20 Interface
 * @dev Interface for ERC20 token interactions
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title Sale
 * @dev Contract for handling LBRY credit sales with USDC payment
 */
contract Sale {
    // USDC token contract
    IERC20 public immutable usdc;
    
    // Contract owner
    address public owner;
    
    // Price of LBRY credits in USDC (with 6 decimals for USDC)
    uint256 public lbryPriceInUsdc;
    
    // Reentrancy guard
    bool private locked;
    
    // Mapping of order ID to purchase details
    mapping(bytes32 => PurchaseOrder) public orders;
    
    // Mapping of user address to their LBRY address
    mapping(address => string) public userLbryAddresses;
    
    // Array to track all order IDs
    bytes32[] public allOrderIds;
    
    struct PurchaseOrder {
        address buyer;
        uint256 usdcAmount;
        uint256 lbryAmount;
        string lbryAddress;
        bool fulfilled;
        string lbryTxHash;
        uint256 timestamp;
    }
    
    // Events
    event Purchase(
        bytes32 indexed orderId,
        address indexed buyer,
        uint256 usdcAmount,
        uint256 lbryAmount,
        string lbryAddress,
        uint256 timestamp
    );
    
    event OrderFulfilled(
        bytes32 indexed orderId,
        string lbryTxHash,
        uint256 timestamp
    );
    
    event PriceUpdated(
        uint256 oldPrice,
        uint256 newPrice,
        uint256 timestamp
    );
    
    event LbryAddressUpdated(
        address indexed user,
        string oldAddress,
        string newAddress
    );
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }
    
    constructor(
        address _usdcToken,
        uint256 _initialPriceInUsdc,
        address _owner
    ) {
        require(_usdcToken != address(0), "Invalid USDC token address");
        require(_initialPriceInUsdc > 0, "Price must be greater than 0");
        require(_owner != address(0), "Invalid owner address");
        
        usdc = IERC20(_usdcToken);
        lbryPriceInUsdc = _initialPriceInUsdc;
        owner = _owner;
    }
    
    /**
     * @dev Buy LBRY credits with USDC
     * @param _usdcAmount Amount of USDC to spend (with 6 decimals)
     * @param _lbryAddress LBRY address where credits will be sent
     */
    function buy(uint256 _usdcAmount, string calldata _lbryAddress) 
        external 
        nonReentrant 
        returns (bytes32 orderId) 
    {
        require(_usdcAmount > 0, "Amount must be greater than 0");
        require(bytes(_lbryAddress).length > 0, "LBRY address cannot be empty");
        require(lbryPriceInUsdc > 0, "Price not set");
        
        // Calculate LBRY amount (assuming LBRY has 8 decimals)
        uint256 lbryAmount = (_usdcAmount * 1e8) / lbryPriceInUsdc;
        require(lbryAmount > 0, "Calculated LBRY amount is 0");
        
        // Generate unique order ID
        orderId = keccak256(abi.encodePacked(
            msg.sender,
            _usdcAmount,
            _lbryAddress,
            block.timestamp,
            block.difficulty
        ));
        
        // Ensure order ID is unique
        require(orders[orderId].buyer == address(0), "Order ID collision");
        
        // Transfer USDC from buyer to contract
        require(
            usdc.transferFrom(msg.sender, address(this), _usdcAmount),
            "USDC transfer failed"
        );
        
        // Store order details
        orders[orderId] = PurchaseOrder({
            buyer: msg.sender,
            usdcAmount: _usdcAmount,
            lbryAmount: lbryAmount,
            lbryAddress: _lbryAddress,
            fulfilled: false,
            lbryTxHash: "",
            timestamp: block.timestamp
        });
        
        // Store/update user's LBRY address
        string memory oldAddress = userLbryAddresses[msg.sender];
        userLbryAddresses[msg.sender] = _lbryAddress;
        
        // Track order ID
        allOrderIds.push(orderId);
        
        emit Purchase(
            orderId,
            msg.sender,
            _usdcAmount,
            lbryAmount,
            _lbryAddress,
            block.timestamp
        );
        
        if (bytes(oldAddress).length > 0 && 
            keccak256(bytes(oldAddress)) != keccak256(bytes(_lbryAddress))) {
            emit LbryAddressUpdated(msg.sender, oldAddress, _lbryAddress);
        }
        
        return orderId;
    }
    
    /**
     * @dev Mark an order as fulfilled with LBRY transaction hash
     * @param _orderId The order ID to fulfill
     * @param _lbryTxHash The LBRY transaction hash
     */
    function fulfillOrder(bytes32 _orderId, string calldata _lbryTxHash) 
        external 
        onlyOwner 
    {
        require(orders[_orderId].buyer != address(0), "Order does not exist");
        require(!orders[_orderId].fulfilled, "Order already fulfilled");
        require(bytes(_lbryTxHash).length > 0, "Transaction hash cannot be empty");
        
        orders[_orderId].fulfilled = true;
        orders[_orderId].lbryTxHash = _lbryTxHash;
        
        emit OrderFulfilled(_orderId, _lbryTxHash, block.timestamp);
    }
    
    /**
     * @dev Update the price of LBRY credits in USDC
     * @param _newPriceInUsdc New price in USDC (with 6 decimals)
     */
    function updatePrice(uint256 _newPriceInUsdc) external onlyOwner {
        require(_newPriceInUsdc > 0, "Price must be greater than 0");
        
        uint256 oldPrice = lbryPriceInUsdc;
        lbryPriceInUsdc = _newPriceInUsdc;
        
        emit PriceUpdated(oldPrice, _newPriceInUsdc, block.timestamp);
    }
    
    /**
     * @dev Withdraw USDC from the contract
     * @param _to Address to send USDC to
     * @param _amount Amount of USDC to withdraw
     */
    function withdrawUsdc(address _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "Invalid recipient address");
        require(_amount > 0, "Amount must be greater than 0");
        require(usdc.balanceOf(address(this)) >= _amount, "Insufficient balance");
        
        require(usdc.transfer(_to, _amount), "USDC transfer failed");
    }
    
    /**
     * @dev Emergency withdrawal of all USDC
     * @param _to Address to send USDC to
     */
    function emergencyWithdrawAll(address _to) external onlyOwner {
        require(_to != address(0), "Invalid recipient address");
        
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            require(usdc.transfer(_to, balance), "USDC transfer failed");
        }
    }
    
    // View functions
    
    /**
     * @dev Get order details by order ID
     */
    function getOrder(bytes32 _orderId) external view returns (PurchaseOrder memory) {
        return orders[_orderId];
    }
    
    /**
     * @dev Get all order IDs
     */
    function getAllOrderIds() external view returns (bytes32[] memory) {
        return allOrderIds;
    }
    
    /**
     * @dev Get orders by buyer address
     */
    function getOrdersByBuyer(address _buyer) external view returns (bytes32[] memory) {
        uint256 count = 0;
        
        // First pass: count orders for this buyer
        for (uint256 i = 0; i < allOrderIds.length; i++) {
            if (orders[allOrderIds[i]].buyer == _buyer) {
                count++;
            }
        }
        
        // Second pass: populate array
        bytes32[] memory buyerOrders = new bytes32[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allOrderIds.length; i++) {
            if (orders[allOrderIds[i]].buyer == _buyer) {
                buyerOrders[index] = allOrderIds[i];
                index++;
            }
        }
        
        return buyerOrders;
    }
    
    /**
     * @dev Get unfulfilled orders
     */
    function getUnfulfilledOrders() external view returns (bytes32[] memory) {
        uint256 count = 0;
        
        // First pass: count unfulfilled orders
        for (uint256 i = 0; i < allOrderIds.length; i++) {
            if (!orders[allOrderIds[i]].fulfilled) {
                count++;
            }
        }
        
        // Second pass: populate array
        bytes32[] memory unfulfilledOrders = new bytes32[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allOrderIds.length; i++) {
            if (!orders[allOrderIds[i]].fulfilled) {
                unfulfilledOrders[index] = allOrderIds[i];
                index++;
            }
        }
        
        return unfulfilledOrders;
    }
    
    /**
     * @dev Calculate LBRY amount for given USDC amount
     */
    function calculateLbryAmount(uint256 _usdcAmount) external view returns (uint256) {
        require(lbryPriceInUsdc > 0, "Price not set");
        return (_usdcAmount * 1e8) / lbryPriceInUsdc;
    }
    
    /**
     * @dev Get contract USDC balance
     */
    function getUsdcBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
    
    /**
     * @dev Get total number of orders
     */
    function getTotalOrders() external view returns (uint256) {
        return allOrderIds.length;
    }
}
