import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import { FAQ } from "./src/config/faq.js";
import { PAGES, SITE_URL, pageTitle, socialMeta } from "./src/config/pages.js";

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// FAQPage structured data for the home page, the one page that shows the FAQ.
const faqJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
}).replace(/</g, "\\u003c");

/** The built index.html with one route's title, description, URL and no-JS heading in place of the home page's. */
function routeHtml(html, route, page) {
  const url = `${SITE_URL}${route}`;
  const title = pageTitle(page);
  const social = socialMeta(page);
  const fields = [
    [/(<title>)[^<]*/, title],
    [/(<meta\s+name="description"\s+content=")[^"]*/, page.description],
    [/(<link\s+rel="canonical"\s+href=")[^"]*/, url],
    [/(<meta\s+property="og:url"\s+content=")[^"]*/, url],
    [/(<meta\s+property="og:title"\s+content=")[^"]*/, social.title],
    [/(<meta\s+property="og:description"\s+content=")[^"]*/, social.description],
    [/(<meta\s+name="twitter:title"\s+content=")[^"]*/, social.title],
    [/(<meta\s+name="twitter:description"\s+content=")[^"]*/, social.description],
    [/(<noscript>[\s\S]*?<h1>)[^<]*/, page.name],
    [/(<noscript>[\s\S]*?<\/h1>\s*<p>)[^<]*/, page.description],
  ];
  const out = fields.reduce((acc, [pattern, value]) => {
    // Fail the build rather than ship a page that still claims to be the home page.
    if (!pattern.test(acc)) throw new Error(`index.html: nothing matches ${pattern}`);
    return acc.replace(pattern, (_, before) => before + escapeHtml(value));
  }, html);
  if (route !== "/") return out;
  return out.replace("</head>", () => `<script type="application/ld+json">${faqJsonLd}</script>\n  </head>`);
}

/** Writes <route>/index.html for every route in src/config/pages.js, so each has its own tags before any JS runs. */
function routePages() {
  return {
    name: "route-pages",
    apply: "build",
    async writeBundle({ dir }) {
      const html = await readFile(path.join(dir, "index.html"), "utf8");
      for (const [route, page] of Object.entries(PAGES)) {
        const file = path.join(dir, route, "index.html");
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, routeHtml(html, route, page));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), routePages()],
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
            {
              name: "wallet",
              test: /node_modules[\\/](@reown|@walletconnect|@lit|lit|lit-html|lit-element|viem|ox|valtio|proxy-compare)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
