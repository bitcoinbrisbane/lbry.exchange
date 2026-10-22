import { Box, Button, Heading, HStack, Link, Stack, Text, useBreakpointValue, useToast } from "@chakra-ui/react";
import { BRIDGE_ADDRESS, WLBC_ADDRESS } from "../config/constants";
import { addTokenToWallet, ethAddressUrl, ethContractUrl } from "../lib/contracts";
import { Address } from "./Address";

function Row({ label, children }) {
  return (
    <Stack spacing={2}>
      <Text fontSize="sm" fontWeight="medium">
        {label}
      </Text>
      <HStack spacing={2} flexWrap="wrap" rowGap={2}>
        {children}
      </HStack>
    </Stack>
  );
}

/** wLBC and Bridge contract addresses, "add to wallet" and a one-line note, in one compact section. */
export function ContractDetails({ chainId = 1, tokenAddress = WLBC_ADDRESS, bridgeAddress = BRIDGE_ADDRESS, note }) {
  const toast = useToast();
  const compact = useBreakpointValue({ base: true, md: false });

  const add = async () => {
    try {
      const added = await addTokenToWallet(tokenAddress);
      if (added) toast({ title: "wLBC added to your wallet", status: "success", duration: 4000 });
    } catch (err) {
      toast({ title: "Could not add wLBC", description: err?.message || String(err), status: "error", duration: 6000 });
    }
  };

  const tokenUrl = ethAddressUrl(chainId, tokenAddress);
  const bridgeUrl = ethContractUrl(chainId, bridgeAddress);
  return (
    <Box as="section" aria-labelledby="contract-details" layerStyle="card" p={4}>
      <Heading id="contract-details" as="h2" size="sm" mb={3}>
        Contract details
      </Heading>
      <Stack spacing={4}>
        <Row label="wLBC token (ERC-20, 8 decimals)">
          <Address value={tokenAddress} truncate={compact} copyable label="wLBC contract address" />
          <Button onClick={add}>Add to wallet</Button>
          {tokenUrl && (
            <Link href={tokenUrl} isExternal fontSize="sm">
              Etherscan
            </Link>
          )}
        </Row>
        <Row label="Bridge">
          <Address value={bridgeAddress} truncate={compact} copyable label="bridge contract address" />
          {bridgeUrl && (
            <Link href={bridgeUrl} isExternal fontSize="sm">
              Etherscan
            </Link>
          )}
        </Row>
      </Stack>
      {note && (
        <Text textStyle="helper" mt={3}>
          {note}
        </Text>
      )}
    </Box>
  );
}
