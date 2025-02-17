"use client";

import {
  Box,
  Button,
  Container,
  Heading,
  Input,
  Stack,
  Alert,
  VStack,
  HStack,
} from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { useState } from "react";

// Create a Field component since we don't have access to @/components/ui/field
const Field = ({ label, children, invalid, errorText, required }) => (
  <Box>
    <Box as="label" display="block" mb="2" fontWeight="medium">
      {label}
      {required && (
        <Box as="span" color="red.500">
          *
        </Box>
      )}
    </Box>
    {children}
    {invalid && errorText && (
      <Box color="red.500" fontSize="sm" mt="1">
        {errorText}
      </Box>
    )}
  </Box>
);

function App() {
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      lbcAddress: "",
      quantity: "",
    },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:3000/orders/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          LBC_Address: data.lbcAddress,
          quantity: Number(data.quantity),
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        setAlert({
          status: "success",
          message: `Order created. You need to send ${responseData.usdcNeeded.toFixed(2)} USDC`,
        });
      } else {
        throw new Error(responseData.error);
      }
    } catch (error) {
      setAlert({
        status: "error",
        message: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    // <div>
    //   <HStack>
    //     <Button>Click me</Button>
    //     <Button>Click me</Button>
    //   </HStack>
    // </div>
    <Container py="10">
      <VStack gap="8">
        <Heading>Buy LBC</Heading>

        {alert && (
          <Alert status={alert.status}>
            {alert.message}
          </Alert>
        )}

        <Box as="form" w="full" onSubmit={handleSubmit(onSubmit)}>
          <Stack gap="4">
            <Field
              label="LBC Address"
              required
              invalid={!!errors.lbcAddress}
              errorText={errors.lbcAddress?.message}
            >
              <Input
                {...register('lbcAddress', {
                  required: 'LBC Address is required'
                })}
                placeholder="Enter your LBC address"
              />
            </Field>

            <Field
              label="Quantity (LBC)"
              required
              invalid={!!errors.quantity}
              errorText={errors.quantity?.message}
            >
              <Input
                type="number"
                {...register('quantity', {
                  required: 'Quantity is required',
                  min: {
                    value: 0,
                    message: 'Quantity must be greater than 0'
                  }
                })}
                placeholder="Enter amount of LBC"
              />
            </Field>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              isLoading={loading}
              loadingText="Creating order..."
            >
              Create Buy Order
            </Button>
          </Stack>
        </Box>
      </VStack>
    </Container>
  );
}

export default App;
