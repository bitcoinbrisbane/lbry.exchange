const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Sale Contract", function () {
    // Send a buy transaction and return the order ID from the Purchase event.
    // The order ID hashes block.timestamp and block.difficulty, so it cannot be
    // predicted with a staticCall ahead of the real transaction.
    async function buyAndGetOrderId(sale, signer, usdcAmount, lbryAddress) {
        const tx = await sale.connect(signer).buy(usdcAmount, lbryAddress);
        const receipt = await tx.wait();
        const purchase = receipt.logs
            .map((log) => {
                try {
                    return sale.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find((parsed) => parsed && parsed.name === "Purchase");
        return purchase.args.orderId;
    }

    // Return the timestamp of the block a transaction was mined in.
    async function txTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }

    // Deployment fixture
    async function deploySaleFixture() {
        // Get signers
        const [owner, buyer1, buyer2, nonOwner] = await ethers.getSigners();

        // Deploy a mock USDC token for testing
        const MockUSDC = await ethers.getContractFactory("MockERC20");
        const usdc = await MockUSDC.deploy("USD Coin", "USDC", 6); // 6 decimals like real USDC

        // Initial LBRY price: 0.01 USDC = 10000 (0.01 * 1e6)
        const initialPrice = 10000;

        // Deploy Sale contract
        const Sale = await ethers.getContractFactory("Sale");
        const sale = await Sale.deploy(usdc.target, initialPrice, owner.address);

        // Mint some USDC to buyers for testing
        const usdcAmount = ethers.parseUnits("1000", 6); // 1000 USDC
        await usdc.mint(buyer1.address, usdcAmount);
        await usdc.mint(buyer2.address, usdcAmount);

        return { sale, usdc, owner, buyer1, buyer2, nonOwner, initialPrice };
    }

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            const { sale, owner } = await loadFixture(deploySaleFixture);
            expect(await sale.owner()).to.equal(owner.address);
        });

        it("Should set the right USDC token address", async function () {
            const { sale, usdc } = await loadFixture(deploySaleFixture);
            expect(await sale.usdc()).to.equal(usdc.target);
        });

        it("Should set the initial LBRY price", async function () {
            const { sale, initialPrice } = await loadFixture(deploySaleFixture);
            expect(await sale.lbryPriceInUsdc()).to.equal(initialPrice);
        });

        it("Should revert with invalid USDC address", async function () {
            const [owner] = await ethers.getSigners();
            const Sale = await ethers.getContractFactory("Sale");

            await expect(
                Sale.deploy(ethers.ZeroAddress, 10000, owner.address)
            ).to.be.revertedWith("Invalid USDC token address");
        });

        it("Should revert with zero price", async function () {
            const [owner] = await ethers.getSigners();
            const MockUSDC = await ethers.getContractFactory("MockERC20");
            const usdc = await MockUSDC.deploy("USD Coin", "USDC", 6);
            const Sale = await ethers.getContractFactory("Sale");

            await expect(
                Sale.deploy(usdc.target, 0, owner.address)
            ).to.be.revertedWith("Price must be greater than 0");
        });
    });

    describe("Buy Function", function () {
        it("Should allow buying LBRY credits with USDC", async function () {
            const { sale, usdc, buyer1 } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("10", 6); // 10 USDC
            const lbryAddress = "bLockchainAddress123";

            // Approve USDC transfer
            await usdc.connect(buyer1).approve(sale.target, usdcAmount);

            // Buy LBRY credits
            const tx = await sale.connect(buyer1).buy(usdcAmount, lbryAddress);

            // Check event emission
            await expect(tx).to.emit(sale, "Purchase");

            // Check USDC was transferred
            expect(await usdc.balanceOf(sale.target)).to.equal(usdcAmount);

            // Check LBRY address was stored
            expect(await sale.userLbryAddresses(buyer1.address)).to.equal(lbryAddress);
        });

        it("Should calculate correct LBRY amount", async function () {
            const { sale, usdc, buyer1, initialPrice } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("10", 6); // 10 USDC
            const lbryAddress = "bLockchainAddress123";

            // Expected LBRY amount: (10 * 1e6 * 1e8) / 10000 = 1e11 (1000 LBRY)
            const expectedLbryAmount = (usdcAmount * BigInt(1e8)) / BigInt(initialPrice);

            await usdc.connect(buyer1).approve(sale.target, usdcAmount);

            const orderId = await buyAndGetOrderId(sale, buyer1, usdcAmount, lbryAddress);

            const order = await sale.getOrder(orderId);
            expect(order.lbryAmount).to.equal(expectedLbryAmount);
        });

        it("Should generate unique order IDs", async function () {
            const { sale, usdc, buyer1, buyer2 } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("10", 6);
            const lbryAddress = "bLockchainAddress123";

            await usdc.connect(buyer1).approve(sale.target, usdcAmount);
            await usdc.connect(buyer2).approve(sale.target, usdcAmount);

            const orderId1 = await buyAndGetOrderId(sale, buyer1, usdcAmount, lbryAddress);

            const orderId2 = await buyAndGetOrderId(sale, buyer2, usdcAmount, lbryAddress);

            expect(orderId1).to.not.equal(orderId2);
        });

        it("Should revert with zero amount", async function () {
            const { sale, buyer1 } = await loadFixture(deploySaleFixture);

            await expect(
                sale.connect(buyer1).buy(0, "bLockchainAddress123")
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should revert with empty LBRY address", async function () {
            const { sale, buyer1 } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("10", 6);

            await expect(
                sale.connect(buyer1).buy(usdcAmount, "")
            ).to.be.revertedWith("LBRY address cannot be empty");
        });

        it("Should revert without sufficient USDC allowance", async function () {
            const { sale, buyer1 } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("10", 6);
            const lbryAddress = "bLockchainAddress123";

            // Don't approve USDC transfer. The token reverts inside transferFrom
            // before Sale's own "USDC transfer failed" check is reached.
            await expect(
                sale.connect(buyer1).buy(usdcAmount, lbryAddress)
            ).to.be.revertedWith("Insufficient allowance");
        });
    });

    describe("Order Fulfillment", function () {
        async function buyOrderFixture() {
            const fixture = await loadFixture(deploySaleFixture);
            const { sale, usdc, buyer1 } = fixture;

            const usdcAmount = ethers.parseUnits("10", 6);
            const lbryAddress = "bLockchainAddress123";

            await usdc.connect(buyer1).approve(sale.target, usdcAmount);
            const orderId = await buyAndGetOrderId(sale, buyer1, usdcAmount, lbryAddress);

            return { ...fixture, orderId, usdcAmount, lbryAddress };
        }

        it("Should allow owner to fulfill orders", async function () {
            const { sale, owner, orderId } = await loadFixture(buyOrderFixture);

            const lbryTxHash = "lbry_tx_hash_123";

            const tx = await sale.connect(owner).fulfillOrder(orderId, lbryTxHash);

            await expect(tx).to.emit(sale, "OrderFulfilled").withArgs(orderId, lbryTxHash, await txTimestamp(tx));

            const order = await sale.getOrder(orderId);
            expect(order.fulfilled).to.be.true;
            expect(order.lbryTxHash).to.equal(lbryTxHash);
        });

        it("Should revert when non-owner tries to fulfill order", async function () {
            const { sale, nonOwner, orderId } = await loadFixture(buyOrderFixture);

            await expect(
                sale.connect(nonOwner).fulfillOrder(orderId, "lbry_tx_hash_123")
            ).to.be.revertedWith("Only owner can call this function");
        });

        it("Should revert when fulfilling non-existent order", async function () {
            const { sale, owner } = await loadFixture(deploySaleFixture);

            const fakeOrderId = ethers.id("fake_order");

            await expect(
                sale.connect(owner).fulfillOrder(fakeOrderId, "lbry_tx_hash_123")
            ).to.be.revertedWith("Order does not exist");
        });

        it("Should revert when fulfilling already fulfilled order", async function () {
            const { sale, owner, orderId } = await loadFixture(buyOrderFixture);

            const lbryTxHash = "lbry_tx_hash_123";

            // Fulfill order first time
            await sale.connect(owner).fulfillOrder(orderId, lbryTxHash);

            // Try to fulfill again
            await expect(
                sale.connect(owner).fulfillOrder(orderId, "lbry_tx_hash_456")
            ).to.be.revertedWith("Order already fulfilled");
        });
    });

    describe("Price Management", function () {
        it("Should allow owner to update price", async function () {
            const { sale, owner, initialPrice } = await loadFixture(deploySaleFixture);

            const newPrice = 20000; // 0.02 USDC

            const tx = await sale.connect(owner).updatePrice(newPrice);

            await expect(tx).to.emit(sale, "PriceUpdated").withArgs(initialPrice, newPrice, await txTimestamp(tx));

            expect(await sale.lbryPriceInUsdc()).to.equal(newPrice);
        });

        it("Should revert when non-owner tries to update price", async function () {
            const { sale, nonOwner } = await loadFixture(deploySaleFixture);

            await expect(
                sale.connect(nonOwner).updatePrice(20000)
            ).to.be.revertedWith("Only owner can call this function");
        });

        it("Should revert when setting zero price", async function () {
            const { sale, owner } = await loadFixture(deploySaleFixture);

            await expect(
                sale.connect(owner).updatePrice(0)
            ).to.be.revertedWith("Price must be greater than 0");
        });
    });

    describe("USDC Withdrawal", function () {
        async function saleWithBalanceFixture() {
            const fixture = await loadFixture(deploySaleFixture);
            const { sale, usdc, buyer1 } = fixture;

            // Make a purchase to add USDC to contract
            const usdcAmount = ethers.parseUnits("100", 6);
            await usdc.connect(buyer1).approve(sale.target, usdcAmount);
            await sale.connect(buyer1).buy(usdcAmount, "bLockchainAddress123");

            return { ...fixture, contractBalance: usdcAmount };
        }

        it("Should allow owner to withdraw USDC", async function () {
            const { sale, usdc, owner, contractBalance } = await loadFixture(saleWithBalanceFixture);

            const withdrawAmount = ethers.parseUnits("50", 6);

            const ownerBalanceBefore = await usdc.balanceOf(owner.address);

            await sale.connect(owner).withdrawUsdc(owner.address, withdrawAmount);

            const ownerBalanceAfter = await usdc.balanceOf(owner.address);
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(withdrawAmount);

            const contractBalanceAfter = await usdc.balanceOf(sale.target);
            expect(contractBalanceAfter).to.equal(contractBalance - withdrawAmount);
        });

        it("Should allow emergency withdrawal of all USDC", async function () {
            const { sale, usdc, owner, contractBalance } = await loadFixture(saleWithBalanceFixture);

            const ownerBalanceBefore = await usdc.balanceOf(owner.address);

            await sale.connect(owner).emergencyWithdrawAll(owner.address);

            const ownerBalanceAfter = await usdc.balanceOf(owner.address);
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(contractBalance);

            const contractBalanceAfter = await usdc.balanceOf(sale.target);
            expect(contractBalanceAfter).to.equal(0);
        });

        it("Should revert when non-owner tries to withdraw", async function () {
            const { sale, nonOwner } = await loadFixture(saleWithBalanceFixture);

            await expect(
                sale.connect(nonOwner).withdrawUsdc(nonOwner.address, ethers.parseUnits("10", 6))
            ).to.be.revertedWith("Only owner can call this function");
        });
    });

    describe("View Functions", function () {
        async function multipleOrdersFixture() {
            const fixture = await loadFixture(deploySaleFixture);
            const { sale, usdc, buyer1, buyer2 } = fixture;

            const usdcAmount = ethers.parseUnits("10", 6);

            // Buyer1 makes 2 orders
            await usdc.connect(buyer1).approve(sale.target, usdcAmount * BigInt(2));
            const orderId1 = await buyAndGetOrderId(sale, buyer1, usdcAmount, "address1");

            const orderId2 = await buyAndGetOrderId(sale, buyer1, usdcAmount, "address2");

            // Buyer2 makes 1 order
            await usdc.connect(buyer2).approve(sale.target, usdcAmount);
            const orderId3 = await buyAndGetOrderId(sale, buyer2, usdcAmount, "address3");

            return { ...fixture, orderId1, orderId2, orderId3 };
        }

        it("Should return correct total orders", async function () {
            const { sale } = await loadFixture(multipleOrdersFixture);

            expect(await sale.getTotalOrders()).to.equal(3);
        });

        it("Should return orders by buyer", async function () {
            const { sale, buyer1, buyer2, orderId1, orderId2, orderId3 } = await loadFixture(multipleOrdersFixture);

            const buyer1Orders = await sale.getOrdersByBuyer(buyer1.address);
            expect(buyer1Orders.length).to.equal(2);
            expect(buyer1Orders).to.include(orderId1);
            expect(buyer1Orders).to.include(orderId2);

            const buyer2Orders = await sale.getOrdersByBuyer(buyer2.address);
            expect(buyer2Orders.length).to.equal(1);
            expect(buyer2Orders[0]).to.equal(orderId3);
        });

        it("Should return unfulfilled orders", async function () {
            const { sale, owner, orderId1, orderId2, orderId3 } = await loadFixture(multipleOrdersFixture);

            // Fulfill one order
            await sale.connect(owner).fulfillOrder(orderId1, "tx_hash_1");

            const unfulfilledOrders = await sale.getUnfulfilledOrders();
            expect(unfulfilledOrders.length).to.equal(2);
            expect(unfulfilledOrders).to.include(orderId2);
            expect(unfulfilledOrders).to.include(orderId3);
            expect(unfulfilledOrders).to.not.include(orderId1);
        });

        it("Should calculate LBRY amount correctly", async function () {
            const { sale, initialPrice } = await loadFixture(deploySaleFixture);

            const usdcAmount = ethers.parseUnits("5", 6); // 5 USDC
            const expectedLbryAmount = (usdcAmount * BigInt(1e8)) / BigInt(initialPrice);

            expect(await sale.calculateLbryAmount(usdcAmount)).to.equal(expectedLbryAmount);
        });
    });
});