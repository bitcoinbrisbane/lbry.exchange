import { Box, Link, Stack, Text } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { lbcAddressUrl } from "../lib/contracts";
import { Address } from "./Address";

/** The user's personal LBC deposit address, with QR code and copy. */
export function DepositCard({ depositAddress, minConfirmations, network }) {
  return (
    <Box layerStyle="card" p={{ base: 4, md: 6 }}>
      <Stack direction={{ base: "column", sm: "row" }} spacing={6} align={{ base: "stretch", sm: "center" }}>
        {/* The QR stays dark-on-white in both colour modes so every scanner can read it. */}
        <Box bg="white" p={3} borderRadius="md" borderWidth="1px" borderColor="border.default" alignSelf="center">
          <QRCodeSVG value={depositAddress} size={160} title={`QR code for LBC deposit address ${depositAddress}`} />
        </Box>
        <Stack spacing={3} flex="1" minW={0}>
          <Text fontWeight="semibold">Your LBC deposit address</Text>
          <Address value={depositAddress} copyable label="deposit address" />
          <Link href={lbcAddressUrl(depositAddress)} isExternal fontSize="sm" alignSelf="flex-start">
            View on explorer
          </Link>
          <Text textStyle="helper">
            Send any amount of LBC from any wallet. Every deposit here can only be minted to your connected address.
            After {minConfirmations} confirmations
            {network && network !== "mainnet" ? ` on ${network}` : ""} you can mint wLBC 1:1.
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}
