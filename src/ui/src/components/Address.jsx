import { Box, HStack, IconButton, Link, Tooltip, useClipboard } from "@chakra-ui/react";
import { shortHash } from "../lib/format";
import { CheckIcon, CopyIcon } from "./icons";

/**
 * Every address and hash in the UI: monospace, in a read-only chip, optionally
 * truncated (full value in the tooltip), linked and copyable.
 */
export function Address({ value, truncate = false, copyable = false, href, label = "address", fontSize = "sm" }) {
  const { onCopy, hasCopied } = useClipboard(value || "");
  if (!value) return null;
  const text = truncate ? shortHash(value, 6, 4) : value;
  return (
    <HStack
      as="span"
      display="inline-flex"
      layerStyle="chip"
      spacing={0}
      pl={2}
      pr={copyable ? 0 : 2}
      maxW="100%"
      alignSelf="flex-start"
      minH={copyable ? 8 : 6}
      align="center"
    >
      <Box as="span" fontFamily="mono" fontSize={fontSize} wordBreak="break-all" py={1} title={value}>
        {href ? (
          <Link href={href} isExternal aria-label={`${label} ${value} (opens in a new tab)`}>
            {text}
          </Link>
        ) : (
          text
        )}
      </Box>
      {copyable && (
        <Tooltip label={hasCopied ? "Copied" : `Copy ${label}`} closeOnClick={false} hasArrow>
          <IconButton
            variant="ghost"
            aria-label={hasCopied ? "Copied" : `Copy ${label}`}
            icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
            onClick={onCopy}
            flexShrink={0}
          />
        </Tooltip>
      )}
    </HStack>
  );
}
