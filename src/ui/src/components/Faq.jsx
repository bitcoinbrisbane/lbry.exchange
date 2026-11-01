import { Box, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { ethers } from "ethers";
import { useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import { WLBC_ADDRESS } from "../config/constants";
import { FAQ } from "../config/faq";
import { usePolling } from "../hooks/usePolling";
import { getReadProvider, TOKEN_ABI } from "../lib/contracts";
import { formatLbc } from "../lib/format";

const SUPPLY_POLL_MS = 60_000;

/** Live totalSupply() of the wLBC token, read straight from Ethereum. */
function useTotalSupply(enabled) {
  const fetchSupply = useCallback(async () => {
    const provider = getReadProvider();
    if (!provider) throw new Error("No Ethereum RPC configured");
    return new ethers.Contract(WLBC_ADDRESS, TOKEN_ABI, provider).totalSupply();
  }, []);
  return usePolling(fetchSupply, SUPPLY_POLL_MS, enabled, [fetchSupply]).data;
}

/** Common questions, visible on the page so they match the FAQPage structured data built from the same list. */
export function Faq() {
  const supply = useTotalSupply(FAQ.some((f) => f.liveSupply));
  return (
    <Box as="section" aria-labelledby="faq-heading" layerStyle="card" p={{ base: 4, md: 6 }}>
      <Heading id="faq-heading" as="h2" size="md" mb={4}>
        Questions
      </Heading>
      <Stack spacing={5}>
        {FAQ.map(({ question, answer, link, liveSupply }) => (
          <Box key={question}>
            <Heading as="h3" size="sm" mb={1}>
              {question}
            </Heading>
            {/* Until it loads, or if it can't, the static answer stands on its own. */}
            {liveSupply && supply != null && (
              <Text fontSize="lg" mb={1}>
                <Text as="strong" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatLbc(supply)} wLBC
                </Text>{" "}
                in circulation right now.
              </Text>
            )}
            {/* overflowWrap lets the 42-character contract addresses break on narrow screens. */}
            <Text overflowWrap="anywhere">{answer}</Text>
            {link && (
              <Link as={RouterLink} to={link.to} fontSize="sm">
                {link.label}
              </Link>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
