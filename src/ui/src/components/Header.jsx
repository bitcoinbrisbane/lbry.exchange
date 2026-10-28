import { Box, Flex, HStack, IconButton, Link, useColorMode } from "@chakra-ui/react";
import { NavLink, Link as RouterLink } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { GitHubIcon, MoonIcon, SunIcon } from "./icons";
import { Logo } from "./Logo";
import { PageContainer } from "./PageContainer";

export function Header() {
  const { colorMode, toggleColorMode } = useColorMode();
  const next = colorMode === "dark" ? "light" : "dark";

  return (
    <Box
      as="header"
      bg="bg.surface"
      borderBottomWidth="1px"
      borderColor="border.default"
      py={3}
      position="sticky"
      top={0}
      zIndex={10}
    >
      <PageContainer>
        <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
          <Link as={RouterLink} to="/" aria-label="LBC Exchange home" _hover={{ textDecoration: "none" }}>
            <Logo />
          </Link>

          <Flex as="nav" aria-label="Main" align="center" wrap="wrap" gap={{ base: 3, md: 5 }}>
            {/* NavLink sets aria-current="page" on the active route; the nav variant styles it. */}
            <Link as={NavLink} to="/" end variant="nav">
              Wrap
            </Link>
            <Link as={NavLink} to="/unwrap" variant="nav">
              Unwrap
            </Link>
            <Link as={NavLink} to="/trade" variant="nav">
              Trade
            </Link>
            <Link as={NavLink} to="/verify" variant="nav">
              Verify
            </Link>
            <Link as={NavLink} to="/donate" variant="nav">
              Donate
            </Link>
            <Link href="https://lbry.com" isExternal variant="nav">
              LBRY.com
            </Link>
            <HStack spacing={2}>
              <IconButton
                as="a"
                href="https://github.com/bitcoinbrisbane/lbry.exchange"
                target="_blank"
                rel="noopener noreferrer"
                variant="ghost"
                aria-label="Source code on GitHub (opens in a new tab)"
                icon={<GitHubIcon />}
              />
              <IconButton
                variant="ghost"
                aria-label={`Switch to ${next} mode`}
                icon={colorMode === "dark" ? <SunIcon /> : <MoonIcon />}
                onClick={toggleColorMode}
              />
              <ConnectWallet />
            </HStack>
          </Flex>
        </Flex>
      </PageContainer>
    </Box>
  );
}
