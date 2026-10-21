import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Container,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Stack,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { ConnectWallet } from "../components/ConnectWallet";
import { useWallet } from "../contexts/WalletContext";
import { useBridgeConfig } from "../hooks/useBridgeConfig";
import { usePolling } from "../hooks/usePolling";
import { bridgeApi } from "../lib/bridgeApi";
import { BRIDGE_ABI, TOKEN_ABI, ensureChain, ethTxUrl, getReadProvider, getSigner, lbcTxUrl } from "../lib/contracts";
import { cache, formatLbc, looksLikeLbcAddress, parseLbc, shortHash } from "../lib/format";

const POLL_MS = 30_000;
const COLORS = { paid: "green", ready: "blue", pending: "yellow", not_found: "gray", reverted: "red" };

export function Unwrap() {
  const { address } = useWallet();
  const { config } = useBridgeConfig();
  const toast = useToast();
  const [balance, setBalance] = useState(null);
  const [amount, setAmount] = useState("");
  const [lbcAddress, setLbcAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [burns, setBurns] = useState(() => (address ? cache.get(`unwraps:${address.toLowerCase()}`, []) : []));

  useEffect(() => setBurns(address ? cache.get(`unwraps:${address.toLowerCase()}`, []) : []), [address]);

  // wLBC balance of the connected wallet.
  const fetchBalance = useCallback(async () => {
    const provider = getReadProvider();
    if (!provider || !config?.tokenAddress) return null;
    const token = new ethers.Contract(config.tokenAddress, TOKEN_ABI, provider);
    return (await token.balanceOf(address)).toString();
  }, [address, config?.tokenAddress]);
  useEffect(() => {
    if (!address || !config) return;
    fetchBalance()
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [address, config, fetchBalance]);

  // Status of every burn this wallet made (from the cache), polled until paid.
  const fetchStatuses = useCallback(async () => {
    const open = burns.filter((b) => b.status !== "paid");
    const results = await Promise.all(open.map((b) => bridgeApi.unwrapStatus(b.burnTxid)));
    const next = burns.map((b) => {
      const i = open.indexOf(b);
      if (i < 0 || !results[i].ok) return b;
      const s = results[i].data;
      return {
        ...b,
        status: s.status,
        payouts: s.payouts,
        confirmations: s.confirmations,
        minConfirmations: s.minConfirmations,
      };
    });
    // Nudge the functions to pay anything that is ready; the call is idempotent.
    await Promise.all(
      next.filter((b) => b.status === "ready").map((b) => bridgeApi.unwrap(b.burnTxid).catch(() => null)),
    );
    if (address) cache.set(`unwraps:${address.toLowerCase()}`, next);
    setBurns(next);
    return next;
  }, [burns, address]);
  usePolling(fetchStatuses, POLL_MS, Boolean(address && burns.some((b) => b.status !== "paid")), [fetchStatuses]);

  const validAddress = looksLikeLbcAddress(lbcAddress);
  let dewies = null;
  try {
    dewies = amount ? parseLbc(amount) : null;
  } catch {
    dewies = null;
  }
  const overBalance = dewies != null && balance != null && dewies > BigInt(balance);
  const canSubmit = address && config && validAddress && dewies != null && dewies > 0n && !overBalance && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await ensureChain(config.chainId);
      const signer = await getSigner();
      const bridge = new ethers.Contract(config.bridgeAddress, BRIDGE_ABI, signer);
      const tx = await bridge.unwrap(dewies, lbcAddress.trim());
      toast({
        title: "Burn submitted",
        description: "Waiting for the transaction to confirm.",
        status: "info",
        duration: 6000,
      });
      const receipt = await tx.wait();
      const entry = {
        burnTxid: receipt.hash,
        amount: dewies.toString(),
        lbcAddress: lbcAddress.trim(),
        status: "pending",
        at: Date.now(),
      };
      const next = [entry, ...burns];
      cache.set(`unwraps:${address.toLowerCase()}`, next);
      setBurns(next);
      setAmount("");
      setLbcAddress("");
      fetchBalance()
        .then(setBalance)
        .catch(() => null);
      // Register the burn right away; the functions pay once it has enough confirmations.
      bridgeApi.unwrap(receipt.hash).catch(() => null);
      toast({
        title: "wLBC burned",
        description: `Your LBC will be sent after ${config.ethMinConfirmations} Ethereum confirmations.`,
        status: "success",
        duration: 10000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: "Unwrap failed",
        description: err?.shortMessage || err?.message || String(err),
        status: "error",
        duration: 10000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={8} align="stretch">
        <VStack align="stretch" spacing={2}>
          <Heading as="h1" size="xl">
            Unwrap wLBC
          </Heading>
          <Text fontSize="lg" color="gray.600">
            Burn wLBC and receive native LBC 1:1 at any LBRY address.
          </Text>
        </VStack>

        {!address ? (
          <Alert status="info" borderRadius="md" flexDirection="column" alignItems="flex-start" gap={3}>
            <HStack>
              <AlertIcon />
              <Text>Connect the wallet holding your wLBC.</Text>
            </HStack>
            <ConnectWallet size="md" />
          </Alert>
        ) : (
          <Stack spacing={5} borderWidth="1px" borderRadius="lg" p={6}>
            <FormControl>
              <FormLabel>Amount</FormLabel>
              <InputGroup>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                />
                <InputRightElement w="auto" pr={2}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => balance != null && setAmount(ethers.formatUnits(BigInt(balance), 8))}
                    isDisabled={balance == null}
                  >
                    Max
                  </Button>
                </InputRightElement>
              </InputGroup>
              <FormHelperText>
                Balance: {balance != null ? `${formatLbc(balance)} wLBC` : "…"}
                {overBalance && (
                  <Text as="span" color="red.500">
                    {" "}
                    — more than you hold
                  </Text>
                )}
              </FormHelperText>
            </FormControl>
            <FormControl isInvalid={lbcAddress.length > 0 && !validAddress}>
              <FormLabel>LBC address</FormLabel>
              <Input
                value={lbcAddress}
                onChange={(e) => setLbcAddress(e.target.value)}
                placeholder="b…"
                fontFamily="mono"
              />
              <FormHelperText>Where the native LBC goes. Double-check it: burns cannot be undone.</FormHelperText>
            </FormControl>
            <Button onClick={submit} isDisabled={!canSubmit} isLoading={busy} loadingText="Burning">
              Burn {dewies != null && dewies > 0n ? `${formatLbc(dewies)} ` : ""}wLBC
            </Button>
            {config && (
              <Text fontSize="xs" color="gray.500">
                LBC is paid from the bridge treasury after {config.ethMinConfirmations} Ethereum confirmations. You pay
                the Ethereum gas; the payout fee is covered.
              </Text>
            )}
          </Stack>
        )}

        {address && burns.length > 0 && (
          <VStack align="stretch" spacing={3}>
            <Heading as="h2" size="md">
              Your unwraps
            </Heading>
            {burns.map((b) => (
              <Box key={b.burnTxid} borderWidth="1px" borderRadius="md" p={4}>
                <HStack justify="space-between" flexWrap="wrap" gap={2}>
                  <HStack>
                    <Text fontWeight="semibold">{formatLbc(b.amount)} LBC</Text>
                    <Badge colorScheme={COLORS[b.status] || "gray"}>{b.status}</Badge>
                  </HStack>
                  <Text fontFamily="mono" fontSize="xs">
                    → {b.lbcAddress}
                  </Text>
                </HStack>
                <HStack mt={2} spacing={4} fontSize="xs" flexWrap="wrap">
                  {ethTxUrl(config?.chainId, b.burnTxid) ? (
                    <Link href={ethTxUrl(config.chainId, b.burnTxid)} isExternal fontFamily="mono">
                      burn {shortHash(b.burnTxid, 10, 6)}
                    </Link>
                  ) : (
                    <Text fontFamily="mono">burn {shortHash(b.burnTxid, 10, 6)}</Text>
                  )}
                  {b.status === "pending" && b.minConfirmations && (
                    <Text color="gray.500">
                      {b.confirmations ?? 0} of {b.minConfirmations} confirmations
                    </Text>
                  )}
                  {b.payouts
                    ?.filter((p) => p.lbcTxid)
                    .map((p) => (
                      <Link key={p.lbcTxid} href={lbcTxUrl(p.lbcTxid)} isExternal fontFamily="mono">
                        payout {shortHash(p.lbcTxid, 10, 6)}
                      </Link>
                    ))}
                </HStack>
              </Box>
            ))}
          </VStack>
        )}
      </VStack>
    </Container>
  );
}
