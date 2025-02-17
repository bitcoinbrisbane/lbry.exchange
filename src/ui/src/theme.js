import { extendTheme } from '@chakra-ui/react'

const theme = extendTheme({
  colors: {
    brand: {
      // LBRY primary colors
      primary: '#2F9176',     // Green
      secondary: '#333333',   // Dark gray
      tertiary: '#FFD700',    // Gold
      
      // UI colors
      50: '#E6F6F2',
      100: '#B3E4DC',
      200: '#80D2C5',
      300: '#4DC0AE',
      400: '#2F9176',  // Primary green
      500: '#267B64',
      600: '#1D6552',
      700: '#144E3F',
      800: '#0B382D',
      900: '#02221B',
    },
    gray: {
      50: '#F7FAFC',
      100: '#EDF2F7',
      200: '#E2E8F0',
      300: '#CBD5E0',
      400: '#A0AEC0',
      500: '#718096',
      600: '#4A5568',
      700: '#2D3748',
      800: '#1A202C',
      900: '#171923',
    },
  },
  fonts: {
    heading: 'Inter, -apple-system, system-ui, sans-serif',
    body: 'Inter, -apple-system, system-ui, sans-serif',
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 'semibold',
        borderRadius: 'md',
      },
      variants: {
        solid: {
          bg: 'brand.400',
          color: 'white',
          _hover: {
            bg: 'brand.500',
          },
        },
        outline: {
          border: '2px solid',
          borderColor: 'brand.400',
          color: 'brand.400',
          _hover: {
            bg: 'brand.50',
          },
        },
      },
    },
    Link: {
      baseStyle: {
        color: 'brand.400',
        _hover: {
          textDecoration: 'none',
          color: 'brand.500',
        },
      },
    },
  },
  styles: {
    global: {
      body: {
        bg: 'white',
        color: 'gray.800',
      },
    },
  },
})

export default theme 