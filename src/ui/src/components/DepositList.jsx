import { Badge, Box, Button, HStack, Link, Progress, Stack, Text } from "@chakra-ui/react";
import { lbcTxUrl } from "../lib/contracts";
import { formatLbc, shortHash } from "../lib/format";

const COLORS = { pending: "yellow", ready: "green", minted: "gray" };

/** Deposits seen on the LBRY chain for this user, each with its state and a mint button when ready. */
export function DepositList({ deposits, minConfirmations, onMint, minting }) {
  if (!deposits?.length) {
    return (
      <Text color="gray.500" fontSize="sm">
        No deposits seen yet. This list refreshes every 30 seconds; a new deposit shows up as soon as it reaches the
        LBRY network.
      </Text>
    );
  }
  return (
    <Stack spacing={3}>
      {deposits.map((d) => (
        <Box key={d.lbcTxid} borderWidth="1px" borderRadius="md" p={4}>
          <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={3}>
            <Stack spacing={1} minW={0}>
              <HStack>
                <Text fontWeight="semibold">{formatLbc(d.amount)} LBC</Text>
                <Badge colorScheme={COLORS[d.status]}>{d.status}</Badge>
              </HStack>
              <Link href={lbcTxUrl(d.lbcTxid)} isExternal fontSize="xs" fontFamily="mono">
                {shortHash(d.lbcTxid, 10, 8)}
              </Link>
              {d.status === "pending" && (
                <Box w="220px">
                  <Progress
                    size="xs"
                    value={(100 * d.confirmations) / minConfirmations}
                    colorScheme="yellow"
                    borderRadius="full"
                  />
                  <Text fontSize="xs" color="gray.500">
                    {d.confirmations} of {minConfirmations} confirmations
                  </Text>
                </Box>
              )}
            </Stack>
            {d.status === "ready" && (
              <Button onClick={() => onMint(d)} isLoading={minting === d.lbcTxid} loadingText="Minting">
                Mint {formatLbc(d.amount)} wLBC
              </Button>
            )}
          </HStack>
        </Box>
      ))}
    </Stack>
  );
}
