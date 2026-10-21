import { Box } from "@chakra-ui/react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Header } from "./components/Header";
import { Wrap } from "./pages/Wrap";
import { Unwrap } from "./pages/Unwrap";

export function App() {
	return (
		<Router>
			<Box minH="100vh">
				<Header />
				<Box as="main" py={8}>
					<Routes>
						<Route path="/" element={<Wrap />} />
						<Route path="/wrap" element={<Navigate to="/" replace />} />
						<Route path="/unwrap" element={<Unwrap />} />
					</Routes>
				</Box>
			</Box>
		</Router>
	);
}

export default App;
