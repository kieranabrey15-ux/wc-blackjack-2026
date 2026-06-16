// netlify/functions/poll-stats.mjs
// Scheduled poller. Reads live + recently-finished World Cup fixtures, pulls their events,
// and accumulates goals/assists per picked player into Netlify Blobs.
//
// Design notes (built around the free-tier 100 req/day limit and the 10s function timeout):
//   * Per-fixture caching: each fixture's contribution is stored separately, so a LIVE match
//     is simply recomputed and overwritten each run — no double counting.
//   * Finished fixtures are marked final and never fetched again (the big request saving).
//   * Early exit: if nothing is live and nothing newly finished, the run costs 1 request.
//   * Daily budget guard: hard stop before the free tier is exhausted.
//
// Env var required:  API_FOOTBALL_KEY   (from dashboard.api-football.com)
// Adjust LEAGUE/SEASON if the World Cup id differs in your plan (guide says league=1, season=2026).

import { getStore } from "@netlify/blobs";
import { matchPlayer } from "../lib/players.mjs";

const API = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;
const MAX_DAILY_REQUESTS = 90;        // stay under the free 100/day
const MAX_EVENT_FETCHES_PER_RUN = 8;  // protect the 10s timeout
const BACKFILL_FETCHES_PER_RUN = 20;  // bigger one-time catch-up batch (still timeout-safe)

const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const DONE = new Set(["FT", "AET", "PEN"]);

const headers = { "x-apisports-key": process.env.API_FOOTBALL_KEY };

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  const json = await res.json();
  return json.response || [];
}

// Sum one fixture's events into { canonicalName: { g, a } }, plus a log of unmatched scorers.
function tallyFixture(events) {
  const out = {};
  const unmatched = new Set();
  const add = (name, key) => {
    const canon = matchPlayer(name);
    if (!canon) { if (name) unmatched.add(name); return; }
    out[canon] = out[canon] || { g: 0, a: 0 };
    out[canon][key] += 1;
  };
  for (const e of events) {
    if (e.type !== "Goal") continue;
    const detail = e.detail || "";
    if (detail === "Own Goal" || detail === "Missed Penalty") continue; // not a goal for the player
    add(e.player?.name, "g");
    if (e.assist?.name) add(e.assist.name, "a");
  }
  return { out, unmatched: [...unmatched] };
}

export default async (req) => {
  if (!process.env.API_FOOTBALL_KEY) {
    return new Response("Missing API_FOOTBALL_KEY", { status: 500 });
  }
  const store = getStore("wc-blackjack");
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";

  // --- daily budget guard ---
  const today = new Date().toISOString().slice(0, 10);
  const budget = (await store.get("budget", { type: "json" })) || { day: today, used: 0 };
  if (budget.day !== today) { budget.day = today; budget.used = 0; }
  if (budget.used >= MAX_DAILY_REQUESTS) {
    return new Response("Daily request budget reached; try again tomorrow (free tier = 100/day).", { status: 200 });
  }

  const fixtureStats = (await store.get("fixtureStats", { type: "json" })) || {}; // {fid: {name:{g,a}}}
  const finalized = new Set((await store.get("finalized", { type: "json" })) || []);
  const unmatchedLog = new Set((await store.get("unmatched", { type: "json" })) || []);

  let calls = 0;
  let toProcess = [];

  if (backfill) {
    // One-time catch-up: every finished fixture in the tournament not yet processed.
    // Bigger per-run cap (still timeout-safe) so the backlog clears in a few hits.
    const all = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`); calls++;
    toProcess = all
      .filter(f => DONE.has(f.fixture.status.short) && !finalized.has(f.fixture.id))
      .slice(0, BACKFILL_FETCHES_PER_RUN);
  } else {
    // Normal incremental mode: live now + finished since last run.
    const live = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}&live=all`); calls++;
    const dates = [today, new Date(Date.now() - 864e5).toISOString().slice(0, 10)];
    let finishedCandidates = [];
    for (const d of dates) {
      if (budget.used + calls >= MAX_DAILY_REQUESTS) break;
      const day = await api(`/fixtures?league=${LEAGUE}&season=${SEASON}&date=${d}`); calls++;
      finishedCandidates.push(...day.filter(f => DONE.has(f.fixture.status.short) && !finalized.has(f.fixture.id)));
    }
    const liveFixtures = live.filter(f => LIVE.has(f.fixture.status.short));
    toProcess = [...liveFixtures, ...finishedCandidates].slice(0, MAX_EVENT_FETCHES_PER_RUN);
  }

  if (toProcess.length === 0) {
    budget.used += calls; await store.setJSON("budget", budget);
    return new Response(backfill ? "Backfill complete — no more finished fixtures to process."
                                 : "Nothing live or newly finished.", { status: 200 });
  }

  let remaining = 0;
  for (const f of toProcess) {
    if (budget.used + calls >= MAX_DAILY_REQUESTS) { remaining = 1; break; }
    const fid = f.fixture.id;
    const events = await api(`/fixtures/events?fixture=${fid}`); calls++;
    const { out, unmatched } = tallyFixture(events);
    fixtureStats[fid] = out;                       // overwrite this fixture's bucket
    unmatched.forEach(u => unmatchedLog.add(u));
    if (DONE.has(f.fixture.status.short)) finalized.add(fid); // lock finished matches
  }

  // --- aggregate every fixture bucket into the flat stats the frontend reads ---
  const totals = {};
  for (const bucket of Object.values(fixtureStats)) {
    for (const [name, v] of Object.entries(bucket)) {
      totals[name] = totals[name] || { g: 0, a: 0 };
      totals[name].g += v.g; totals[name].a += v.a;
    }
  }

  budget.used += calls;
  await Promise.all([
    store.setJSON("fixtureStats", fixtureStats),
    store.setJSON("finalized", [...finalized]),
    store.setJSON("unmatched", [...unmatchedLog]),
    store.setJSON("stats", { updated: new Date().toISOString(), players: totals }),
    store.setJSON("budget", budget),
  ]);

  const note = backfill
    ? `Backfilled ${toProcess.length} fixture(s). ${(remaining||budget.used>=MAX_DAILY_REQUESTS) ? "Budget reached or more remain — run ?backfill=1 again to continue." : "If older games are still missing, run ?backfill=1 once more."}`
    : `processed ${toProcess.length}`;
  return new Response(JSON.stringify({ mode: backfill ? "backfill" : "incremental",
    processed: toProcess.length, calls, dailyUsed: budget.used, note,
    unmatched: [...unmatchedLog] }), { headers: { "content-type": "application/json" } });
};

// Free tier = 100 requests/day, so polling cadence is budget-bound, not code-bound.
// Every 10 min all day ≈ within budget (idle runs cost 1 request and exit; finished matches
// are fetched once then locked). For tighter updates during games you actually watch, narrow
// to match hours and speed up, e.g. "*/3 16-23 * * *" (every 3 min, 4–11pm) — fits budget
// because it's a window, not all day. True minute-level needs a paid tier.
export const config = { schedule: "*/10 * * * *" };
