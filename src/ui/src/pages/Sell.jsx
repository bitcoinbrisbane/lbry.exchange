import { Container, Heading, VStack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { SellLBCComponent } from "../components/SellLBCComponent";
import { OrderHistory } from "../components/OrderHistory";

export function Sell() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleOrderSubmitted = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading as="h1" size="2xl">
          Sell LBC
        </Heading>

        <Text fontSize="xl">
          Convert your LBC back to USDC at competitive rates.
        </Text>

        <SellLBCComponent onOrderSubmitted={handleOrderSubmitted} />
        <OrderHistory refreshTrigger={refreshTrigger} />
      </VStack>
    </Container>
  );
} 