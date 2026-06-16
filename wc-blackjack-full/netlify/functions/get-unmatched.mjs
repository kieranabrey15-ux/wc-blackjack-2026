// netlify/functions/get-unmatched.mjs
// Browser-readable view of scorers/assisters the poller couldn't tie to one of your 102 picks.
// Any of YOUR players appearing here just needs a one-line alias in lib/players.mjs.

import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("wc-blackjack");
  const unmatched = (await store.get("unmatched", { type: "json" })) || [];
  const stats = (await store.get("stats", { type: "json" })) || { updated: null };
  return new Response(JSON.stringify({ updated: stats.updated, unmatched }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });
};

export const config = { path: "/api/unmatched" };
