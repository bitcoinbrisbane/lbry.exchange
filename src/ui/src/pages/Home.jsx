import { Container, Heading, VStack, Text } from '@chakra-ui/react'
import { OrderComponent } from '../components/OrderComponent'

export function Home() {
  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading as="h1" size="2xl">
          Welcome to LBRY
        </Heading>
        
        <Text fontSize="xl">
          LBRY does to publishing what Bitcoin did to money.
        </Text>

        <OrderComponent />
      </VStack>
    </Container>
  )
}
