import { ChakraProvider } from "@chakra-ui/react"
import theme from '../../theme'
import { WalletProvider } from "../../contexts/WalletContext"

export function Provider({ children }) {
  return (
    <ChakraProvider theme={theme}>
      <WalletProvider>
        {children}
      </WalletProvider>
    </ChakraProvider>
  )
} 