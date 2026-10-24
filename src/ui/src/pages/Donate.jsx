import { Box, Heading, Link, Stack, Text, VStack } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { Address } from "../components/Address";
import { FEE_ADDRESS } from "../config/constants";
import { usePageMeta } from "../hooks/usePageMeta";
import { lbcAddressUrl } from "../lib/contracts";

/** The fee fund: LBC sent here pays the network fee on every unwrap payout. */
export function Donate() {
  usePageMeta({
    title: "Donate LBC for bridge fees | lbc.exchange",
    description:
      "Help keep LBC to wLBC unwraps free: donate LBC to the bridge's fee address, which pays the LBRY network fee on every payout.",
    path: "/donate",
  });
  return (
    <VStack spacing={8} align="stretch">
      <VStack align="stretch" spacing={2}>
        <Heading as="h1" size="xl">
          Donate to the fee fund
        </Heading>
        <Text textStyle="lead">
          Every unwrap pays out the full amount burned. The LBRY network fee comes from this address, so donations keep
          unwraps free for everyone.
        </Text>
      </VStack>

      <Box layerStyle="card" p={{ base: 4, md: 6 }}>
        <Stack direction={{ base: "column", sm: "row" }} spacing={6} align={{ base: "stretch", sm: "center" }}>
          {/* The QR stays dark-on-white in both colour modes so every scanner can read it. */}
          <Box bg="white" p={3} borderRadius="md" borderWidth="1px" borderColor="border.default" alignSelf="center">
            <QRCodeSVG value={FEE_ADDRESS} size={160} title={`QR code for LBC fee address ${FEE_ADDRESS}`} />
          </Box>
          <Stack spacing={3} flex="1" minW={0}>
            <Text fontWeight="semibold">LBC fee address</Text>
            <Address value={FEE_ADDRESS} truncate="mobile" copyable label="fee address" />
            <Link href={lbcAddressUrl(FEE_ADDRESS)} isExternal fontSize="sm" alignSelf="flex-start">
              View balance on explorer
            </Link>
            <Text textStyle="helper">
              Send any amount of LBC. Donations only ever pay network fees: they are not part of the reserves backing
              wLBC and mint nothing.
            </Text>
          </Stack>
        </Stack>
      </Box>
    </VStack>
  );
}
