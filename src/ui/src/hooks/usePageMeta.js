import { useEffect } from "react";

const SITE = "https://lbc.exchange";

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Per-route title, description and canonical URL. index.html carries the
 * defaults for the home route; crawlers that run JavaScript see these.
 */
export function usePageMeta({ title, description, path }) {
  useEffect(() => {
    const url = `${SITE}${path}`;
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
  }, [title, description, path]);
}
