import { Button, HStack, Text, Tooltip } from "@chakra-ui/react";
import { useWallet } from "../contexts/WalletContext";
import { shortHash } from "../lib/format";

export function ConnectWallet({ size = "sm" }) {
	const { address, isConnecting, connectWallet, disconnectWallet } = useWallet();
	if (!address) {
		return (
			<Button size={size} onClick={connectWallet} isLoading={isConnecting} loadingText="Connecting">
				Connect wallet
			</Button>
		);
	}
	return (
		<HStack spacing={2}>
			<Tooltip label={address}>
				<Text fontFamily="mono" fontSize="sm">
					{shortHash(address)}
				</Text>
			</Tooltip>
			<Button size={size} variant="outline" onClick={disconnectWallet}>
				Disconnect
			</Button>
		</HStack>
	);
}
