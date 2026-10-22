import { Box, Button, Code, HStack, Link, Text, useClipboard, useColorModeValue, useToast } from "@chakra-ui/react";
import { WLBC_ADDRESS } from "../config/constants";
import { addTokenToWallet, ethAddressUrl } from "../lib/contracts";

/** The wLBC contract address, with copy, Etherscan and one-click "add to wallet". */
export function TokenInfo({ chainId = 1, tokenAddress = WLBC_ADDRESS }) {
  const { onCopy, hasCopied } = useClipboard(tokenAddress || "");
  const toast = useToast();
  const border = useColorModeValue("gray.200", "gray.600");
  if (!tokenAddress) return null;

  const add = async () => {
    try {
      const added = await addTokenToWallet(tokenAddress);
      if (added) toast({ title: "wLBC added to your wallet", status: "success", duration: 4000 });
    } catch (err) {
      toast({ title: "Could not add wLBC", description: err?.message || String(err), status: "error", duration: 6000 });
    }
  };

  const explorer = ethAddressUrl(chainId, tokenAddress);
  return (
    <Box borderWidth="1px" borderColor={border} borderRadius="md" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="semibold">
            wLBC token (ERC-20, 8 decimals)
          </Text>
          <Code fontSize="xs" wordBreak="break-all">
            {tokenAddress}
          </Code>
        </Box>
        <HStack spacing={2}>
          <Button size="sm" onClick={add}>
            Add to wallet
          </Button>
          <Button size="sm" variant="outline" onClick={onCopy}>
            {hasCopied ? "Copied" : "Copy"}
          </Button>
          {explorer && (
            <Link href={explorer} isExternal fontSize="sm">
              Etherscan
            </Link>
          )}
        </HStack>
      </HStack>
    </Box>
  );
}
