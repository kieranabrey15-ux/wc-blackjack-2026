// netlify/functions/get-stats.mjs
// Lightweight read endpoint the browser calls. Returns the accumulated stats from Blobs.
// No API key here — the key only ever lives inside poll-stats. Cheap to call as often as you like.

import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("wc-blackjack");
  const stats = (await store.get("stats", { type: "json" })) || { updated: null, players: {} };
  return new Response(JSON.stringify(stats), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60", // browsers/CDN may cache for a minute
      "access-control-allow-origin": "*",
    },
  });
};

export const config = { path: "/api/stats" };
