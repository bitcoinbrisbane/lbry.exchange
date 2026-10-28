import { useEffect } from "react";
import { NOT_FOUND, PAGES, SITE_URL, pageTitle, socialMeta } from "../config/pages";

// index.html's robots value, restored when leaving the not-found page.
const ROBOTS = document.head.querySelector('meta[name="robots"]')?.getAttribute("content");

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Title, description, canonical URL and robots for a route, from config/pages.js. The build writes the same values
 * into each route's HTML; this keeps them right as the app navigates. A path not in PAGES gets NOT_FOUND.
 */
export function usePageMeta(path) {
  useEffect(() => {
    const page = PAGES[path] ?? NOT_FOUND;
    const social = socialMeta(page);
    const url = `${SITE_URL}${path}`;
    document.title = pageTitle(page);
    setMeta('meta[name="description"]', "content", page.description);
    setMeta('meta[name="robots"]', "content", page.noindex ? "noindex" : ROBOTS);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:title"]', "content", social.title);
    setMeta('meta[name="twitter:title"]', "content", social.title);
    setMeta('meta[property="og:description"]', "content", social.description);
    setMeta('meta[name="twitter:description"]', "content", social.description);
  }, [path]);
}
