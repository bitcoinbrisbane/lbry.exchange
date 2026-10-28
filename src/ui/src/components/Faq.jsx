import { Box, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { FAQ } from "../config/faq";

/** Common questions, visible on the page so they match the FAQPage structured data built from the same list. */
export function Faq() {
  return (
    <Box as="section" aria-labelledby="faq-heading" layerStyle="card" p={{ base: 4, md: 6 }}>
      <Heading id="faq-heading" as="h2" size="md" mb={4}>
        Questions
      </Heading>
      <Stack spacing={5}>
        {FAQ.map(({ question, answer, link }) => (
          <Box key={question}>
            <Heading as="h3" size="sm" mb={1}>
              {question}
            </Heading>
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
