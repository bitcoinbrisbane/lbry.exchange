import { Box } from "@chakra-ui/react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Header } from "./components/Header";
import { Sell } from "./pages/Sell";
import { Wrap } from "./pages/Wrap";
import { Unwrap } from "./pages/Unwrap";

export function App() {
	return (
		<Router>
			<Box minH="100vh">
				<Header />
				<Box as="main" py={8}>
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/sell" element={<Sell />} />
						<Route path="/wrap" element={<Wrap />} />
						<Route path="/unwrap" element={<Unwrap />} />
					</Routes>
				</Box>
			</Box>
		</Router>
	);
}

export default App;
