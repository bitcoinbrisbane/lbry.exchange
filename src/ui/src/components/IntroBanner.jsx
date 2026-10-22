import { Box, Heading, HStack, Link, Text } from "@chakra-ui/react";

/** Site-wide explainer: what wLBC is and why it exists. */
export function IntroBanner() {
  return (
    <Box as="section" aria-labelledby="intro-heading" layerStyle="banner" px={{ base: 4, md: 6 }} py={5}>
      <Heading id="intro-heading" as="p" size="md" mb={2}>
        Bring LBC to Ethereum DeFi
      </Heading>
      <Text>
        lbc.exchange bridges native LBRY Credits to <strong>wLBC</strong>, an ERC-20 token on Ethereum backed 1:1 by LBC
        held in custody, the same model as wBTC for Bitcoin. Hold it in any Ethereum wallet, trade it on decentralised
        exchanges, use it across DeFi, and redeem it for native LBC whenever you like.
      </Text>
      <HStack as="ul" listStyleType="none" spacing={4} mt={3} flexWrap="wrap" textStyle="helper">
        <li>1:1 backed by custodied LBC</li>
        <li>Redeem any time</li>
        <li>
          <Link href="https://etherscan.io/address/0xa3A3E8304C88b017153bA5dFCCDACCB7116a185f#code" isExternal>
            Contracts verified on Etherscan
          </Link>
        </li>
      </HStack>
    </Box>
  );
}
