# UPNEDA Schedule Explorer

React dashboard for the UPNEDA Project & SCM Tracker. Built to match the
existing GH2 Solar Ops Dashboard's visual identity (same color tokens,
status vocabulary, and card/badge patterns).

## What it shows

A single "Schedule Explorer" with a **View** toggle for exactly the 6 fields
the tracker uses to measure schedule health:

- **Plan Start → Plan End** — timeline bars from the planned window
- **Actual Start → Actual End** — timeline bars from the actual window
- **TAT (Days)** — ranked bar chart of turnaround time per item
- **Delay (Days)** — ranked bar chart of days overdue per item

Plus filters for Tracker (Design & Engineering / SCM / Execution Tracker),
Project, Status, and a search box.

## Data source

`public/data/tracker.json` — currently a static snapshot exported from
`UPNEDA_Project_Tracker.xlsx` (Project Key + all 3 date-tracked tabs:
Design & Engineering, SCM, Execution Tracker; Manpower & Machinery isn't
included since it doesn't share the Plan/Actual/TAT/Delay schema).

**Current data is real but sparse** — only 2 items (both Barla Aligarh
execution activities) have an Actual Start date filled in; nothing else has
Plan/Actual dates yet. The "Preview with sample data" toggle in the app
overlays clearly-labeled illustrative dates so you can see what the charts
look like once the tracker is populated — it never touches the real data.

### Wiring up the live pipeline

Matches the existing GH2 Power Automate pattern (Recurrence → "List rows
present in a table" per tab → HTTP GET → Compose → HTTP PUT) — same shape as
the OPEX/CAPEX/Issue Tracker flow, just 5 tables instead of 8, and no
per-field Select/reshape actions. The flow commits the 5 tables **raw and
unmapped**; `App.jsx` does all the reshaping (renaming columns,
generating stable `id`s, merging into one `items[]` array) on the JS side —
that's the one place to edit if a column name ever changes, not the flow.

1. Push this repo to GitHub and connect it to Vercel (see Deploy below).
2. In Power Automate: Recurrence trigger → 5x "List rows present in a
   table" (ProjectKey, DesignEngineering, SCM, ExecutionTracker,
   MilestonePayments — all named Excel Tables in `UPNEDA_Project_Tracker.xlsx`
   on SharePoint/OneDrive) → HTTP GET the current file's `sha` from the
   GitHub Contents API → Compose `{ lastUpdated, projectKey: <rows>,
   design: <rows>, scm: <rows>, execution: <rows>, milestonePayments: <rows> }`
   → HTTP PUT that (base64-encoded, with the `sha`) to `public/data/tracker.json`
   in this repo. Milestone Summary doesn't need its own action — its values
   are already baked into Milestone Payments' Target Date/Actual Date/TAT/Delay
   columns by Excel's own formulas, so Power Automate only needs to read the
   one sheet.

That's the whole pipeline — nothing else to configure. `DATA_URL` in
`App.jsx`'s `DATA_URL` stays a relative `/data/tracker.json` on
purpose: Vercel auto-rebuilds on every push to the repo, and each rebuild
picks up whatever Power Automate most recently committed to
`public/data/`, so the deployed app always serves the latest file at that
same path. No URL to look up, no code to touch after the initial setup.

(There's a faster-refresh variant — point `DATA_URL` at the
`raw.githubusercontent.com` copy of the file instead, so the browser sees
new data without waiting ~30-60s for a Vercel rebuild, same pattern as the
Ops Dashboard. Worth it later if the 30-60s lag ever actually matters; skip
it for now.)

`App.jsx`'s `normalize()` function accepts either shape — the raw
Power-Automate one above, or the already-flat `{projects, items}` shape
already in `tracker.json` — so local dev against the static snapshot keeps
working unchanged.

## Deploy

Standard Vite app — connect the GitHub repo to Vercel, no custom config
needed. `npm run build` outputs to `dist/`.

## Local dev

```
npm install
npm run dev
```
