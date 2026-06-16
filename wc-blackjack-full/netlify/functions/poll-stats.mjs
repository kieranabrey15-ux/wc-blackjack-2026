// netlify/functions/poll-stats.mjs
// Poller for football-data.org (free tier covers the current World Cup).
// Reads WC matches, pulls each finished/live match's goal detail (scorer + assist),
// and accumulates goals/assists per picked player into Netlify Blobs.
//
// Token: set env var FOOTBALL_DATA_TOKEN (or reuse API_FOOTBALL_KEY) to your football-data.org token.
// Modes (URL params):
//   ?debug=1     -> show competition coverage + a sample finished match's goals (verify assists exist)
//   ?backfill=1  -> catch up all finished matches so far (resumable; run again until "complete")
//   (no param)   -> normal incremental: live + newly finished
//
// Free-tier limit is 10 requests/minute, so each run makes at most ~9 calls (1 list + 8 details).
// For a big backfill, run ?backfill=1 a few times, ~1 minute apart.

import { getStore } from "@netlify/blobs";
import { matchPlayer } from "../lib/players.mjs";

const API = "https://api.football-data.org/v4";
const COMPETITION = "WC";                 // FIFA World Cup
const DETAILS_PER_RUN = 8;                // 1 list + 8 details = 9 calls, under 10/min

const TOKEN = process.env.FOOTBALL_DATA_TOKEN || process.env.API_FOOTBALL_KEY;
const headers = { "X-Auth-Token": TOKEN || "" };

const LIVE = new Set(["IN_PLAY", "PAUSED"]);
const DONE = new Set(["FINISHED", "AWARDED"]);

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 403) throw new Error("FORBIDDEN: token/plan lacks access to this resource");
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  return res.json();
}

function tallyMatch(match) {
  const out = {}, unmatched = new Set();
  const add = (name, key) => {
    const canon = matchPlayer(name);
    if (!canon) { if (name) unmatched.add(name); return; }
    out[canon] = out[canon] || { g: 0, a: 0 };
    out[canon][key] += 1;
  };
  for (const g of (match.goals || [])) {
    if (g.type === "OWN") continue;
    add(g.scorer && g.scorer.name, "g");
    if (g.assist && g.assist.name) add(g.assist.name, "a");
  }
  return { out, unmatched: [...unmatched], goalCount: (match.goals || []).length };
}

function aggregate(fixtureStats) {
  const totals = {};
  for (const bucket of Object.values(fixtureStats))
    for (const [name, v] of Object.entries(bucket)) {
      totals[name] = totals[name] || { g: 0, a: 0 };
      totals[name].g += v.g; totals[name].a += v.a;
    }
  return totals;
}

export default async (req) => {
  if (!TOKEN) return new Response("Missing FOOTBALL_DATA_TOKEN (or API_FOOTBALL_KEY)", { status: 500 });
  const store = getStore("wc-blackjack");
  const url = new URL(req.url);
  const backfill = url.searchParams.get("backfill") === "1";
  const debug = url.searchParams.get("debug") === "1";

  if (debug) {
    try {
      const comp = await api(`/competitions/${COMPETITION}/matches`);
      const matches = comp.matches || [];
      const byStatus = {};
      for (const m of matches) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      const sampleFinished = matches.find(m => DONE.has(m.status));
      let sampleGoals = null;
      if (sampleFinished) {
        const d = await api(`/matches/${sampleFinished.id}`);
        sampleGoals = (d.goals || []).map(g => ({ type: g.type, scorer: g.scorer?.name, assist: g.assist?.name || null }));
      }
      return new Response(JSON.stringify({
        competition: COMPETITION, totalMatches: matches.length, byStatus,
        sampleFinishedMatch: sampleFinished ? `${sampleFinished.homeTeam?.name} v ${sampleFinished.awayTeam?.name}` : null,
        sampleGoals, assistsPresent: sampleGoals ? sampleGoals.some(g => g.assist) : null,
      }, null, 2), { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }, null, 2), { headers: { "content-type": "application/json" } });
    }
  }

  const fixtureStats = (await store.get("fixtureStats", { type: "json" })) || {};
  const finalized = new Set((await store.get("finalized", { type: "json" })) || []);
  const unmatchedLog = new Set((await store.get("unmatched", { type: "json" })) || []);

  let calls = 0, rateLimited = false;
  try {
    const comp = await api(`/competitions/${COMPETITION}/matches`); calls++;
    const matches = comp.matches || [];
    const live = matches.filter(m => LIVE.has(m.status));
    const doneNew = matches.filter(m => DONE.has(m.status) && !finalized.has(m.id));
    const toProcess = (backfill ? doneNew : [...live, ...doneNew]).slice(0, DETAILS_PER_RUN);

    if (toProcess.length === 0) {
      await store.setJSON("stats", { updated: new Date().toISOString(), players: aggregate(fixtureStats) });
      return new Response(backfill ? "Backfill complete — all finished matches processed."
                                   : "Nothing live or newly finished.", { status: 200 });
    }

    for (const m of toProcess) {
      const detail = await api(`/matches/${m.id}`); calls++;
      const { out, unmatched } = tallyMatch(detail);
      fixtureStats[m.id] = out;
      unmatched.forEach(u => unmatchedLog.add(u));
      if (DONE.has(m.status)) finalized.add(m.id);
    }
  } catch (e) {
    if (String(e.message).includes("RATE_LIMIT")) rateLimited = true;
    else throw e;
  }

  const totals = aggregate(fixtureStats);
  await Promise.all([
    store.setJSON("fixtureStats", fixtureStats),
    store.setJSON("finalized", [...finalized]),
    store.setJSON("unmatched", [...unmatchedLog]),
    store.setJSON("stats", { updated: new Date().toISOString(), players: totals }),
  ]);

  const note = rateLimited
    ? "Hit the 10/min rate limit mid-run — progress saved. Run again in ~1 minute to continue."
    : (backfill ? "Backfilled a batch. If older games are still missing, run ?backfill=1 again (~1 min apart)." : `processed ${Math.max(calls - 1, 0)} match(es)`);
  return new Response(JSON.stringify({
    mode: backfill ? "backfill" : "incremental", calls, rateLimited,
    finalizedCount: finalized.size, players: Object.keys(totals).length, note,
    unmatched: [...unmatchedLog],
  }), { headers: { "content-type": "application/json" } });
};

// Every 10 min — far under the 10/min limit, and each run self-caps its calls.
export const config = { schedule: "*/10 * * * *" };
