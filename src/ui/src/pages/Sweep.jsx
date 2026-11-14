import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Heading,
  HStack,
  Link,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Address } from "../components/Address";
import { ConnectWallet } from "../components/ConnectWallet";
import { useWallet } from "../contexts/WalletContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { bridgeApi, errorOf } from "../lib/bridgeApi";
import { lbcTxUrl, UnsignedAddressError, verifyDepositAddress } from "../lib/contracts";
import { formatLbc } from "../lib/format";
import { buildSweep, parseSecret, scanSource, totalOf } from "../lib/sweep";

/**
 * Sweep: everything in a seed, wallet file or private key → the connected wallet's deposit address, in one
 * transaction signed here. The secret lives in this component's state only: it is never stored, and the
 * functions never receive it (they get addresses to look up and the signed transaction to relay).
 */
export function Sweep() {
  usePageMeta("/sweep");
  const { address } = useWallet();
  const [secret, setSecret] = useState("");
  const [fileName, setFileName] = useState("");
  const [deposit, setDeposit] = useState(null);
  const [depositError, setDepositError] = useState(null);
  const [scan, setScan] = useState(null); // { kind, found: [{ source, coins, total, tipHeight, feePerByte }] }
  const [busy, setBusy] = useState(null); // "scan" | "sweep"
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const run = useRef(0);

  // The deposit address for the connected wallet, shown and used only once its signature checks out.
  useEffect(() => {
    setDeposit(null);
    setDepositError(null);
    if (!address) return;
    let cancelled = false;
    bridgeApi
      .depositAddress(address)
      .then(async (res) => {
        if (!res.ok) throw new Error(errorOf(res, "Could not get a deposit address"));
        await verifyDepositAddress({
          ethAddress: address,
          depositAddress: res.data.depositAddress,
          signature: res.data.signature,
        });
        if (!cancelled) setDeposit(res.data.depositAddress);
      })
      .catch((err) => {
        if (cancelled) return;
        setDeposit(null);
        setDepositError(err instanceof UnsignedAddressError ? "The deposit address failed its signature check." : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const reset = () => {
    run.current += 1;
    setScan(null);
    setResult(null);
    setError(null);
    setBusy(null);
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);
    setSecret(await file.text());
    event.target.value = "";
  };

  const onScan = async () => {
    const id = ++run.current;
    setError(null);
    setResult(null);
    setScan(null);
    setProgress(0);
    setBusy("scan");
    try {
      const { kind, sources } = parseSecret(secret);
      const found = [];
      for (const source of sources) {
        const { coins, tipHeight, feePerByte } = await scanSource(source, (n) => run.current === id && setProgress(n));
        found.push({ source, coins, total: totalOf(coins), tipHeight, feePerByte });
      }
      if (run.current === id) setScan({ kind, found });
    } catch (err) {
      if (run.current === id) setError(err.message || String(err));
    } finally {
      if (run.current === id) setBusy(null);
    }
  };

  const onSweep = async (entry) => {
    setError(null);
    setBusy("sweep");
    try {
      const built = buildSweep(entry.source, entry.coins, deposit, entry.feePerByte);
      const res = await bridgeApi.broadcast(address, built.hex);
      if (!res.ok) throw new Error(errorOf(res, "The transaction was not accepted"));
      setResult({ ...built, txid: res.data.txid });
      // Nothing secret is kept once the coins have moved.
      setSecret("");
      setFileName("");
      setScan(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(null);
    }
  };

  const withCoins = scan?.found.filter((f) => f.coins.length > 0) ?? [];
  const ready = Boolean(address && deposit);

  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Sweep LBC into the bridge
        </Heading>
        <Text textStyle="lead">
          Move everything in an LBRY seed, wallet file or private key into your deposit address in one transaction, then
          mint it as wLBC.
        </Text>
      </VStack>

      <Alert status="warning" alignItems="flex-start">
        <AlertIcon mt={1} />
        <Text fontSize="sm">
          Your seed or key is used only in this page, in your browser. It is never sent anywhere or stored, and only the
          signed transaction is relayed. Even so, only paste a secret into a site you trust, on a device you trust, and
          prefer one that holds just the coins you mean to move.
        </Text>
      </Alert>

      {!address ? (
        <Alert status="info" flexDirection="column" alignItems="flex-start" gap={3}>
          <HStack>
            <AlertIcon />
            <Text>Connect the wallet that should receive the wLBC. The sweep pays its deposit address.</Text>
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
        <Box layerStyle="card" p={{ base: 4, md: 6 }}>
          <Stack spacing={2}>
            <Text fontWeight="semibold">Sweeps to your deposit address</Text>
            <Address value={deposit} truncate="mobile" copyable label="deposit address" />
          </Stack>
        </Box>
      )}

      {result ? (
        <Alert status="success" flexDirection="column" alignItems="flex-start" gap={2}>
          <HStack>
            <AlertIcon />
            <Text fontWeight="semibold">Swept {formatLbc(result.value)} LBC</Text>
          </HStack>
          <Text fontSize="sm">
            {result.inputs} coin{result.inputs === 1 ? "" : "s"} moved, {formatLbc(result.fee)} LBC network fee.{" "}
            <Link href={lbcTxUrl(result.txid)} isExternal>
              View the transaction
            </Link>
            .
          </Text>
          {result.remaining > 0 && (
            <Text fontSize="sm">
              {result.remaining} more coin{result.remaining === 1 ? "" : "s"} did not fit in one transaction. Scan and
              sweep again once this one confirms.
            </Text>
          )}
          <Text fontSize="sm">
            Once it has confirmed, mint the wLBC on the{" "}
            <Link as={RouterLink} to="/">
              Wrap page
            </Link>
            .
          </Text>
        </Alert>
      ) : (
        <VStack align="stretch" spacing={3}>
          <Heading as="h2" size="md">
            Your seed, private key or wallet file
          </Heading>
          <Textarea
            value={secret}
            onChange={(e) => {
              reset();
              setFileName("");
              setSecret(e.target.value);
            }}
            placeholder="Seed phrase, private key (WIF), xprv, or the contents of an LBRY wallet file"
            rows={4}
            fontFamily="mono"
            fontSize="sm"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            isDisabled={Boolean(busy)}
            aria-label="Seed, private key or wallet file"
          />
          <HStack spacing={3} flexWrap="wrap">
            <Button as="label" variant="outline" size="sm" cursor="pointer" isDisabled={Boolean(busy)}>
              Choose a wallet file
              <input type="file" accept=".json,application/json,text/plain,*" hidden onChange={onFile} />
            </Button>
            {fileName && <Text fontSize="sm">{fileName}</Text>}
            <Button onClick={onScan} isLoading={busy === "scan"} loadingText="Scanning" isDisabled={!secret.trim() || Boolean(busy)}>
              Scan for coins
            </Button>
            {busy === "scan" && progress > 0 && <Text fontSize="sm">{progress} addresses checked</Text>}
          </HStack>
          <Text textStyle="helper">
            Works with the LBRY desktop app and Odysee seeds, BIP39 phrases, LBC private keys, extended private keys and
            unencrypted LBRY wallet files. Legacy lbrycrd wallet.dat files are not supported.
          </Text>

          {error && (
            <Alert status="error">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {scan && withCoins.length === 0 && (
            <Alert status="info">
              <AlertIcon />
              No coins found in this {scan.kind}. If you expected some, check it is the right seed or key.
            </Alert>
          )}

          {withCoins.map((entry) => {
            const confirmed = entry.coins.filter((c) => c.height > 0);
            return (
              <Box key={entry.source.label} layerStyle="card" p={{ base: 4, md: 5 }}>
                <Stack spacing={3}>
                  <Text fontWeight="semibold">{entry.source.label}</Text>
                  <Text>
                    {formatLbc(entry.total)} LBC in {entry.coins.length} coin{entry.coins.length === 1 ? "" : "s"}
                    {confirmed.length < entry.coins.length && (
                      <Text as="span" textStyle="helper">
                        {" "}
                        ({entry.coins.length - confirmed.length} unconfirmed, left out until they confirm)
                      </Text>
                    )}
                  </Text>
                  <Button
                    alignSelf="flex-start"
                    onClick={() => onSweep(entry)}
                    isLoading={busy === "sweep"}
                    loadingText="Sweeping"
                    isDisabled={!ready || confirmed.length === 0 || Boolean(busy)}
                  >
                    Sweep to my deposit address
                  </Button>
                  {!ready && <Text textStyle="helper">Connect your wallet to enable the sweep.</Text>}
                </Stack>
              </Box>
            );
          })}
        </VStack>
      )}
    </VStack>
  );
}
