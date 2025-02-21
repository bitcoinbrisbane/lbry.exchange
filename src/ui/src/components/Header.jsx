import {
  Box,
  Flex,
  Text,
  Image,
  Link,
  HStack,
  useColorModeValue
} from '@chakra-ui/react'


export function Header() {
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  return (
    <Box
      as="header"
      bg={bgColor}
      borderBottom="1px"
      borderColor={borderColor}
      py={4}
      px={[4, 8]}
      position="sticky"
      top={0}
      zIndex={10}
    >
      <Flex
        maxW="container.xl"
        mx="auto"
        justify="space-between"
        align="center"
        direction={['column', 'row']}
        gap={[4, 0]}
      >
        <Link href="/" _hover={{ textDecoration: 'none' }}>
          <HStack spacing={3}>
            <Image
              src="https://lbry.com/img/logo.svg"
              alt="LBRY"
              h={["24px", "32px"]}
            />
            <Text
              fontSize={["xl", "2xl"]}
              fontWeight="bold"
              bgGradient="linear(to-r, brand.500, brand.800)"
              bgClip="text"
            >
              Exchange
            </Text>
          </HStack>
        </Link>

        <HStack spacing={[3, 6]}>
          <Link 
            href="https://lbry.com"
            isExternal
            fontSize={["xs", "sm"]}
            fontWeight="medium"
          >
            LBRY.com
          </Link>
          <Link 
            href="https://odysee.com"
            isExternal
            fontSize={["xs", "sm"]}
            fontWeight="medium"
          >
            Odysee
          </Link>
          <Link 
            href="https://lbry.tech"
            isExternal
            fontSize={["xs", "sm"]}
            fontWeight="medium"
          >
            Developers
          </Link>
        </HStack>
      </Flex>
    </Box>
  )
} 