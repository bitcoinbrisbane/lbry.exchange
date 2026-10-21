import { Box, Button, Code, HStack, Link, Stack, Text, useClipboard, useColorModeValue } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { lbcAddressUrl } from "../lib/contracts";

/** The user's personal LBC deposit address, with QR code and copy button. */
export function DepositCard({ depositAddress, minConfirmations, network }) {
  const { onCopy, hasCopied } = useClipboard(depositAddress || "");
  const bg = useColorModeValue("gray.50", "gray.700");

  return (
    <Box bg={bg} p={6} borderRadius="lg">
      <Stack direction={["column", "row"]} spacing={6} align="center">
        <Box bg="white" p={3} borderRadius="md">
          <QRCodeSVG value={depositAddress} size={160} />
        </Box>
        <Stack spacing={3} flex="1" minW={0}>
          <Text fontWeight="semibold">Your LBC deposit address</Text>
          <Code p={2} fontSize="sm" wordBreak="break-all" borderRadius="md">
            {depositAddress}
          </Code>
          <HStack>
            <Button size="sm" onClick={onCopy}>
              {hasCopied ? "Copied" : "Copy"}
            </Button>
            <Link href={lbcAddressUrl(depositAddress)} isExternal fontSize="sm">
              View on explorer
            </Link>
          </HStack>
          <Text fontSize="sm" color="gray.500">
            Send any amount of LBC from any wallet. Every deposit here can only be minted to your connected address.
            After {minConfirmations} confirmations
            {network && network !== "mainnet" ? ` on ${network}` : ""} you can mint wLBC 1:1.
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}
