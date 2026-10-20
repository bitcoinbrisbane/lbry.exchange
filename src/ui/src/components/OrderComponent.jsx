import {
  Box,
  Button,
  VStack,
  Text,
  useColorModeValue,
  FormControl,
  FormLabel,
  Input,
  useToast,
  Alert,
  AlertIcon,
  Stat,
  StatLabel,
  StatNumber,
  Divider,
  Progress,
  HStack,
  Flex,
  Switch,
  IconButton,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { useWallet } from "../contexts/WalletContext";
import { useRate } from "../hooks/useRate";
import { useTotalSupply } from "../hooks/useTotalSupply";
import axios from "axios";
import { API_BASE_URL, MAX_LBC } from "../config/constants";
import { RepeatIcon } from "@chakra-ui/icons";

// Helper function to validate LBC address format
const isValidLBCAddress = (address) => {
  // Basic validation: starts with 'b' and is 34 characters
  const basicFormat = /^b[1-9A-HJ-NP-Za-km-z]{33}$/;
  return basicFormat.test(address);
};

export function OrderComponent({ onOrderSubmitted }) {
  // 1. Define all color mode values first
  const bgColor = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const quoteBgColor = useColorModeValue("gray.50", "gray.700");
  const supplyBgColor = useColorModeValue("gray.100", "gray.700");

  // 2. Other hooks
  const toast = useToast();
  const { address, isConnecting, error: walletError, connectWallet, disconnectWallet } = useWallet();
  const { rate, loading: rateLoading, error: rateError } = useRate();
  const { totalSupply, loading: supplyLoading, error: supplyError } = useTotalSupply();

  // Compact display, e.g. 654,230,000 -> "654.23M"
  const formatSupply = (value) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);

  // 3. State hooks
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isUSDCMode, setIsUSDCMode] = useState(false);
  const [lbcAddress, setLbcAddress] = useState("");

  // 4. Define helper functions
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 5. Define effects
  useEffect(() => {
    if (!timeLeft) return;

    const intervalId = setInterval(() => {
      setTimeLeft((time) => {
        if (time <= 1) {
          setQuote(null);
          return 0;
        }
        return time - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [timeLeft]);

  // 6. Define handlers
  const handleGetQuote = () => {
    if (!rate || !amount) return;

    let lbcAmount, usdcAmount;
    if (isUSDCMode) {
      // If amount is in USDC, calculate LBC
      usdcAmount = parseFloat(amount);
      lbcAmount = usdcAmount / rate;
    } else {
      // If amount is in LBC, calculate USDC
      lbcAmount = parseFloat(amount);
      usdcAmount = lbcAmount * rate;
    }

    if (lbcAmount > MAX_LBC) {
      toast({
        title: "Amount too large",
        description: `Maximum order is ${MAX_LBC.toLocaleString()} LBC.`,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    const fee = usdcAmount * 0.01; // 1% fee
    const total = usdcAmount + fee;

    setQuote({
      subtotal: usdcAmount.toFixed(2),
      fee: fee.toFixed(2),
      total: total.toFixed(2),
      rate: rate,
      amount: lbcAmount.toFixed(2),
    });
    setTimeLeft(240);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    if (!lbcAddress || !isValidLBCAddress(lbcAddress)) {
      toast({
        title: "Invalid LBC Address",
        description: "Please enter a valid LBC address (starts with 'b' and is 34 characters long)",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    if (!quote || timeLeft === 0) {
      toast({
        title: "Quote expired",
        description: "Please get a new quote",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        LBC_Address: lbcAddress,
        quantity: parseFloat(quote.amount),
        USDC_Address: address,
      };

      console.log("Submitting order:", orderData);

      const response = await axios.post(
        `${API_BASE_URL}/orders/buy`,
        orderData
      );

      console.log("Order saved:", response.data);

      toast({
        title: "Order submitted",
        description: `Order created for ${quote.amount} LBC`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      // Reset form
      setAmount("");
      setQuote(null);
      setTimeLeft(0);
      setLbcAddress("");

      // Trigger refresh of order history
      onOrderSubmitted?.();
    } catch (error) {
      console.error("Order submission error:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.error ||
          "Failed to process order. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // 7. Return JSX
  return (
    <Box
      p={6}
      bg={bgColor}
      borderRadius="lg"
      border="1px"
      borderColor={borderColor}
      shadow="md"
    >
      <VStack spacing={4} align="stretch">
        <Flex justify="space-between" align="center">
          <Text fontSize="2xl" fontWeight="bold">
            Buy LBC with USDT/USDC on Ethereum
          </Text>
          <Box bg={supplyBgColor} px={3} py={2} borderRadius="md">
            <Text fontSize="sm" color="gray.500">
              Total Supply
            </Text>
            <Text fontSize="md" fontWeight="bold">
              {supplyLoading
                ? "…"
                : supplyError || totalSupply == null
                ? "—"
                : `${formatSupply(totalSupply)} LBC`}
            </Text>
          </Box>
        </Flex>

        {(walletError || rateError) && (
          <Alert status="error">
            <AlertIcon />
            {walletError || rateError}
          </Alert>
        )}

        {!address ? (
          <Button
            colorScheme="brand"
            onClick={connectWallet}
            isLoading={isConnecting}
            loadingText="Connecting..."
          >
            Connect Wallet
          </Button>
        ) : (
          <>
            <HStack justify="space-between">
              <Text>
                Connected: {address.slice(0, 6)}...{address.slice(-4)}
              </Text>
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                onClick={disconnectWallet}
              >
                Disconnect
              </Button>
            </HStack>

            <form onSubmit={handleSubmit}>
              <VStack spacing={4}>
                <FormControl isRequired isInvalid={lbcAddress && !isValidLBCAddress(lbcAddress)}>
                  <FormLabel>LBC Receiving Address</FormLabel>
                  <Input
                    value={lbcAddress}
                    onChange={(e) => setLbcAddress(e.target.value)}
                    placeholder="Enter your LBC address (starts with 'b')"
                  />
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    The address where you'll receive your LBC
                  </Text>
                  {lbcAddress && !isValidLBCAddress(lbcAddress) && (
                    <Text color="red.500" fontSize="sm" mt={1}>
                      Invalid LBC address format. Must start with 'b' and be 34 characters long.
                    </Text>
                  )}
                </FormControl>

                <HStack width="full" justify="space-between" align="center">
                  <FormControl isRequired>
                    <FormLabel>
                      Amount ({isUSDCMode ? "USDC" : "LBC"})
                    </FormLabel>
                    <HStack>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={`Enter ${
                          isUSDCMode ? "USDC" : "LBC"
                        } amount`}
                        min={isUSDCMode ? 0.01 : 1}
                        max={isUSDCMode ? (rate ? MAX_LBC * rate : undefined) : MAX_LBC}
                        step={isUSDCMode ? 0.01 : 1}
                        isDisabled={rateLoading}
                      />
                      <IconButton
                        icon={<RepeatIcon />}
                        onClick={() => {
                          setIsUSDCMode(!isUSDCMode);
                          setAmount("");
                          setQuote(null);
                        }}
                        aria-label="Toggle currency"
                        title="Switch between LBC and USDC"
                      />
                    </HStack>
                    <Text fontSize="sm" color="gray.500" mt={1}>
                      {isUSDCMode
                        ? `Min: $0.01 USDC, Max: ${MAX_LBC.toLocaleString()} LBC worth`
                        : `Min: 1 LBC, Max: ${MAX_LBC.toLocaleString()} LBC`}
                    </Text>
                  </FormControl>
                </HStack>

                <Button
                  colorScheme="blue"
                  onClick={handleGetQuote}
                  isDisabled={!amount || rateLoading}
                  isLoading={rateLoading}
                  w="full"
                >
                  Get Quote
                </Button>

                {quote && timeLeft > 0 && (
                  <Box p={4} bg={quoteBgColor} borderRadius="md" w="full">
                    <VStack spacing={2} align="stretch">
                      <Box mb={2}>
                        <Text fontSize="sm" mb={1}>
                          Quote expires in: {formatTime(timeLeft)}
                        </Text>
                        <Progress
                          value={(timeLeft / 240) * 100}
                          size="xs"
                          colorScheme="blue"
                        />
                      </Box>

                      <Stat>
                        <StatLabel>Exchange Rate</StatLabel>
                        <StatNumber>1 LBC = ${rate} USDC</StatNumber>
                      </Stat>

                      <Divider my={2} />

                      <Stat>
                        <StatLabel>
                          {isUSDCMode ? "You Will Receive" : "You Will Pay"}
                        </StatLabel>
                        <StatNumber>
                          {isUSDCMode
                            ? `${quote.amount} LBC`
                            : `$${quote.subtotal} USDC`}
                        </StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>Fee (1%)</StatLabel>
                        <StatNumber>${quote.fee}</StatNumber>
                      </Stat>

                      <Divider my={2} />

                      <Stat>
                        <StatLabel>Total USDC Required</StatLabel>
                        <StatNumber>${quote.total}</StatNumber>
                        <Text fontSize="sm" color="gray.500">
                          This amount will be deducted from your wallet
                        </Text>
                      </Stat>
                    </VStack>
                  </Box>
                )}

                <Button
                  colorScheme="brand"
                  size="lg"
                  w="full"
                  type="submit"
                  isLoading={loading}
                  loadingText="Processing..."
                  isDisabled={!quote || timeLeft === 0 || rateLoading}
                >
                  Purchase Now
                </Button>
              </VStack>
            </form>
          </>
        )}
      </VStack>
    </Box>
  );
}
