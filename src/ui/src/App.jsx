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
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Home } from './pages/Home'

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
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Redirect all unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
