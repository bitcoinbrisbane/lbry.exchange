import { Button, HStack } from "@chakra-ui/react";
import { useWallet } from "../contexts/WalletContext";
import { Address } from "./Address";

/** Header defaults to a secondary button; the in-page prompt passes variant="solid" size="md". */
export function ConnectWallet({ size = "sm", variant = "outline" }) {
  const { address, isConnecting, connectWallet, disconnectWallet } = useWallet();
  if (!address) {
    return (
      <Button size={size} variant={variant} onClick={connectWallet} isLoading={isConnecting} loadingText="Connecting">
        Connect wallet
      </Button>
    );
  }
  return (
    <HStack spacing={2}>
      <Address value={address} truncate label="wallet address" />
      <Button onClick={disconnectWallet}>Disconnect</Button>
    </HStack>
  );
}
