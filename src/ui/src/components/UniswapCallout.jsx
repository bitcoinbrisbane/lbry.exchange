import { Box, Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { UNISWAP } from "../config/constants";

/** A short pointer to the Uniswap market, for pages other than the Trade page. */
export function UniswapCallout() {
  return (
    <Box as="section" aria-labelledby="uniswap-callout" layerStyle="card" p={{ base: 4, md: 6 }}>
      <Heading id="uniswap-callout" as="h2" size="md" mb={2}>
        Trade wLBC on Uniswap
      </Heading>
      <Text textStyle="helper" mb={4}>
        Already holding wLBC, or want some without wrapping? It trades on Uniswap V3 on Ethereum, paired with{" "}
        {UNISWAP.quoteSymbol} at the {UNISWAP.feeTier} fee tier.
      </Text>
      <Stack direction={{ base: "column", sm: "row" }} spacing={3}>
        <Button as="a" href={UNISWAP.swapUrl} target="_blank" rel="noopener noreferrer" variant="solid">
          Swap on Uniswap
        </Button>
        <HStack spacing={3}>
          <Button as="a" href={UNISWAP.tokenUrl} target="_blank" rel="noopener noreferrer" variant="outline">
            View pools &amp; liquidity
          </Button>
          <Button as={RouterLink} to="/trade" variant="ghost">
            Pool details
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
