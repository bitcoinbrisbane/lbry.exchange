// Title and description for each route, and optionally a different title and description for link previews
// (social), which otherwise reuse them. usePageMeta applies them in the browser; the build (vite.config.js) writes
// them into a copy of index.html per route, for crawlers and link previews that don't run JavaScript. Keep
// public/sitemap.xml in step with the paths here.
export const SITE_URL = "https://lbc.exchange";

export const PAGES = {
  "/": {
    name: "Wrap LBC to wLBC on Ethereum",
    description:
      "Bridge LBRY Credits (LBC) to Ethereum. Wrap native LBC into wLBC, an ERC-20 token backed 1:1, to hold, trade and use across DeFi, and redeem it for LBC any time.",
    social: {
      title: "Bring LBC to Ethereum DeFi | lbc.exchange",
      description:
        "Wrap LBRY Credits into wLBC, an ERC-20 backed 1:1 by custodied LBC, the same model as wBTC. Redeem any time.",
    },
  },
  "/unwrap": {
    name: "Unwrap wLBC to native LBC",
    description:
      "Redeem wLBC for native LBRY Credits 1:1. Burn wLBC on Ethereum and receive LBC at any LBRY address after 12 confirmations.",
  },
  "/trade": {
    name: "Trade wLBC on Uniswap",
    description:
      "wLBC trades on Uniswap V4 on Ethereum, paired with USDT. Swap links and the token and bridge contract addresses to verify before trading.",
  },
  "/verify": {
    name: "Verify wLBC reserves",
    description:
      "Proof of reserves for wLBC: circulating supply against LBC held in deposit addresses, 1:1, with a Merkle root you can recompute in your browser.",
  },
  "/donate": {
    name: "Donate LBC for bridge fees",
    description:
      "Help keep LBC to wLBC unwraps free: donate LBC to the bridge's fee address, which pays the LBRY network fee on every payout.",
  },
};

/** Any path not in PAGES. Kept out of search results; the static host still answers 200 (catchall_document). */
export const NOT_FOUND = {
  name: "Page not found",
  description: "There is no page at this address on lbc.exchange.",
  noindex: true,
};

export const pageTitle = (page) => `${page.name} | lbc.exchange`;

/** Title and description for og:* and twitter:* tags. */
export const socialMeta = (page) => ({
  title: page.social?.title ?? pageTitle(page),
  description: page.social?.description ?? page.description,
});
