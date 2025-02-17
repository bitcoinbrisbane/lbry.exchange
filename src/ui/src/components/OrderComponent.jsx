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
  Flex
} from '@chakra-ui/react'
import { useState, useEffect } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useRate } from '../hooks/useRate'
import axios from 'axios'
import { API_BASE_URL } from '../config/constants'

export function OrderComponent() {
  // 1. Define all color mode values first
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const quoteBgColor = useColorModeValue('gray.50', 'gray.700')
  const supplyBgColor = useColorModeValue('gray.100', 'gray.700')
  
  // 2. Other hooks
  const toast = useToast()
  const { address, isConnecting, error: walletError, connectWallet } = useWallet()
  const { rate, loading: rateLoading, error: rateError } = useRate()
  
  // 3. State hooks
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)

  // 4. Define helper functions
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 5. Define effects
  useEffect(() => {
    if (!timeLeft) return

    const intervalId = setInterval(() => {
      setTimeLeft(time => {
        if (time <= 1) {
          setQuote(null)
          return 0
        }
        return time - 1
      })
    }, 1000)

    return () => clearInterval(intervalId)
  }, [timeLeft])

  // 6. Define handlers
  const handleGetQuote = () => {
    console.log('Getting quote with rate:', rate, 'and amount:', amount)
    
    if (!rate || !amount) {
      console.log('Missing rate or amount:', { rate, amount })
      return
    }

    // If 1 LBC = 0.0035 USDC
    // Then amount of LBC * 0.0035 = USDC needed
    const usdcAmount = amount * rate
    const fee = usdcAmount * 0.01 // 1% fee
    const total = usdcAmount + fee

    console.log('Quote calculation:', {
      usdcAmount,
      fee,
      total
    })

    setQuote({
      subtotal: usdcAmount.toFixed(2),
      fee: fee.toFixed(2),
      total: total.toFixed(2),
      rate: rate,
      amount: amount
    })
    setTimeLeft(240) // 4 minutes in seconds
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        status: "error",
        duration: 5000,
        isClosable: true,
      })
      return
    }

    if (!quote || timeLeft === 0) {
      toast({
        title: "Quote expired",
        description: "Please get a new quote",
        status: "warning",
        duration: 5000,
        isClosable: true,
      })
      return
    }

    setLoading(true)
    try {
      const orderData = {
        LBC_Address: "0x0", // This should be set to the user's LBC address
        quantity: parseFloat(quote.amount),
        USDC_Address: address // This is the connected wallet address
      }

      console.log('Submitting order with wallet address:', address)
      console.log('Full order data:', orderData)
      
      const response = await axios.post(`${API_BASE_URL}/orders/buy`, orderData)
      
      console.log('Order saved:', response.data)

      toast({
        title: "Order submitted",
        description: `Order created for ${quote.amount} LBC with wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      })

      setAmount('')
      setQuote(null)
      setTimeLeft(0)
      
    } catch (error) {
      console.error('Order submission error:', error)
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to process order. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

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
            Buy LBC
          </Text>
          <Box 
            bg={supplyBgColor}
            px={3}
            py={2}
            borderRadius="md"
          >
            <Text fontSize="sm" color="gray.500">Total Supply</Text>
            <Text fontSize="md" fontWeight="bold">654.23M LBC</Text>
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
            <Text>Connected: {address.slice(0, 6)}...{address.slice(-4)}</Text>
            
            <form onSubmit={handleSubmit}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Amount (LBC)</FormLabel>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="Enter LBC amount"
                    min={10}
                    max={1000000}
                    isDisabled={rateLoading}
                  />
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
                        <Text fontSize="sm" mb={1}>Quote expires in: {formatTime(timeLeft)}</Text>
                        <Progress 
                          value={(timeLeft / 240) * 100} 
                          size="xs" 
                          colorScheme="blue" 
                        />
                      </Box>

                      <Stat>
                        <StatLabel>Current Rate</StatLabel>
                        <StatNumber>1 LBC = ${quote.rate} USDC</StatNumber>
                        <Text fontSize="sm" color="gray.500">
                          You will receive {amount} LBC
                        </Text>
                      </Stat>
                      
                      <Divider my={2} />
                      
                      <Stat>
                        <StatLabel>Subtotal</StatLabel>
                        <StatNumber>${quote.subtotal}</StatNumber>
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
  )
}
