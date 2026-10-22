import { Container } from "@chakra-ui/react";

/** The one content column: the header and every page share it, so their edges line up. */
export function PageContainer({ children, ...props }) {
  return (
    <Container maxW="4xl" px={{ base: 4, md: 6 }} {...props}>
      {children}
    </Container>
  );
}
