import { Button, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

/** "Checked 12s ago · every 30s" with a manual refresh, so polling is visible. */
export function LastChecked({ updatedAt, intervalMs, loading, onRefresh }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const ago = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  return (
    <HStack spacing={3}>
      <Text textStyle="helper" aria-live="polite">
        {loading ? "Checking…" : ago == null ? "Not checked yet" : `Checked ${ago}s ago`} · every{" "}
        {Math.round(intervalMs / 1000)}s
      </Text>
      <Button onClick={onRefresh} isLoading={loading}>
        Refresh
      </Button>
    </HStack>
  );
}
