import { Box, HStack, Text } from "@chakra-ui/react";
import logoUrl from "../assets/lbry-logo.svg";

// Vite inlines this small SVG as a data: URI, so the url() must be quoted to stay valid CSS.
const mask = {
  maskImage: `url("${logoUrl}")`,
  WebkitMaskImage: `url("${logoUrl}")`,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
};

/** LBRY mark (bundled, tinted through a mask) and the "Exchange" wordmark in the same accent colour. */
export function Logo() {
  return (
    <HStack spacing={3}>
      <Box aria-hidden="true" h={["24px", "32px"]} w={["31px", "41px"]} bg="accent.fg" style={mask} />
      <Text as="span" fontSize={["xl", "2xl"]} fontWeight="bold" color="accent.fg" letterSpacing="tight">
        Exchange
      </Text>
    </HStack>
  );
}
