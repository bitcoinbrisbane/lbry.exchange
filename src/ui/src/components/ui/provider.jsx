import { ChakraProvider } from "@chakra-ui/react"
import theme from '../../theme'

export function Provider({ children }) {
  return (
    <ChakraProvider theme={theme}>
      {children}
    </ChakraProvider>
  )
} 