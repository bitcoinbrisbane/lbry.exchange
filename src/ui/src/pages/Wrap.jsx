import { Container, Heading, VStack, Text, Alert, AlertIcon } from "@chakra-ui/react";

export function Wrap() {
  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading as="h1" size="2xl">
          Wrap LBC
        </Heading>

        <Text fontSize="xl">
          Deposit native LBC to receive wLBC (wrapped LBC) 1:1 on Ethereum.
        </Text>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          The wrap flow is coming soon.
        </Alert>
      </VStack>
    </Container>
  );
}
