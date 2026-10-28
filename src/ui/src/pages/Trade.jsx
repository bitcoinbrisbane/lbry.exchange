import { Box, Button, Heading, HStack, SimpleGrid, Stack, Text, VStack } from "@chakra-ui/react";
import { ContractDetails } from "../components/ContractDetails";
import { UNISWAP } from "../config/constants";
import { usePageMeta } from "../hooks/usePageMeta";

function Fact({ label, value, hint }) {
  return (
    <Box layerStyle="card" p={4}>
      <Text textStyle="helper">{label}</Text>
      <Text fontSize="2xl" fontWeight="semibold" mt={1}>
        {value}
      </Text>
      {hint && (
        <Text textStyle="helper" mt={1}>
          {hint}
        </Text>
      )}
    </Box>
  );
}

/** Where to trade wLBC: the Uniswap market, with the contract addresses to check against. */
export function Trade() {
  usePageMeta({
    title: "Trade wLBC on Uniswap | lbc.exchange",
    description:
      "wLBC trades on Uniswap V3 on Ethereum, paired with USDT. Swap links and the token and bridge contract addresses to verify before trading.",
    path: "/trade",
  });

  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Trade wLBC on Uniswap
        </Heading>
        <Text textStyle="lead">
          wLBC is wrapped LBRY Credits, minted 1:1 against LBC by the bridge. It trades on Uniswap V3 on Ethereum, so you
          can buy or sell it for {UNISWAP.quoteSymbol} without going through the bridge.
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        <Fact label="Pair" value={`wLBC / ${UNISWAP.quoteSymbol}`} hint="Uniswap V3" />
        <Fact label="Fee tier" value={UNISWAP.feeTier} hint="Long-tail tier" />
        <Fact label="Network" value="Ethereum" hint="Mainnet" />
      </SimpleGrid>

      <Box layerStyle="card" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Heading as="h2" size="md">
            Go to the market
          </Heading>
          <Text textStyle="helper">
            Live price, liquidity and every pool across fee tiers are on the Uniswap token page, so they stay accurate
            as the market moves.
          </Text>
          <HStack spacing={3} flexWrap="wrap">
            <Button as="a" href={UNISWAP.swapUrl} target="_blank" rel="noopener noreferrer" variant="solid">
              Swap on Uniswap
            </Button>
            <Button as="a" href={UNISWAP.tokenUrl} target="_blank" rel="noopener noreferrer" variant="outline">
              View pools &amp; liquidity
            </Button>
          </HStack>
        </Stack>
      </Box>

      <ContractDetails note="Before trading, check the wLBC token address above matches the one shown in Uniswap. A different token also named &ldquo;wLBC&rdquo; is a scam." />
    </VStack>
  );
}

export default Trade;
