import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  Badge,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  useDisclosure,
  Center,
} from '@chakra-ui/react'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../config/constants'
import { useWallet } from '../contexts/WalletContext'
import { QRCodeSVG } from 'qrcode.react'

export function OrderHistory({ refreshTrigger }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [managedAddress, setManagedAddress] = useState(null)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { address } = useWallet()
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const fetchOrders = async () => {
    if (!address) return
    
    setLoading(true)
    try {
      const encodedAddress = encodeURIComponent(address)
      console.log('Fetching orders for address:', address)
      
      const response = await axios.get(`${API_BASE_URL}/orders/${encodedAddress}`)
      console.log('Orders received:', response.data)
      
      setOrders(response.data)
      setError(null)
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      setError(error.response?.data?.message || 'Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }

  const handleOrderClick = async (order) => {
    setSelectedOrder(order)
    try {
      const endpoint = order.type === 'buyLBC' 
        ? '/getManagedUSDCReceivingAddress'
        : '/getManagedLBCReceivingAddress'
      
      const response = await axios.get(`${API_BASE_URL}${endpoint}`)
      setManagedAddress(response.data.address)
      onOpen()
    } catch (error) {
      console.error('Failed to fetch managed address:', error)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [address, refreshTrigger])

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'yellow'
      case 'filled': return 'green'
      case 'cancelled': return 'red'
      default: return 'gray'
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  if (!address) {
    return null // Don't show anything if wallet not connected
  }

  return (
    <Box
      mt={8}
      p={6}
      bg={bgColor}
      borderRadius="lg"
      border="1px"
      borderColor={borderColor}
      shadow="md"
    >
      <Text fontSize="2xl" fontWeight="bold" mb={4}>
        Order History
      </Text>

      {loading ? (
        <Box textAlign="center" py={4}>
          <Spinner size="xl" />
        </Box>
      ) : error ? (
        <Alert status="error">
          <AlertIcon />
          {error}
        </Alert>
      ) : orders.length === 0 ? (
        <Alert status="info">
          <AlertIcon />
          No orders found for this address
        </Alert>
      ) : (
        <Box overflowX="auto">
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Amount (LBC)</Th>
                <Th>Price per LBC</Th>
                <Th>Total USDC</Th>
                <Th>Status</Th>
                <Th>LBC Address</Th>
                <Th>Expiry</Th>
                <Th>Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {orders.map((order) => {
                const totalUSDC = (order.quantity * order.price).toFixed(2)
                
                return (
                  <Tr key={order._id}>
                    <Td>{formatDate(order.date)}</Td>
                    <Td>{order.type}</Td>
                    <Td isNumeric>{order.quantity.toFixed(2)}</Td>
                    <Td isNumeric>${order.price.toFixed(2)}</Td>
                    <Td isNumeric>${totalUSDC}</Td>
                    <Td>
                      <Badge colorScheme={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </Td>
                    <Td>
                      {order.LBC_Address ? (
                        <Tooltip label={order.LBC_Address}>
                          {`${order.LBC_Address.slice(0, 6)}...${order.LBC_Address.slice(-4)}`}
                        </Tooltip>
                      ) : (
                        <Text color="gray.500">N/A</Text>
                      )}
                    </Td>
                    <Td>{formatDate(order.expiry)}</Td>
                    <Td>
                      {order.status === 'pending' && (
                        <Button
                          size="sm"
                          colorScheme="blue"
                          onClick={() => handleOrderClick(order)}
                        >
                          Pay Now
                        </Button>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </Box>
      )}

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {selectedOrder?.type === 'buyLBC' ? 'Pay USDC' : 'Send LBC'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack spacing={4} align="center">
              <Text>
                {selectedOrder?.type === 'buyLBC' 
                  ? 'Send USDC to this address:'
                  : 'Send LBC to this address:'}
              </Text>
              <Box p={4} bg="gray.100" borderRadius="md">
                <Text fontSize="sm" wordBreak="break-all">
                  {managedAddress}
                </Text>
              </Box>
              <Center p={4} bg="white">
                <QRCodeSVG value={managedAddress || ''} size={200} />
              </Center>
              <Text fontSize="sm" color="gray.600">
                {selectedOrder?.type === 'buyLBC'
                  ? `Send ${(selectedOrder?.quantity * selectedOrder?.price).toFixed(2)} USDC`
                  : `Send ${selectedOrder?.quantity.toFixed(2)} LBC`}
              </Text>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  )
} 