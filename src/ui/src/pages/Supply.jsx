import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useToast,
} from "@chakra-ui/react";
import { ethers } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Address } from "../components/Address";
import { ConnectWallet } from "../components/ConnectWallet";
import { Fact } from "../components/Fact";
import { UNISWAP_V4 as V4 } from "../config/constants";
import { useWallet } from "../contexts/WalletContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { usePolling } from "../hooks/usePolling";
import { ethContractUrl, ethTxUrl, getReadProvider, getSigner } from "../lib/contracts";
import { amountsForLiquidity, encodeMint, liquidityForAmounts, poolId, priceAtTick, rangeTicks } from "../lib/univ4";

const { wlbc: WLBC, usdt: USDT } = V4;
const TOKENS = { wlbc: WLBC, usdt: USDT };
const POLL_MS = 30_000;
const SLIPPAGE_BPS = 100n; // a range spanning the price may take up to 1% more of either side
const DEADLINE_SECONDS = 20 * 60;
const PERMIT2_EXPIRY_SECONDS = 60 * 60; // the Permit2 allowance lapses after an hour
// A wrong address in the pool key would mint into some other pool; refuse rather than guess.
const POOL_KEY_OK = poolId(V4.poolKey) === V4.poolId;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // No `returns`: USDT's approve returns nothing, and the result isn't read.
  "function approve(address spender, uint256 amount)",
];
const PERMIT2_ABI = [
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
];
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
];
const POSITION_MANAGER_ABI = [
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
  "event Transfer(address indexed from, address indexed to, uint256 indexed id)",
];

// Multiples of the current price. The one-sided presets keep clear of the current tick so they stay one-sided.
const PRESETS = [
  { label: "±10%", lo: 0.9, hi: 1.1 },
  { label: "±25%", lo: 0.75, hi: 1.25 },
  { label: "±50%", lo: 0.5, hi: 1.5 },
  { label: "Above price", lo: 1.01, hi: 2 },
  { label: "Below price", lo: 0.5, hi: 0.99 },
];
const DEFAULT_PRESET = PRESETS[1];

const SIDE_TEXT = {
  both: "This range spans the current price, so it takes both tokens in the ratio the price sets. Enter either amount and the other is worked out. It earns fees while the price stays inside the range.",
  above:
    "This range is above the current price, so it takes wLBC only. It starts earning fees when the price rises into the range, selling your wLBC for USDT as it goes.",
  below:
    "This range is below the current price, so it takes USDT only. It starts earning fees when the price falls into the range, buying wLBC with your USDT as it goes.",
};

const STEP_BADGE = {
  waiting: { label: "Waiting", color: "gray" },
  wallet: { label: "Confirm in your wallet", color: "blue" },
  pending: { label: "Confirming", color: "yellow" },
  done: { label: "Done", color: "green" },
  failed: { label: "Failed", color: "red" },
};

/** USDT per wLBC from the pool's sqrt price. */
const spotPrice = (sqrtPriceX96) => (Number(sqrtPriceX96) / 2 ** 96) ** 2 * 10 ** (WLBC.decimals - USDT.decimals);
const tickPrice = (tick) => priceAtTick(tick, WLBC, USDT);
/** A price to put in an input: 4 significant figures, never in exponent form. */
const priceInput = (x) => x.toLocaleString("en-US", { maximumSignificantDigits: 4, useGrouping: false });
const showPrice = (x) => x.toLocaleString("en-US", { maximumSignificantDigits: 6 });
/** "+25%" / "−10%": how far `price` is from `spot`. */
const fromSpot = (price, spot) => {
  const pct = Math.round((price / spot - 1) * 100);
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${-pct}%` : "0%";
};

/** "0.0004", ".0004" or "1,000.5" as the decimal string the math takes; null when it isn't one. */
function cleanDecimal(text) {
  let s = String(text).trim().replace(/,/g, "");
  if (s.startsWith(".")) s = `0${s}`;
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

/** Raw units from a typed amount; null when blank or not a number with at most the token's decimals. */
function parseAmount(text, token) {
  const s = cleanDecimal(text);
  if (!s || (s.split(".")[1] ?? "").length > token.decimals) return null;
  return ethers.parseUnits(s, token.decimals);
}

/** Raw units as a plain decimal for an input. */
function inputAmount(raw, token) {
  return ethers.formatUnits(raw, token.decimals).replace(/\.0$/, "");
}

/** Raw units for reading: grouped, at most `maxDecimals` places, with the symbol. */
function showAmount(raw, token, maxDecimals = 6) {
  const [whole, frac = ""] = ethers.formatUnits(raw, token.decimals).split(".");
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("en-US")}${trimmed ? "." + trimmed : ""} ${token.symbol}`;
}

const sentence = (message) => {
  const s = String(message);
  return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
};

function errorText(err) {
  if (err?.code === "ACTION_REJECTED" || err?.info?.error?.code === 4001)
    return "You rejected the request in your wallet.";
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

async function readPool() {
  const provider = getReadProvider();
  if (!provider) throw new Error("No Ethereum connection to read the pool from");
  const view = new ethers.Contract(V4.stateView, STATE_VIEW_ABI, provider);
  const { sqrtPriceX96, tick } = await view.getSlot0(V4.poolId);
  if (sqrtPriceX96 === 0n) throw new Error("The pool is not initialized");
  return { sqrtPriceX96, tick: Number(tick) };
}

/**
 * What a position over `ticks` costs at `pool`'s price, sized by the amount typed on the `edited` side. A range
 * off to one side of the price takes only that side's token, whichever was typed. Same math as
 * scripts/add-v4-position.js.
 */
function buildPlan(pool, ticks, edited, texts) {
  const { tickLower, tickUpper } = ticks;
  const side = pool.tick < tickLower ? "above" : pool.tick >= tickUpper ? "below" : "both";
  const source = side === "above" ? "wlbc" : side === "below" ? "usdt" : edited;
  const raw = parseAmount(texts[source], TOKENS[source]);
  if (raw == null || raw === 0n) return { side, source };
  const liquidity = liquidityForAmounts(
    pool.sqrtPriceX96,
    tickLower,
    tickUpper,
    source === "wlbc" ? raw : null,
    source === "usdt" ? raw : null,
  );
  if (liquidity === 0n) return { side, source, error: "That amount is too small to add any liquidity." };
  const { amount0, amount1 } = amountsForLiquidity(pool.sqrtPriceX96, pool.tick, tickLower, tickUpper, liquidity);
  return { side, source, liquidity, amount0, amount1 };
}

function AmountField({ token, value, onChange, onMax, balance, needed, over }) {
  return (
    <FormControl isDisabled={!needed} isInvalid={over}>
      <FormLabel>{token.symbol}</FormLabel>
      <InputGroup>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={needed ? "0.0" : "Not used by this range"}
          inputMode="decimal"
          pr="4.5rem"
        />
        <InputRightElement w="auto" pr={1}>
          <Button variant="ghost" size="sm" onClick={onMax} isDisabled={!needed || balance == null}>
            Max
          </Button>
        </InputRightElement>
      </InputGroup>
      <FormHelperText>Balance: {balance != null ? showAmount(balance, token, token.decimals) : "—"}</FormHelperText>
      <FormErrorMessage>More than you hold</FormErrorMessage>
    </FormControl>
  );
}

/** Add liquidity to the wLBC/USDT Uniswap V4 pool from the connected wallet, over a chosen price range. */
export function Supply() {
  usePageMeta("/supply");
  const { address, walletProvider, ensureChain } = useWallet();
  const toast = useToast();
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [preset, setPreset] = useState(null);
  const [texts, setTexts] = useState({ wlbc: "", usdt: "" });
  const [edited, setEdited] = useState("usdt");
  const [balances, setBalances] = useState(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);

  const { data: pool, error: poolError } = usePolling(readPool, POLL_MS, POOL_KEY_OK, []);

  const applyPreset = useCallback(
    (p) => {
      if (!pool) return;
      const spot = spotPrice(pool.sqrtPriceX96);
      setMinPrice(priceInput(spot * p.lo));
      setMaxPrice(priceInput(spot * p.hi));
      setPreset(p.label);
    },
    [pool],
  );

  // Start from the default preset once the price is first known.
  const seeded = useRef(false);
  useEffect(() => {
    if (!pool || seeded.current) return;
    seeded.current = true;
    applyPreset(DEFAULT_PRESET);
  }, [pool, applyPreset]);

  const fetchBalances = useCallback(async () => {
    const provider = getReadProvider();
    if (!provider || !address) return null;
    const [wlbc, usdt] = await Promise.all(
      [WLBC, USDT].map((t) => new ethers.Contract(t.address, ERC20_ABI, provider).balanceOf(address)),
    );
    return { wlbc, usdt };
  }, [address]);
  useEffect(() => {
    setBalances(null);
    if (!address) return;
    fetchBalances()
      .then(setBalances)
      .catch(() => setBalances(null));
  }, [address, fetchBalances]);

  const range = useMemo(() => {
    const min = cleanDecimal(minPrice);
    const max = cleanDecimal(maxPrice);
    if (!min || !max) return { error: minPrice && maxPrice ? "Enter prices as plain numbers, like 0.0005." : null };
    try {
      return { ticks: rangeTicks(WLBC, USDT, min, max, V4.poolKey.tickSpacing) };
    } catch (err) {
      return { error: sentence(err.message) };
    }
  }, [minPrice, maxPrice]);

  const plan = useMemo(() => {
    if (!pool || !range.ticks) return null;
    try {
      return buildPlan(pool, range.ticks, edited, texts);
    } catch (err) {
      return { error: sentence(err.message) };
    }
  }, [pool, range, edited, texts]);

  const needs = (key) => !plan?.side || (key === "wlbc" ? plan.side !== "below" : plan.side !== "above");
  // The typed side shows what was typed; the other side shows what the range needs for it.
  const valueFor = (key) => {
    if (!needs(key)) return "";
    if (!plan?.side || key === plan.source) return texts[key];
    const raw = key === "wlbc" ? plan.amount0 : plan.amount1;
    return raw != null ? inputAmount(raw, TOKENS[key]) : "";
  };
  // Typing one side clears the other, so a stale figure can't size a later range.
  const typeAmount = (key) => (value) => {
    setTexts({ wlbc: "", usdt: "", [key]: value });
    setEdited(key);
  };
  const maxAmount = (key) => () => {
    if (!balances) return;
    typeAmount(key)(inputAmount(balances[key], TOKENS[key]));
  };

  const over0 = Boolean(plan?.liquidity && balances && plan.amount0 > balances.wlbc);
  const over1 = Boolean(plan?.liquidity && balances && plan.amount1 > balances.usdt);
  const canSubmit = Boolean(address && plan?.liquidity && !over0 && !over1 && !busy && POOL_KEY_OK);

  const markStep = (i, patch) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async () => {
    setBusy(true);
    setResult(null);
    setSteps([]);
    let current = -1;
    try {
      await ensureChain(V4.chainId);
      const signer = await getSigner(walletProvider);
      const read = getReadProvider();

      // Rebuild the plan at the latest price, so the amounts are what the pool takes now.
      const fresh = await readPool();
      const p = buildPlan(fresh, range.ticks, edited, texts);
      if (!p.liquidity) throw new Error(p.error || "Enter an amount to supply");
      const [balance0, balance1] = await Promise.all(
        [WLBC, USDT].map((t) => new ethers.Contract(t.address, ERC20_ABI, read).balanceOf(address)),
      );
      if (p.amount0 > balance0 || p.amount1 > balance1) throw new Error("The price moved: you now hold too little");

      // Out of range the cost is fixed until the price enters the range. In range, allow for the price moving
      // before the transaction lands, within the balance.
      const inRange = p.side === "both";
      const withSlippage = (amount, balance) => {
        if (!inRange || amount === 0n) return amount;
        const padded = amount + (amount * SLIPPAGE_BPS) / 10_000n;
        return padded < balance ? padded : balance;
      };
      const amount0Max = withSlippage(p.amount0, balance0);
      const amount1Max = withSlippage(p.amount1, balance1);

      // Tokens -> Permit2 (ERC-20 allowance) -> position manager (Permit2 allowance, with expiry), skipping
      // whatever is already in place, then the mint. The same route as the Uniswap app and the script.
      const permit2Read = new ethers.Contract(V4.permit2, PERMIT2_ABI, read);
      const permit2 = new ethers.Contract(V4.permit2, PERMIT2_ABI, signer);
      const now = (await read.getBlock("latest")).timestamp;
      const queue = [];
      for (const [token, max] of [
        [WLBC, amount0Max],
        [USDT, amount1Max],
      ]) {
        if (max === 0n) continue;
        const erc20 = new ethers.Contract(token.address, ERC20_ABI, signer);
        const allowance = await new ethers.Contract(token.address, ERC20_ABI, read).allowance(address, V4.permit2);
        if (allowance < max) {
          // USDT reverts when an allowance moves from one non-zero value to another.
          if (allowance > 0n && token === USDT) {
            queue.push({
              label: "Reset the USDT allowance to 0 (USDT requires it)",
              run: () => erc20.approve(V4.permit2, 0n),
            });
          }
          queue.push({
            label: `Approve ${showAmount(max, token)} for Permit2`,
            run: () => erc20.approve(V4.permit2, max),
          });
        }
        const granted = await permit2Read.allowance(address, token.address, V4.positionManager);
        if (granted.amount < max || Number(granted.expiration) < now + DEADLINE_SECONDS) {
          queue.push({
            label: `Let the Uniswap position manager spend that ${token.symbol}`,
            run: () => permit2.approve(token.address, V4.positionManager, max, now + PERMIT2_EXPIRY_SECONDS),
          });
        }
      }
      const manager = new ethers.Contract(V4.positionManager, POSITION_MANAGER_ABI, signer);
      const { tickLower, tickUpper } = range.ticks;
      const unlockData = encodeMint({
        key: V4.poolKey,
        tickLower,
        tickUpper,
        liquidity: p.liquidity,
        amount0Max,
        amount1Max,
        owner: address,
      });
      queue.push({
        label: "Create the position",
        run: async () => {
          const deadline = (await read.getBlock("latest")).timestamp + DEADLINE_SECONDS;
          return manager.modifyLiquidities(unlockData, deadline);
        },
      });
      setSteps(queue.map(({ label }) => ({ label, status: "waiting" })));

      let receipt;
      for (const [i, step] of queue.entries()) {
        current = i;
        markStep(i, { status: "wallet" });
        const tx = await step.run();
        markStep(i, { status: "pending", hash: tx.hash });
        receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("The transaction reverted");
        markStep(i, { status: "done" });
      }
      current = -1;

      const minted = receipt.logs
        .filter((log) => log.address.toLowerCase() === V4.positionManager.toLowerCase())
        .map((log) => manager.interface.parseLog(log))
        .find((parsed) => parsed?.name === "Transfer" && parsed.args.from === ethers.ZeroAddress);
      setResult({
        id: minted?.args.id?.toString() ?? null,
        hash: receipt.hash,
        amount0: p.amount0,
        amount1: p.amount1,
      });
      setTexts({ wlbc: "", usdt: "" });
      fetchBalances()
        .then(setBalances)
        .catch(() => null);
      toast({ title: "Position created", status: "success", duration: 8000, isClosable: true });
    } catch (err) {
      if (current >= 0) markStep(current, { status: "failed" });
      toast({
        title: "Supply failed",
        description: errorText(err),
        status: "error",
        duration: 10000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const spot = pool ? spotPrice(pool.sqrtPriceX96) : null;

  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Supply liquidity
        </Heading>
        <Text textStyle="lead">
          Add wLBC and USDT to the Uniswap V4 pool over a price range you choose. You earn the 0.25% fee on trades while
          the price is in your range, and you get a position NFT to manage or withdraw on Uniswap.
        </Text>
      </VStack>

      {!POOL_KEY_OK && (
        <Alert status="error">
          <AlertIcon />
          This build&apos;s pool settings don&apos;t match the wLBC/USDT pool, so supplying is turned off.
        </Alert>
      )}
      {poolError && (
        <Alert status="warning">
          <AlertIcon />
          Couldn&apos;t read the pool: {poolError}
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        <Fact label="Current price" value={spot ? showPrice(spot) : "…"} hint="USDT per wLBC" />
        <Fact
          label="Inverse"
          value={spot ? (1 / spot).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "…"}
          hint="wLBC per USDT"
        />
        <Fact label="Fee tier" value="0.25%" hint="Uniswap V4, Ethereum" />
      </SimpleGrid>

      <Stack spacing={8} layerStyle="card" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Heading as="h2" size="md">
            Price range
          </Heading>
          <Wrap spacing={2}>
            {PRESETS.map((p) => (
              <WrapItem key={p.label}>
                <Button
                  size="sm"
                  variant={preset === p.label ? "solid" : "outline"}
                  onClick={() => applyPreset(p)}
                  isDisabled={!pool}
                  aria-pressed={preset === p.label}
                >
                  {p.label}
                </Button>
              </WrapItem>
            ))}
          </Wrap>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {[
              ["Min price", minPrice, setMinPrice],
              ["Max price", maxPrice, setMaxPrice],
            ].map(([label, value, set]) => (
              <FormControl key={label} isInvalid={Boolean(range.error)}>
                <FormLabel>{label}</FormLabel>
                <InputGroup>
                  <Input
                    value={value}
                    onChange={(e) => {
                      set(e.target.value);
                      setPreset(null);
                    }}
                    placeholder="0.0005"
                    inputMode="decimal"
                    pr="7rem"
                  />
                  <InputRightElement w="auto" pr={3} pointerEvents="none">
                    <Text textStyle="helper">USDT per wLBC</Text>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            ))}
          </SimpleGrid>
          {range.error ? (
            <Text fontSize="sm" color="red.600" _dark={{ color: "red.300" }}>
              {range.error}
            </Text>
          ) : (
            range.ticks && (
              <Text textStyle="helper">
                Widened to the pool&apos;s tick spacing: {showPrice(tickPrice(range.ticks.tickLower))} to{" "}
                {showPrice(tickPrice(range.ticks.tickUpper))} USDT per wLBC
                {spot &&
                  ` (${fromSpot(tickPrice(range.ticks.tickLower), spot)} to ${fromSpot(tickPrice(range.ticks.tickUpper), spot)} from the current price)`}
                .
              </Text>
            )
          )}
          {plan?.side && (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <AlertDescription fontSize="sm">{SIDE_TEXT[plan.side]}</AlertDescription>
            </Alert>
          )}
        </Stack>

        <Stack spacing={4}>
          <Heading as="h2" size="md">
            Amounts
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <AmountField
              token={WLBC}
              value={valueFor("wlbc")}
              onChange={typeAmount("wlbc")}
              onMax={maxAmount("wlbc")}
              balance={balances?.wlbc}
              needed={needs("wlbc")}
              over={over0}
            />
            <AmountField
              token={USDT}
              value={valueFor("usdt")}
              onChange={typeAmount("usdt")}
              onMax={maxAmount("usdt")}
              balance={balances?.usdt}
              needed={needs("usdt")}
              over={over1}
            />
          </SimpleGrid>
          {plan?.error && (
            <Text fontSize="sm" color="red.600" _dark={{ color: "red.300" }}>
              {plan.error}
            </Text>
          )}
        </Stack>

        <Stack spacing={4}>
          {plan?.liquidity && (
            <Box layerStyle="chip" p={4}>
              <Text textStyle="helper">You deposit</Text>
              <Text fontSize="lg" fontWeight="semibold" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {[
                  plan.amount0 > 0n && showAmount(plan.amount0, WLBC),
                  plan.amount1 > 0n && showAmount(plan.amount1, USDT),
                ]
                  .filter(Boolean)
                  .join(" + ")}
              </Text>
              {plan.side === "both" && (
                <Text textStyle="helper" mt={1}>
                  If the price moves before your transaction lands, up to 1% more of either token may be taken.
                </Text>
              )}
            </Box>
          )}
          {address ? (
            <Button
              variant="solid"
              size="md"
              onClick={submit}
              isDisabled={!canSubmit}
              isLoading={busy}
              loadingText="Supplying"
            >
              Supply liquidity
            </Button>
          ) : (
            <Stack spacing={2} align="flex-start">
              <ConnectWallet variant="solid" size="md" />
              <Text textStyle="helper">Connect the wallet holding the wLBC or USDT you want to supply.</Text>
            </Stack>
          )}
          <Text textStyle="helper">
            Your wallet asks you to approve each token through Permit2, as the Uniswap app does, and then to create the
            position. That&apos;s up to five transactions the first time, fewer once approvals are in place.
          </Text>
        </Stack>

        {steps.length > 0 && (
          <Stack spacing={3}>
            <Heading as="h2" size="sm">
              Transactions
            </Heading>
            {steps.map((s, i) => {
              const badge = STEP_BADGE[s.status];
              return (
                <HStack key={s.label} justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <HStack spacing={3}>
                    <Text textStyle="helper" w={4}>
                      {i + 1}.
                    </Text>
                    <Text fontSize="sm">{s.label}</Text>
                  </HStack>
                  <HStack spacing={2}>
                    {s.hash && (
                      <Link href={ethTxUrl(V4.chainId, s.hash)} isExternal fontSize="sm">
                        Etherscan
                      </Link>
                    )}
                    {(s.status === "wallet" || s.status === "pending") && <Spinner size="xs" />}
                    <Badge colorScheme={badge.color}>{badge.label}</Badge>
                  </HStack>
                </HStack>
              );
            })}
          </Stack>
        )}

        {result && (
          <Alert status="success" flexDirection="column" alignItems="flex-start" gap={3} borderRadius="md">
            <HStack>
              <AlertIcon />
              <Text fontWeight="semibold">{result.id ? `Position #${result.id} created` : "Position created"}</Text>
            </HStack>
            <Text fontSize="sm">
              It holds{" "}
              {[
                result.amount0 > 0n && showAmount(result.amount0, WLBC),
                result.amount1 > 0n && showAmount(result.amount1, USDT),
              ]
                .filter(Boolean)
                .join(" and ")}
              . Collect fees, add to it or withdraw on Uniswap.
            </Text>
            <HStack spacing={3} flexWrap="wrap">
              {result.id && (
                <Button
                  as="a"
                  href={V4.positionUrl(result.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                  variant="solid"
                >
                  View on Uniswap
                </Button>
              )}
              <Button
                as="a"
                href={ethTxUrl(V4.chainId, result.hash)}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                variant="outline"
              >
                Transaction
              </Button>
            </HStack>
          </Alert>
        )}
      </Stack>

      <Box layerStyle="card" p={{ base: 4, md: 6 }}>
        <Stack spacing={4}>
          <Heading as="h2" size="md">
            Contracts
          </Heading>
          <Text textStyle="helper">
            Check these against what your wallet shows before approving anything. Your positions are listed on{" "}
            <Link href="https://app.uniswap.org/positions" isExternal>
              Uniswap
            </Link>
            .
          </Text>
          {[
            ["Pool ID (wLBC/USDT 0.25%)", V4.poolId, null],
            ["Position manager", V4.positionManager, ethContractUrl(V4.chainId, V4.positionManager)],
            ["Permit2", V4.permit2, ethContractUrl(V4.chainId, V4.permit2)],
            ["wLBC", WLBC.address, ethContractUrl(V4.chainId, WLBC.address)],
            ["USDT", USDT.address, ethContractUrl(V4.chainId, USDT.address)],
          ].map(([label, value, href]) => (
            <Stack key={label} spacing={1}>
              <Text textStyle="helper">{label}</Text>
              <Address value={value} truncate="mobile" copyable href={href || undefined} label={label} fontSize="xs" />
            </Stack>
          ))}
        </Stack>
      </Box>
    </VStack>
  );
}

export default Supply;
