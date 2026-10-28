// Shown on the Wrap page (components/Faq.jsx), and written into that page's HTML as FAQPage structured data by the
// build (vite.config.js). Search engines require the two to match, so both read this list.
export const FAQ = [
  {
    question: "What is wLBC?",
    answer:
      "wLBC is an ERC-20 token on Ethereum backed 1:1 by LBRY Credits (LBC) held in custody, the same model as wBTC for Bitcoin. Contract: 0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1.",
  },
  {
    question: "How do I wrap LBC?",
    answer:
      "Connect an Ethereum wallet, send LBC to the personal deposit address shown, and after 6 LBRY confirmations mint the same amount of wLBC to your wallet.",
  },
  {
    question: "How do I get native LBC back?",
    answer:
      "On the Unwrap page, burn wLBC and enter an LBRY address. After 12 Ethereum confirmations the same amount of native LBC is sent to that address.",
    link: { to: "/unwrap", label: "Unwrap wLBC" },
  },
  {
    question: "Where can I trade wLBC?",
    answer:
      "On Uniswap V4 on Ethereum, in the wLBC/USDT pool at the 0.25% fee tier. Check the token address is 0xB0F2C4f8b7c0f088f7844947EcBf1220bFCa08C1 before you swap.",
    link: { to: "/trade", label: "Trade wLBC" },
  },
  {
    question: "How do I know wLBC is fully backed?",
    answer:
      "The Verify page compares the wLBC supply with the LBC held in deposit addresses, from public chain data, with a Merkle root you can recompute in your browser.",
    link: { to: "/verify", label: "Verify reserves" },
  },
];
