

import { Box } from "@chakra-ui/react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import { Home } from "./pages/Home";
import { Header } from "./components/Header";
import { API_BASE_URL } from "./config/constants";
import { Sell } from "./pages/Sell";

export function App() {
	return (
		<Router>
			<Box minH="100vh">
				<Header />
				<Box as="main" py={8}>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/sell" element={<Sell />} />
					</Routes>
				</Box>
			</Box>
		</Router>
	);
}

export default App;
