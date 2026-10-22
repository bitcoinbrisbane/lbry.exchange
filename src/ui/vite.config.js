import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendors change far less often than app code; separate chunks keep them cached across deploys.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            {
              name: "chakra",
              test: /node_modules[\\/](@chakra-ui|@emotion|framer-motion|motion-dom|motion-utils)[\\/]/,
            },
            { name: "ethers", test: /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/ },
          ],
        },
      },
    },
  },
});
