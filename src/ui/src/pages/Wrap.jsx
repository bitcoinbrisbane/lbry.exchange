import { Alert, AlertIcon, Heading, HStack, Spinner, Text, VStack, useToast } from "@chakra-ui/react";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { ConnectWallet } from "../components/ConnectWallet";
import { DepositCard } from "../components/DepositCard";
import { DepositList } from "../components/DepositList";
import { Faq } from "../components/Faq";
import { LastChecked } from "../components/LastChecked";
import { ContractDetails } from "../components/ContractDetails";
import { UniswapCallout } from "../components/UniswapCallout";
import { useWallet } from "../contexts/WalletContext";
import { useBridgeConfig } from "../hooks/useBridgeConfig";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePolling } from "../hooks/usePolling";
import { bridgeApi, errorOf } from "../lib/bridgeApi";
import {
  BRIDGE_ABI,
  addTokenToWallet,
  ethTxUrl,
  getSigner,
  UnsignedAddressError,
  verifyDepositAddress,
} from "../lib/contracts";
import { cache } from "../lib/format";

const POLL_MS = 30_000;
// Bumped from "deposit:" when addresses became signed, so no unchecked address is shown from cache.
const depositCacheKey = (address) => `deposit-v2:${address.toLowerCase()}`;

export function Wrap() {
  usePageMeta("/");
  const { address, walletProvider, ensureChain } = useWallet();
  const { config, error: configError } = useBridgeConfig();
  const toast = useToast();
  const [deposit, setDeposit] = useState(() => (address ? cache.get(depositCacheKey(address)) : null));
  const [depositError, setDepositError] = useState(null);
  const [minting, setMinting] = useState(null);
  const [addressRequest, setAddressRequest] = useState(0);

  // 1. A fresh deposit address for the connected wallet, shown only once its signature checks out
  //    against Bridge.signer(). Cached per wallet; the server hands out the first unused one, so it
  //    moves on once a deposit lands (see the status sync below).
  useEffect(() => {
    if (!address) return setDeposit(null);
    const key = depositCacheKey(address);
    const cached = cache.get(key);
    if (cached) setDeposit(cached);
    let cancelled = false;
    bridgeApi
      .depositAddress(address)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(errorOf(res, "Could not get a deposit address"));
        await verifyDepositAddress({
          ethAddress: address,
          depositAddress: res.data.depositAddress,
          signature: res.data.signature,
        });
        if (cancelled) return;
        const next = {
          depositAddress: res.data.depositAddress,
          minConfirmations: res.data.minConfirmations,
          network: res.data.network,
        };
        cache.set(key, next);
        setDeposit(next);
        setDepositError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // A bad signature means nothing shown so far can be trusted; a network error keeps the cached address.
        if (err instanceof UnsignedAddressError) {
          cache.set(key, null);
          setDeposit(null);
        }
        setDepositError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [address, addressRequest]);

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

  // Each address takes one deposit: once the shown one is used, the status names the next. Fetch it
  // through the signed path rather than trusting the status reply.
  const nextAddress = status?.depositAddress;
  const shownAddress = deposit?.depositAddress;
  useEffect(() => {
    if (nextAddress && shownAddress && nextAddress !== shownAddress) setAddressRequest((n) => n + 1);
  }, [nextAddress, shownAddress]);

  // 3. Ask for an approval, then relay Bridge.wrap from the user's wallet.
  const mint = async (d) => {
    setMinting(d.lbcTxid);
    try {
      const approval = await bridgeApi.approve(address, d.lbcTxid);
      if (!approval.ok) throw new Error(errorOf(approval, "Approval refused"));
      const { to, amount, lbcTxid, signature } = approval.data.wrapArgs;
      await ensureChain(approval.data.chainId);
      const signer = await getSigner(walletProvider);
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
        addTokenToWallet(approval.data.tokenAddress || config?.tokenAddress, walletProvider).catch(() => null);
      }
    } catch (err) {
      const message = err?.shortMessage || err?.message || String(err);
      toast({ title: "Mint failed", description: message, status: "error", duration: 10000, isClosable: true });
    } finally {
      setMinting(null);
    }
  };

  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Wrap LBC to wLBC
        </Heading>
        <Text textStyle="lead">
          Send LBC to your personal deposit address, then mint the same amount of wLBC to your Ethereum wallet.
        </Text>
      </VStack>

      {configError && (
        <Alert status="warning">
          <AlertIcon />
          {configError}
        </Alert>
      )}

      {!address ? (
        <Alert status="info" flexDirection="column" alignItems="flex-start" gap={3}>
          <HStack>
            <AlertIcon />
            <Text>Connect the wallet that should receive the wLBC. Your deposit address is derived from it.</Text>
          </HStack>
          <ConnectWallet variant="solid" size="md" />
        </Alert>
      ) : depositError ? (
        <Alert status="error">
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
              <Alert status="warning" fontSize="sm">
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
          <ContractDetails
            chainId={config?.chainId}
            tokenAddress={config?.tokenAddress}
            bridgeAddress={config?.bridgeAddress}
            note={`On chain ${config?.chainId ?? 1}. Minting is an Ethereum transaction from your wallet; you pay the gas.`}
          />
        </>
      )}

      <UniswapCallout />
      <Faq />
    </VStack>
  );
}
