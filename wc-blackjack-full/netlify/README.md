# World Cup Blackjack — auto-updating setup

Three files turn the manual hub into a self-updating one:

```
netlify/
  lib/players.mjs          # 102 picked players + alias/normalize matcher
  functions/poll-stats.mjs # scheduled: API-Football -> Netlify Blobs
  functions/get-stats.mjs  # on-demand read endpoint at /api/stats
```

## 1. Dependencies

```bash
npm install @netlify/blobs
```

`package.json` (functions use ESM, so):

```json
{
  "type": "module",
  "dependencies": { "@netlify/blobs": "^8.1.0" }
}
```

## 2. netlify.toml

```toml
[build]
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
```

Scheduling is declared in the function itself (`export const config = { schedule: "*/10 * * * *" }`),
so no extra cron config is needed. Netlify Blobs needs no setup — it's enabled per-site automatically.

## 3. API key

Get a free key at dashboard.api-football.com, then in Netlify:
**Site settings → Environment variables → add** `API_FOOTBALL_KEY`.
The key lives only in `poll-stats`; the browser never sees it.

> Verify the competition id once: call `/leagues?search=world cup` with your key and confirm the
> World Cup 2026 `league.id` and `season`. The API-SPORTS guide uses `league=1, season=2026`; if your
> plan differs, change `LEAGUE`/`SEASON` at the top of `poll-stats.mjs`.

## 4. Free-tier budget (the one real constraint)

Free = 100 requests/day. The poller is built to survive that:
- when nothing is live, a run costs **1 request** (the `live=all` check) and exits;
- finished matches are fetched **once** then locked, never re-fetched;
- a hard `MAX_DAILY_REQUESTS = 90` guard stops before you're cut off.

On a heavy group-stage day (3–4 simultaneous matches) you'll spend ~5–8 requests per active
10-minute slot. If you find you're brushing the cap, either widen the schedule to match-hours only
(`"*/10 15-23,0-3 * * *"`) or spend ~£12 on a month of the paid tier for proper sub-minute live. For a
friends' sweep, 10-minute granularity on the free tier is plenty.

## 5. Wire the frontend to it

In `world-cup-blackjack-hub.jsx`, replace the manual `useState(buildInitialStats)` seed with a fetch
from your read endpoint, keeping the manual panel as an override layer for when the API's assist
credits lag behind Pickd's:

```jsx
const [apiStats, setApiStats] = useState({});
const [overrides, setOverrides] = useState({});   // manual edits win over the API
const [updated, setUpdated] = useState(null);

useEffect(() => {
  const load = () =>
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => { setApiStats(d.players || {}); setUpdated(d.updated); })
      .catch(() => {});
  load();
  const t = setInterval(load, 90_000); // re-poll the cheap endpoint every 90s
  return () => clearInterval(t);
}, []);

// merged source of truth: every picked player, API value unless manually overridden
const stats = useMemo(() => {
  const s = buildInitialStats();                 // gives all picks a 0-0 baseline
  for (const [n, v] of Object.entries(apiStats)) s[n] = { ...s[n], ...v };
  for (const [n, v] of Object.entries(overrides)) s[n] = { ...s[n], ...v };
  return s;
}, [apiStats, overrides]);
```

Then point the panel's `bump()` at `setOverrides` instead of `setStats`, and show the `updated`
timestamp somewhere in the masthead ("Live · updated 14:32"). Everything else in the hub already
derives from `stats`, so the table goes live with no other changes.

## 6. The matching safety net

Football feeds spell names every which way. `poll-stats` keeps an **unmatched scorers log** —
any goal/assist by a name it couldn't tie to one of your 102 picks gets recorded. After the first
match day, hit the function URL once and read the `unmatched` array in the response; for any of your
players sitting in there, add a line to `ALIASES` in `players.mjs` (e.g. `"viniciusjr":"Vinicius Junior"`).
After a couple of days the map is complete and it runs itself.
```
