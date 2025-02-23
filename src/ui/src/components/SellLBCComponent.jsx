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
  IconButton,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { useRate } from "../hooks/useRate";
import axios from "axios";
import { API_BASE_URL } from "../config/constants";
import { RepeatIcon } from "@chakra-ui/icons";
import { useWallet } from "../contexts/WalletContext";

export function SellLBCComponent({ onOrderSubmitted }) {
  const bgColor = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const quoteBgColor = useColorModeValue("gray.50", "gray.700");
  const supplyBgColor = useColorModeValue("gray.100", "gray.700");

  const toast = useToast();
  const { address, isConnecting, error: walletError, connectWallet, disconnectWallet } = useWallet();
  const { rate, loading: rateLoading, error: rateError } = useRate();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isUSDCMode, setIsUSDCMode] = useState(false);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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

  const handleGetQuote = () => {
    if (!rate || !amount) return;

    let lbcAmount, usdcAmount;
    if (isUSDCMode) {
      usdcAmount = parseFloat(amount);
      lbcAmount = usdcAmount / rate;
    } else {
      lbcAmount = parseFloat(amount);
      usdcAmount = lbcAmount * rate;
    }

    const fee = usdcAmount * 0.01; // 1% fee
    const total = usdcAmount - fee; // Subtract fee for selling

    setQuote({
      subtotal: usdcAmount.toFixed(2),
      fee: fee.toFixed(2),
      total: total.toFixed(2),
      rate: rate,
      amount: lbcAmount.toFixed(2),
    });
    setTimeLeft(240); // 4 minutes quote validity
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first to receive USDC",
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
        USDC_Address: address,
        quantity: parseFloat(quote.amount),
        price: rate,
      };

      const response = await axios.post(
        `${API_BASE_URL}/orders/sell`,
        orderData
      );

      toast({
        title: "Order submitted",
        description: `Send ${quote.amount} LBC to our address to receive ${quote.total} USDC at ${address}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      setAmount("");
      setQuote(null);
      setTimeLeft(0);
      onOrderSubmitted?.();

    } catch (error) {
      console.error("Order submission error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to process order. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

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
            Sell LBC
          </Text>
          <Box bg={supplyBgColor} px={3} py={2} borderRadius="md">
            <Text fontSize="sm" color="gray.500">
              Current Rate
            </Text>
            <Text fontSize="md" fontWeight="bold">
              1 LBC = ${rate} USDC
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
          <>
            <Alert status="info">
              <AlertIcon />
              Connect your wallet to specify where you'll receive USDC
            </Alert>
            <Button
              colorScheme="brand"
              onClick={connectWallet}
              isLoading={isConnecting}
              loadingText="Connecting..."
            >
              Connect Wallet
            </Button>
          </>
        ) : (
          <>
            <Box p={4} bg={quoteBgColor} borderRadius="md">
              <VStack align="stretch" spacing={2}>
                <Flex justify="space-between" align="center">
                  <Text fontWeight="medium">USDC Receiving Address</Text>
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="outline"
                    onClick={disconnectWallet}
                  >
                    Disconnect
                  </Button>
                </Flex>
                <Text fontSize="sm">{address}</Text>
                <Text fontSize="sm" color="gray.500">
                  You'll receive USDC at this address after sending LBC
                </Text>
              </VStack>
            </Box>

            <form onSubmit={handleSubmit}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>
                    Amount ({isUSDCMode ? "USDC" : "LBC"})
                  </FormLabel>
                  <HStack>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      placeholder={`Enter ${isUSDCMode ? "USDC" : "LBC"} amount`}
                      min={isUSDCMode ? 0.01 : 1}
                      max={isUSDCMode ? 10000 : 1000000}
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
                </FormControl>

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
                  <Box p={4} bg={quoteBgColor} borderRadius="md">
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
                        <StatLabel>You Will Send</StatLabel>
                        <StatNumber>{quote.amount} LBC</StatNumber>
                      </Stat>

                      <Divider my={2} />

                      <Stat>
                        <StatLabel>You Will Receive</StatLabel>
                        <StatNumber>${quote.subtotal} USDC</StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>Fee (1%)</StatLabel>
                        <StatNumber>${quote.fee}</StatNumber>
                      </Stat>

                      <Divider my={2} />

                      <Stat>
                        <StatLabel>Total USDC You'll Receive</StatLabel>
                        <StatNumber>${quote.total}</StatNumber>
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
                  Sell Now
                </Button>
              </VStack>
            </form>
          </>
        )}
      </VStack>
    </Box>
  );
} 