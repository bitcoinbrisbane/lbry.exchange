import { Heading, Link, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

/** Any unknown path. The static host answers 200, so the page marks itself noindex instead. */
export function NotFound() {
  usePageMeta(useLocation().pathname);
  return (
    <VStack align="stretch" spacing={2}>
      <Heading as="h1" size="xl">
        Page not found
      </Heading>
      <Text textStyle="lead">
        There is no page at this address.{" "}
        <Link as={RouterLink} to="/">
          Wrap LBC
        </Link>{" "}
        or pick a page from the menu.
      </Text>
    </VStack>
  );
}
