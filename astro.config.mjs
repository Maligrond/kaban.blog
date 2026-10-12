import { postProcessor } from "./src/lib/post-processor.js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import pagefind from "astro-pagefind";

// https://astro.build/config
export default defineConfig({
  site: "https://kaban.blog",
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
  integrations: [ sitemap({ filter: page => !page.endsWith("/author/") }), mdx(), pagefind({ indexConfig: {
    rootSelector: "#main-content",
    // Keep navigation, dates and ratings out of searchable text and excerpts.
    excludeSelectors: [
      ".back-to-notes", ".note-meta", ".review-rating", ".review-return",
      ".post-details", ".post-extras", ".place-connections", ".journal-aside",
      ".city-filters", ".city-results", ".section-caption", ".review-arrow",
      ".world-place-meta", ".world-summary", ".world-alphabet-row dt", ".place-stats",
      ".place-city-list a span", ".place-favorites a span",
    ],
  } })],
  markdown: {
    processor: postProcessor(),
    shikiConfig: {
      theme: "css-variables",
    },
  },
});
