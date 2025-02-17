import { Container, Heading, VStack, Text } from '@chakra-ui/react'
import { useState } from 'react'
import { OrderComponent } from '../components/OrderComponent'
import { OrderHistory } from '../components/OrderHistory'

export function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleOrderSubmitted = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading as="h1" size="2xl">
          Welcome to LBRY
        </Heading>
        
        <Text fontSize="xl">
          LBRY does to publishing what Bitcoin did to money.
        </Text>

        <OrderComponent onOrderSubmitted={handleOrderSubmitted} />
        <OrderHistory refreshTrigger={refreshTrigger} />
      </VStack>
    </Container>
  )
}
