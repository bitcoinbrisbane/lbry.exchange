import { Box, Text } from "@chakra-ui/react";

/** A labelled figure in a card, with an optional hint under it. */
export function Fact({ label, value, hint }) {
  return (
    <Box layerStyle="card" p={4}>
      <Text textStyle="helper">{label}</Text>
      <Text fontSize="2xl" fontWeight="semibold" mt={1} sx={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Text>
      {hint && (
        <Text textStyle="helper" mt={1}>
          {hint}
        </Text>
      )}
    </Box>
  );
}
