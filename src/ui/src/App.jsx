import { Box, VStack } from "@chakra-ui/react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { IntroBanner } from "./components/IntroBanner";
import { PageContainer } from "./components/PageContainer";
import { Unwrap } from "./pages/Unwrap";
import { Verify } from "./pages/Verify";
import { Wrap } from "./pages/Wrap";

export function App() {
  return (
    <Router>
      <Box minH="100vh">
        <Header />
        <PageContainer as="main" py={{ base: 6, md: 10 }}>
          <VStack spacing={8} align="stretch">
            <IntroBanner />
            <Routes>
              <Route path="/" element={<Wrap />} />
              <Route path="/wrap" element={<Navigate to="/" replace />} />
              <Route path="/unwrap" element={<Unwrap />} />
              <Route path="/verify" element={<Verify />} />
            </Routes>
          </VStack>
        </PageContainer>
      </Box>
    </Router>
  );
}

export default App;
