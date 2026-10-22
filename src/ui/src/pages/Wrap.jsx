import { Alert, AlertIcon, Container, Heading, HStack, Spinner, Text, VStack, useToast } from "@chakra-ui/react";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { ConnectWallet } from "../components/ConnectWallet";
import { DepositCard } from "../components/DepositCard";
import { DepositList } from "../components/DepositList";
import { LastChecked } from "../components/LastChecked";
import { TokenInfo } from "../components/TokenInfo";
import { useWallet } from "../contexts/WalletContext";
import { useBridgeConfig } from "../hooks/useBridgeConfig";
import { usePolling } from "../hooks/usePolling";
import { bridgeApi, errorOf } from "../lib/bridgeApi";
import { BRIDGE_ABI, addTokenToWallet, ensureChain, ethTxUrl, getSigner } from "../lib/contracts";
import { cache } from "../lib/format";

const POLL_MS = 30_000;

export function Wrap() {
  const { address } = useWallet();
  const { config, error: configError } = useBridgeConfig();
  const toast = useToast();
  const [deposit, setDeposit] = useState(() => (address ? cache.get(`deposit:${address.toLowerCase()}`) : null));
  const [depositError, setDepositError] = useState(null);
  const [minting, setMinting] = useState(null);

  // 1. A deposit address for the connected wallet. Cached per wallet; re-derived on the server any time.
  useEffect(() => {
    if (!address) return setDeposit(null);
    const key = `deposit:${address.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached) setDeposit(cached);
    let cancelled = false;
    bridgeApi
      .depositAddress(address)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(errorOf(res, "Could not get a deposit address"));
        const next = {
          depositAddress: res.data.depositAddress,
          minConfirmations: res.data.minConfirmations,
          network: res.data.network,
        };
        cache.set(key, next);
        setDeposit(next);
        setDepositError(null);
      })
      .catch((err) => !cancelled && setDepositError(err.message));
    return () => {
      cancelled = true;
    };
  }, [address]);

  // 2. Poll the deposits seen for this wallet.
  const fetchDeposits = useCallback(async () => {
    const res = await bridgeApi.deposits(address);
    if (!res.ok) throw new Error(errorOf(res, "Could not load deposits"));
    return res.data;
  }, [address]);
  const {
    data: status,
    error: statusError,
    loading: statusLoading,
    updatedAt: statusUpdatedAt,
    refresh,
  } = usePolling(fetchDeposits, POLL_MS, Boolean(address && deposit), [fetchDeposits]);

  // 3. Ask for an approval, then relay Bridge.wrap from the user's wallet.
  const mint = async (d) => {
    setMinting(d.lbcTxid);
    try {
      const approval = await bridgeApi.approve(address, d.lbcTxid);
      if (!approval.ok) throw new Error(errorOf(approval, "Approval refused"));
      const { to, amount, lbcTxid, signature } = approval.data.wrapArgs;
      await ensureChain(approval.data.chainId);
      const signer = await getSigner();
      const bridge = new ethers.Contract(approval.data.bridgeAddress, BRIDGE_ABI, signer);
      const tx = await bridge.wrap(to, BigInt(amount), lbcTxid, signature);
      toast({
        title: "Mint submitted",
        description: "Waiting for the transaction to confirm.",
        status: "info",
        duration: 6000,
      });
      const receipt = await tx.wait();
      const url = ethTxUrl(approval.data.chainId, receipt.hash);
      toast({
        title: "wLBC minted",
        description: url ? `View: ${url}` : receipt.hash,
        status: "success",
        duration: 10000,
        isClosable: true,
      });
      refresh();
      // First mint from this wallet: offer to track wLBC, like Aave does after a supply.
      const key = `token-added:${address.toLowerCase()}`;
      if (!cache.get(key)) {
        cache.set(key, true);
        addTokenToWallet(approval.data.tokenAddress || config?.tokenAddress).catch(() => null);
      }
    } catch (err) {
      const message = err?.shortMessage || err?.message || String(err);
      toast({ title: "Mint failed", description: message, status: "error", duration: 10000, isClosable: true });
    } finally {
      setMinting(null);
    }
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={8} align="stretch">
        <VStack align="stretch" spacing={2}>
          <Heading as="h1" size="xl">
            Wrap LBC
          </Heading>
          <Text fontSize="lg" color="gray.600">
            Deposit native LBC and mint wLBC, an ERC-20 backed 1:1, to your wallet.
          </Text>
        </VStack>

        {configError && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            {configError}
          </Alert>
        )}

        {!address ? (
          <Alert status="info" borderRadius="md" flexDirection="column" alignItems="flex-start" gap={3}>
            <HStack>
              <AlertIcon />
              <Text>Connect the wallet that should receive the wLBC. Your deposit address is derived from it.</Text>
            </HStack>
            <ConnectWallet size="md" />
          </Alert>
        ) : depositError ? (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            {depositError}
          </Alert>
        ) : !deposit ? (
          <HStack>
            <Spinner size="sm" />
            <Text>Deriving your deposit address…</Text>
          </HStack>
        ) : (
          <>
            <DepositCard {...deposit} />
            <VStack align="stretch" spacing={3}>
              <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                <Heading as="h2" size="md">
                  Deposits
                </Heading>
                <LastChecked
                  updatedAt={statusUpdatedAt}
                  intervalMs={POLL_MS}
                  loading={statusLoading}
                  onRefresh={refresh}
                />
              </HStack>
              {(statusError || status?.warning) && (
                <Alert status="warning" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  {statusError || status.warning}
                </Alert>
              )}
              <DepositList
                deposits={status?.deposits}
                minConfirmations={status?.minConfirmations ?? deposit.minConfirmations}
                onMint={mint}
                minting={minting}
              />
            </VStack>
            <TokenInfo chainId={config?.chainId} tokenAddress={config?.tokenAddress} />
            {config && (
              <Text fontSize="sm" color="gray.500">
                Bridge {config.bridgeAddress} on chain {config.chainId}. Minting is an Ethereum transaction from your
                wallet; you pay the gas.
              </Text>
            )}
          </>
        )}
      </VStack>
    </Container>
  );
}
