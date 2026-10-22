import {
  Alert,
  AlertIcon as ChakraAlertIcon,
  Badge,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  ListItem,
  OrderedList,
  SimpleGrid,
  Spinner,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Tfoot,
  Th,
  Thead,
  Tr,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useState } from "react";
import { Address } from "../components/Address";
import { AlertIcon, CheckIcon, ShieldCheckIcon } from "../components/icons";
import { LastChecked } from "../components/LastChecked";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePolling } from "../hooks/usePolling";
import { bridgeApi, errorOf } from "../lib/bridgeApi";
import { ethAddressUrl, lbcAddressUrl } from "../lib/contracts";
import { formatLbc } from "../lib/format";
import { computeRoot } from "../lib/merkle";

const POLL_MS = 120_000;

function StatTile({ label, value, unit }) {
  return (
    <Box layerStyle="card" p={4}>
      <Text textStyle="helper">{label}</Text>
      <Text fontSize="2xl" fontWeight="semibold" mt={1}>
        {value}{" "}
        <Text as="span" fontSize="md" fontWeight="medium" color="fg.muted">
          {unit}
        </Text>
      </Text>
    </Box>
  );
}

function BackingHero({ data }) {
  const ok = data.fullyBacked;
  const pct =
    data.backingBps == null ? "—" : `${(data.backingBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  return (
    <Box layerStyle="card" p={{ base: 4, md: 6 }}>
      <Text textStyle="helper">LBC in reserve per wLBC in circulation</Text>
      <Text fontSize={{ base: "5xl", md: "6xl" }} fontWeight="semibold" lineHeight="1.1" mt={1}>
        {pct}
      </Text>
      {/* Status carries an icon and a label, never colour alone. */}
      <HStack
        mt={3}
        spacing={2}
        color={ok ? "green.700" : "orange.700"}
        _dark={{ color: ok ? "green.300" : "orange.300" }}
      >
        {ok ? <ShieldCheckIcon /> : <AlertIcon />}
        <Text fontWeight="semibold">{ok ? "Fully backed" : "Under-backed"}</Text>
      </HStack>
      <Text textStyle="helper" mt={2}>
        {data.backingBps == null
          ? "No wLBC has been minted yet."
          : ok
            ? "Reserves cover every wLBC. Reserves can exceed supply while deposits wait to be minted or unwraps wait to be paid."
            : "Reserves are below supply. Payout fees come from the treasury, so the operator must top it up."}
      </Text>
    </Box>
  );
}

function MerkleCard({ data }) {
  const [result, setResult] = useState(null);
  const recompute = () => {
    const root = computeRoot(data.merkle.leaves, data.asOf.lbcHeight);
    setResult({ root, matches: root === data.merkle.root });
  };
  return (
    <Box as="section" aria-labelledby="merkle-heading" layerStyle="card" p={{ base: 4, md: 6 }}>
      <Heading id="merkle-heading" as="h2" size="md" mb={2}>
        Merkle root
      </Heading>
      <Text textStyle="helper" mb={3}>
        A single hash committing to every reserve balance below at LBC block{" "}
        {data.asOf.lbcHeight.toLocaleString("en-US")}. Change any balance and the root changes.
      </Text>
      <Address value={data.merkle.root} truncate="mobile" copyable label="Merkle root" />
      <Stack spacing={1} mt={4}>
        <Text fontSize="sm" fontWeight="medium">
          Construction
        </Text>
        <Code fontSize="xs" p={2} whiteSpace="pre-wrap" wordBreak="break-word">
          {`leaf   = ${data.merkle.leafFormat}\n${data.merkle.pairing}`}
        </Code>
      </Stack>
      <HStack mt={4} spacing={3} flexWrap="wrap">
        <Button variant="solid" size="md" onClick={recompute}>
          Recompute in your browser
        </Button>
        {result && (
          <HStack
            role="status"
            spacing={2}
            color={result.matches ? "green.700" : "red.700"}
            _dark={{ color: result.matches ? "green.300" : "red.300" }}
          >
            {result.matches ? <CheckIcon boxSize={5} /> : <AlertIcon />}
            <Text fontWeight="semibold">{result.matches ? "Root matches" : "Root does not match"}</Text>
          </HStack>
        )}
      </HStack>
      <Text textStyle="helper" mt={3}>
        Roots are computed live from public chain data. Publishing them on Ethereum as signed attestations is planned.
      </Text>
    </Box>
  );
}

export function Verify() {
  usePageMeta({
    title: "Verify wLBC reserves | lbc.exchange",
    description:
      "Proof of reserves for wLBC: circulating supply against LBC held in the treasury and deposit addresses, with a Merkle root you can recompute in your browser.",
    path: "/verify",
  });

  const fetchReserves = useCallback(async () => {
    const res = await bridgeApi.reserves();
    if (!res.ok) throw new Error(errorOf(res, "Could not load reserves"));
    return res.data;
  }, []);
  const { data, error, loading, updatedAt, refresh } = usePolling(fetchReserves, POLL_MS, true, [fetchReserves]);

  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Verify reserves
        </Heading>
        <Text textStyle="lead">
          Every wLBC should be backed by one LBC in custody. This page shows the evidence from public chain data, with a
          Merkle root you can recompute yourself.
        </Text>
      </VStack>

      {error && (
        <Alert status="error">
          <ChakraAlertIcon />
          {error}
        </Alert>
      )}

      {!data ? (
        !error && (
          <HStack>
            <Spinner size="sm" />
            <Text>Reading both chains…</Text>
          </HStack>
        )
      ) : (
        <>
          <Stack spacing={3}>
            <HStack justify="space-between" flexWrap="wrap" gap={2}>
              <Text textStyle="helper">
                LBC block {data.asOf.lbcHeight.toLocaleString("en-US")} · Ethereum block{" "}
                {data.asOf.ethBlock.toLocaleString("en-US")}
              </Text>
              <LastChecked updatedAt={updatedAt} intervalMs={POLL_MS} loading={loading} onRefresh={refresh} />
            </HStack>
            <BackingHero data={data} />
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
              <StatTile label="wLBC in circulation" value={formatLbc(data.supply)} unit="wLBC" />
              <StatTile label="LBC in reserve" value={formatLbc(data.reserves)} unit="LBC" />
              <StatTile label="Held in the treasury" value={formatLbc(data.treasury?.balance ?? 0)} unit="LBC" />
            </SimpleGrid>
          </Stack>

          <Box as="section" aria-labelledby="balances-heading">
            <Heading id="balances-heading" as="h2" size="md" mb={3}>
              Reserve balances
            </Heading>
            <TableContainer layerStyle="card">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Address</Th>
                    <Th>Type</Th>
                    <Th isNumeric>Confirmed balance</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.merkle.leaves.map((l) => (
                    <Tr key={l.lbcAddress}>
                      <Td>
                        <Address
                          value={l.lbcAddress}
                          truncate="mobile"
                          copyable
                          href={lbcAddressUrl(l.lbcAddress)}
                          label="reserve address"
                          fontSize="xs"
                        />
                      </Td>
                      <Td>
                        <Badge colorScheme={l.kind === "treasury" ? "green" : "gray"}>{l.kind}</Badge>
                      </Td>
                      <Td isNumeric sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatLbc(l.balance)} LBC
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
                <Tfoot>
                  <Tr>
                    <Th>Total</Th>
                    <Th />
                    <Th isNumeric sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatLbc(data.reserves)} LBC
                    </Th>
                  </Tr>
                </Tfoot>
              </Table>
            </TableContainer>
          </Box>

          <MerkleCard data={data} />

          <Box as="section" aria-labelledby="diy-heading" layerStyle="card" p={{ base: 4, md: 6 }}>
            <Heading id="diy-heading" as="h2" size="md" mb={3}>
              Check it yourself
            </Heading>
            <Stack spacing={3}>
              <Stack spacing={1}>
                <Text fontSize="sm" fontWeight="medium">
                  Deposit addresses, {data.xpubs.depositsPath}
                </Text>
                <Address value={data.xpubs.deposits} truncate copyable label="deposits xpub" />
              </Stack>
              <Stack spacing={1}>
                <Text fontSize="sm" fontWeight="medium">
                  Treasury, {data.xpubs.treasuryPath}
                </Text>
                <Address value={data.xpubs.treasury} truncate copyable label="treasury xpub" />
              </Stack>
              <OrderedList spacing={1} fontSize="sm" pl={1}>
                <ListItem>
                  List every recipient of the Bridge&apos;s <Code fontSize="xs">Wrapped</Code> events on Etherscan.
                </ListItem>
                <ListItem>Derive each one&apos;s deposit address from the deposits xpub using the path above.</ListItem>
                <ListItem>
                  Sum the confirmed balances of those addresses and the treasury on any LBRY explorer or node.
                </ListItem>
                <ListItem>
                  Compare with <Code fontSize="xs">totalSupply()</Code> of the{" "}
                  <a
                    href={ethAddressUrl(data.contracts.chainId, data.contracts.token)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    wLBC contract
                  </a>{" "}
                  and recompute the Merkle root from the balances.
                </ListItem>
              </OrderedList>
            </Stack>
          </Box>
        </>
      )}
    </VStack>
  );
}
