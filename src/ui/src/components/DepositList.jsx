import { Badge, Box, Button, HStack, Progress, Stack, Text } from "@chakra-ui/react";
import { lbcTxUrl } from "../lib/contracts";
import { formatLbc } from "../lib/format";
import { Address } from "./Address";

const COLORS = { pending: "yellow", ready: "green", minted: "gray" };

/** Deposits seen on the LBRY chain for this user, each with its state and a mint button when ready. */
export function DepositList({ deposits, minConfirmations, onMint, minting }) {
  if (!deposits?.length) {
    return (
      <Text textStyle="helper">
        No deposits seen yet. This list refreshes every 30 seconds; a new deposit shows up as soon as it reaches the
        LBRY network.
      </Text>
    );
  }
  return (
    <Stack spacing={3}>
      {deposits.map((d) => (
        <Box key={d.lbcTxid} layerStyle="card" p={4}>
          <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <Stack spacing={2} minW={0}>
              <HStack>
                <Text fontWeight="semibold">{formatLbc(d.amount)} LBC</Text>
                <Badge colorScheme={COLORS[d.status]}>{d.status}</Badge>
              </HStack>
              <Address
                value={d.lbcTxid}
                truncate
                copyable
                href={lbcTxUrl(d.lbcTxid)}
                label="LBC transaction id"
                fontSize="xs"
              />
              {d.status === "pending" && (
                <Box w="220px" maxW="100%">
                  <Progress
                    size="xs"
                    value={(100 * d.confirmations) / minConfirmations}
                    colorScheme="yellow"
                    borderRadius="full"
                    aria-label="Confirmations"
                  />
                  <Text textStyle="helper" mt={1}>
                    {d.confirmations} of {minConfirmations} confirmations
                  </Text>
                </Box>
              )}
            </Stack>
            {d.status === "ready" && (
              <Button
                variant="solid"
                size="md"
                onClick={() => onMint(d)}
                isLoading={minting === d.lbcTxid}
                loadingText="Minting"
              >
                Mint {formatLbc(d.amount)} wLBC
              </Button>
            )}
          </HStack>
        </Box>
      ))}
    </Stack>
  );
}
