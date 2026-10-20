import { Container, Heading, VStack, Text, Alert, AlertIcon } from "@chakra-ui/react";

export function Unwrap() {
  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading as="h1" size="2xl">
          Unwrap LBC
        </Heading>

        <Text fontSize="xl">
          Redeem wLBC (wrapped LBC) on Ethereum to receive native LBC 1:1.
        </Text>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          The unwrap flow is coming soon.
        </Alert>
      </VStack>
    </Container>
  );
}
