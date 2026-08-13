import React, { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// THEME — GH2 Solar brand tokens and date helpers (was styles/theme.js)
// ============================================================================
// Brand tokens copied from the existing GH2 Solar Ops Dashboard (App.jsx "B" object)
// so this tracker reads as the same product, not a new one.
const B = {
  olive: "#A6C83D",
  blue: "#3E5BA6",
  green: "#1AAE48",
  oliveL: "#f0f5d6",
  blueL: "#eef1f9",
  greenL: "#e8f8ed",
  limeL: "#fefde8",
  bg: "#f7f9f2",
  text: "#1a2310",
  muted: "#5a6b4a",
  border: "#e2ebd0",
};

// Same status vocabulary as the ops dashboard (STATUS map), reused here for
// document / material / activity status instead of project status.
const STATUS_COLORS = {
  // design & engineering
  "Not Submitted": { bg: "#f5f5f5", border: "#d0d0d0", text: "#666666", dot: "#9e9e9e" },
  "Submitted": { bg: B.limeL, border: "#f5e84a", text: "#8a7000", dot: "#c8a000" },
  "Under Review": { bg: B.limeL, border: "#f5e84a", text: "#8a7000", dot: "#c8a000" },
  "Approved": { bg: B.greenL, border: "#86d9a0", text: "#0d7a32", dot: B.green },
  "GH2 Provided": { bg: B.greenL, border: "#86d9a0", text: "#0d7a32", dot: B.green },
  "Rejected": { bg: "#fef2f2", border: "#f5a5a5", text: "#c0392b", dot: "#c0392b" },
  // scm
  "Not Started": { bg: "#f5f5f5", border: "#d0d0d0", text: "#666666", dot: "#9e9e9e" },
  "Ordered": { bg: B.limeL, border: "#f5e84a", text: "#8a7000", dot: "#c8a000" },
  "Partially Received": { bg: B.limeL, border: "#f5e84a", text: "#8a7000", dot: "#c8a000" },
  "Received": { bg: B.greenL, border: "#86d9a0", text: "#0d7a32", dot: B.green },
  "Delayed": { bg: "#fef2f2", border: "#f5a5a5", text: "#c0392b", dot: "#c0392b" },
  // execution tracker
  "In Progress": { bg: B.limeL, border: "#f5e84a", text: "#8a7000", dot: "#c8a000" },
  "Completed": { bg: B.greenL, border: "#86d9a0", text: "#0d7a32", dot: B.green },
  // milestone payments (derived client-side — Milestone Payments has no Status column of its own)
  "Achieved": { bg: B.greenL, border: "#86d9a0", text: "#0d7a32", dot: B.green },
  "Overdue": { bg: "#fef2f2", border: "#f5a5a5", text: "#c0392b", dot: "#c0392b" },
  "Pending": { bg: "#f5f5f5", border: "#d0d0d0", text: "#666666", dot: "#9e9e9e" },
};
const NO_STATUS = { bg: "#f5f5f5", border: "#e2ebd0", text: B.muted, dot: "#c3ccb6" };
const statusStyle = (s) => STATUS_COLORS[s] || NO_STATUS;

const TRACKERS = ["Design & Engineering", "SCM", "Execution Tracker", "Milestone Payments"];
const TRACKER_COLOR = {
  "Design & Engineering": "#7B1FA2",
  SCM: "#1565C0",
  "Execution Tracker": "#E65100",
  "Milestone Payments": "#00838F",
};
const TRACKER_LIGHT = {
  "Design & Engineering": "#F3E5F5",
  SCM: "#E3F2FD",
  "Execution Tracker": "#FFF3E0",
  "Milestone Payments": "#E0F7FA",
};

// ── Date helpers (same parsing contract as the ops dashboard) ──────────────
const parseDateStr = (s) => {
  if (s === null || s === undefined || s === "") return null;
  // Excel date cell as a genuine number (rare via this pipeline, but cheap to handle)
  if (typeof s === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + s * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof s !== "string") return null;
  const clean = s.trim();
  if (!clean || clean.toLowerCase() === "tbd" || clean === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }
  const sep = clean.includes("/") ? "/" : clean.includes("-") ? "-" : null;
  if (!sep) {
    // Excel serial number sent as JSON *text* (e.g. "46242") — this is what
    // Power Automate actually sends for Date-formatted cells on this pipeline,
    // confirmed against the live payload. Serials in ~40000-60000 cover
    // roughly 2009-2064, the only realistic window for project dates here.
    if (/^\d{4,6}$/.test(clean)) {
      const n = Number(clean);
      if (n >= 40000 && n <= 60000) {
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return isNaN(d.getTime()) ? null : d;
      }
    }
    return null;
  }
  const p = clean.split(sep).map((x) => x.trim());
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  if (!/^\d{1,2}$/.test(dd) || !/^\d{1,2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return null;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
};

const fmtShortDate = (d) =>
  d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

const pctCol = (p) => (p >= 90 ? B.green : p >= 40 ? "#e07b20" : "#c0392b");

// Formats a stored date string for display, or falls back to whatever raw
// text was there (e.g. "TBD") — never silently drops it.
const dispDate = (v) => {
  const d = parseDateStr(v);
  return d ? fmtShortDate(d) : v || "—";
};

// ============================================================================
// DATA HOOK — fetches + reshapes tracker.json, auto-polls (was hooks/useTrackerData.js)
// ============================================================================
// Swap this for the raw.githubusercontent.com URL once this repo is pushed
// and the tracker JSON is committed — same pattern as the ops dashboard's
// DATA_URL. Left as a local path for now so the app runs standalone.
const DATA_URL = "/data/tracker.json";

// ── Raw → app shape ─────────────────────────────────────────────────────
// Power Automate's flow (matching your other trackers: Recurrence → 4x
// "List rows present in a table" → HTTP GET → Compose → HTTP PUT) commits
// the 4 tables completely unmapped — raw Excel column names, no renaming,
// no id generation. All of that happens here instead, in one place that's
// actually easy to change without opening the flow designer.
//
// Expected raw shape (what the Compose action produces):
// { lastUpdated, projectKey: [...], design: [...], scm: [...], execution: [...] }
// Each row object is keyed by its literal Excel column header.

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n; // handles "-" and "TBD" placeholders from the sheet
};
const str = (v) => (v === "" || v === null || v === undefined ? null : String(v));
// SharePoint/Power Automate encodes "." in column internal names as "_x002e_"
// (so a column literally named "S.No." shows up in the JSON as "S_x002e_No_x002e_").
// Try both forms so this keeps working regardless of exactly how the connector names it.
const field = (r, key) => {
  if (r[key] !== undefined) return r[key];
  const encoded = key.replace(/\./g, "_x002e_");
  return r[encoded] !== undefined ? r[encoded] : undefined;
};

function mapProjects(rows) {
  return (rows || []).map((r) => ({
    code: str(r["Project Code"]),
    name: str(r["Project Name"]),
    site: str(r["Site Location"]),
    category: str(r["Category"]),
    type: str(r["Project Type"]),
    capacityKwp: num(r["Capacity (kWp)"]),
    phase: str(r["Phase"]),
    client: str(r["Client"]),
    ppaDate: str(r["PPA Date"]),
    contractEnd: str(r["Contract End Date"]),
    expComm: str(r["Expected Commissioning"]),
    stage: str(r["Overall Stage"]),
    status: str(r["Overall Status"]),
    execPct: num(r["Execution %"]),
    remarks: str(r["Remarks"]),
  }));
}

function mapDesign(rows) {
  return (rows || []).map((r) => ({
    id: `design-${r["Project Code"]}-${field(r, "S.No.")}`,
    tracker: "Design & Engineering",
    projectCode: str(r["Project Code"]),
    sno: num(field(r, "S.No.")),
    code: str(r["Drawing Number"]),
    name: str(r["Docs Name"]),
    docType: str(r["Docs Type"]),
    category: str(r["Category"]),
    status: str(r["Status"]),
    planStart: str(r["Plan Start"]),
    planEnd: str(r["Plan End"]),
    actualStart: str(r["Actual Start"]),
    actualEnd: str(r["Actual End"]),
    tatDays: num(r["TAT (Days)"]),
    delayDays: num(r["Delay (Days)"]),
    remarks: str(r["Remarks"]),
  }));
}

function mapScm(rows) {
  return (rows || []).map((r) => ({
    id: `scm-${r["Project Code"]}-${field(r, "S.No.")}`,
    tracker: "SCM",
    projectCode: str(r["Project Code"]),
    sno: num(field(r, "S.No.")),
    code: str(r["Item Code"]),
    name: str(r["Item Name"]),
    group: str(r["Item Group"]),
    vendor: str(r["Vendor Name"]),
    uom: str(r["UOM"]),
    totalQty: num(r["Total Scope Qty"]),
    receivedQty: num(r["Received Qty"]),
    status: str(r["Status"]),
    planStart: str(r["Plan Start"]),
    planEnd: str(r["Plan End"]),
    actualStart: str(r["Actual Start"]),
    actualEnd: str(r["Actual End"]),
    tatDays: num(r["TAT (Days)"]),
    delayDays: num(r["Delay (Days)"]),
    remarks: str(r["Remarks"]),
  }));
}

function mapExecution(rows) {
  return (rows || []).map((r) => ({
    id: `exec-${r["Project Code"]}-${field(r, "S.No.")}`,
    tracker: "Execution Tracker",
    projectCode: str(r["Project Code"]),
    sno: num(field(r, "S.No.")),
    code: str(r["WBS Code"]),
    name: str(r["Activity Name"]),
    uom: str(r["UOM"]),
    totalQty: num(r["Total Scope Qty"]),
    completedQty: num(r["Completed Qty"]),
    progressPct: num(r["Progress %"]),
    status: str(r["Status"]),
    planStart: str(r["Plan Start"]),
    planEnd: str(r["Plan End"]),
    actualStart: str(r["Actual Start"]),
    actualEnd: str(r["Actual End"]),
    tatDays: num(r["TAT (Days)"]),
    delayDays: num(r["Delay (Days)"]),
    remarks: str(r["Remarks"]),
  }));
}

// Milestone Payments has a single Target Date + single Actual Date, not a
// start/end pair — mapped onto planEnd/actualEnd only (planStart/actualStart
// left null) so it reuses the same Range chart the other trackers use: with
// only an end date on file, the chart estimates a short window ending there
// and marks it dashed, which reads correctly as a point-in-time milestone.
// Status is derived here (Achieved/Overdue/Pending) since the sheet has no
// Status column of its own — Target Date, Actual Date, TAT and Delay are
// already fully computed by Excel formulas (against Execution Tracker and
// Milestone Summary), so Power Automate just needs to list the raw rows.
function mapMilestonePayments(rows) {
  return (rows || []).map((r) => {
    const actualEnd = str(r["Actual Date"]);
    const delayDays = num(r["Delay (Days)"]);
    const status = actualEnd ? "Achieved" : delayDays > 0 ? "Overdue" : "Pending";
    return {
      id: `milestone-${r["Project Code"]}-${field(r, "S.No")}`,
      tracker: "Milestone Payments",
      projectCode: str(r["Project Code"]),
      sno: num(field(r, "S.No")),
      code: str(r["Cost Category"]),
      name: str(r["Milestone"]),
      payPct: num(r["Pay %"]),
      basicAmt: num(r["Milestone Basic Amt (INR)"]),
      totalAmt: num(r["Milestone Total (INR)"]),
      status,
      planStart: null,
      planEnd: str(r["Target Date"]),
      actualStart: null,
      actualEnd,
      tatDays: num(r["TAT (Days)"]),
      delayDays,
      remarks: str(r["Remark (PO Terms)"]),
    };
  });
}

// Manpower & Machinery has a different shape (Planned/Actual Qty, Mobilization/
// Demobilization dates) rather than Plan/Actual pairs — mapped loosely onto the
// same item shape so it can sit in the Project Detail summary alongside the
// other trackers. Not added to the Schedule Explorer's tracker filter since its
// fields don't mean the same thing as TAT/Delay elsewhere.
function mapManpower(rows) {
  return (rows || []).map((r, idx) => ({
    id: `manpower-${r["Project Code"]}-${idx}`,
    tracker: "Manpower & Machinery",
    projectCode: str(r["Project Code"]),
    code: str(r["Resource Category"]),
    name: str(r["Role / Equipment Type"]),
    vendor: str(r["Vendor / Agency"]),
    plannedQty: num(r["Planned Qty"]),
    actualQty: num(r["Actual Deployed Qty"]),
    status: str(r["Status"]),
    planStart: null,
    planEnd: str(r["Demobilization Date (Plan)"]),
    actualStart: str(r["Mobilization Date"]),
    actualEnd: null,
    tatDays: num(r["Duration (Days)"]),
    delayDays: null,
    remarks: str(r["Remarks"]),
  }));
}

// Accepts either the raw Power Automate shape (projectKey/design/scm/execution/milestonePayments)
// or the already-flat shape (projects/items) — so local dev against the static
// tracker.json snapshot keeps working without changes.
function normalize(raw) {
  if (raw.projects && raw.items) return raw;
  return {
    lastUpdated: raw.lastUpdated,
    projects: mapProjects(raw.projectKey),
    items: [
      ...mapDesign(raw.design),
      ...mapScm(raw.scm),
      ...mapManpower(raw.manpower),
      ...mapExecution(raw.execution),
      ...mapMilestonePayments(raw.milestonePayments),
    ],
  };
}

function useTrackerData() {
  const [data, setData] = useState({ projects: [], items: [], lastUpdated: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch(DATA_URL, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setData(normalize(json));
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Auto-poll — no user action needed to see new data. Matches the Ops
    // Dashboard's DATA_URL refresh interval.
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return { ...data, loading, error };
}

// ============================================================================
// STATUS BADGE (was components/StatusBadge.jsx)
// ============================================================================
function StatusBadge({ status }) {
  if (!status) return <span style={{ color: "#aab3a0", fontSize: 11 }}>—</span>;
  const cfg = statusStyle(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.text,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

// ============================================================================
// FRESHNESS INDICATOR (was components/FreshnessIndicator.jsx)
// ============================================================================
function FreshnessIndicator({ lastUpdated }) {
  if (!lastUpdated) return null;
  const d = new Date(lastUpdated);
  const stale = Date.now() - d.getTime() > 7 * 86400000;
  return (
    <span style={{ fontSize: 10, color: stale ? "#c0392b" : B.muted }}>
      {stale ? "⚠ Stale — " : "🔄 "}
      {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}{" "}
      {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

// ============================================================================
// SCHEDULE EXPLORER — the Plan/Actual/TAT/Delay chart (was components/GanttExplorer.jsx)
// ============================================================================
// View modes = exactly the 6 tracker fields, grouped into 2 timeline modes
// (Plan / Actual, each rendering a Start→End bar) and 2 ranked-metric modes
// (TAT / Delay, each rendering a single Days bar).
const VIEW_MODES = [
  { id: "plan", label: "Plan Start → Plan End", kind: "range", startKey: "planStart", endKey: "planEnd" },
  { id: "actual", label: "Actual Start → Actual End", kind: "range", startKey: "actualStart", endKey: "actualEnd" },
  { id: "tat", label: "TAT (Days)", kind: "metric", key: "tatDays" },
  { id: "delay", label: "Delay (Days)", kind: "metric", key: "delayDays" },
];

const RANK_LIMIT = 30;

// Deterministic illustrative dates/numbers — ONLY shown when the person
// explicitly turns on "Preview with sample data". Never mixed into the real
// dataset silently. Seeded off the item's index so it's stable across renders.
function demoOverlay(item, idx) {
  const today = new Date();
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const planStart = addDays(today, -60 + (idx % 10) * 6);
  const planDur = 8 + (idx % 6) * 3;
  const planEnd = addDays(planStart, planDur);
  const slip = (idx % 4) - 1; // -1, 0, 1, 2 (days of slip vs plan)
  const actualStart = idx % 5 === 0 ? null : addDays(planStart, slip);
  const actualEnd =
    idx % 7 === 0 ? null : addDays(planEnd, slip * 2 + (idx % 3));
  const tatDays = actualStart && actualEnd
    ? Math.max(1, Math.round((actualEnd - actualStart) / 86400000))
    : null;
  const delayDays = actualEnd && planEnd && actualEnd > planEnd
    ? Math.round((actualEnd - planEnd) / 86400000)
    : 0;
  return {
    planStart: planStart.toISOString().slice(0, 10),
    planEnd: planEnd.toISOString().slice(0, 10),
    actualStart: actualStart ? actualStart.toISOString().slice(0, 10) : null,
    actualEnd: actualEnd ? actualEnd.toISOString().slice(0, 10) : null,
    tatDays,
    delayDays,
  };
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: B.oliveL, borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding: "5px 11px",
            borderRadius: 6,
            border: "none",
            background: value === v ? "#fff" : "transparent",
            color: value === v ? B.text : B.muted,
            fontSize: 11,
            fontWeight: value === v ? 700 : 500,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function GanttExplorer({ items, projects }) {
  const [tracker, setTracker] = useState("Execution Tracker");
  const [projectCode, setProjectCode] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("plan");
  const [showDemo, setShowDemo] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);

  const mode = VIEW_MODES.find((m) => m.id === viewMode);

  const projectName = (code) => projects.find((p) => p.code === code)?.name || code;

  const scoped = useMemo(() => {
    return items
      .filter((it) => tracker === "All" || it.tracker === tracker)
      .filter((it) => projectCode === "All" || it.projectCode === projectCode)
      .filter((it) => statusF === "All" || it.status === statusF)
      .filter(
        (it) =>
          !search ||
          it.name?.toLowerCase().includes(search.toLowerCase()) ||
          it.code?.toLowerCase().includes(search.toLowerCase())
      )
      .map((it, idx) => (showDemo ? { ...it, ...demoOverlay(it, idx) } : it));
  }, [items, tracker, projectCode, statusF, search, showDemo]);

  useEffect(() => setSelected(null), [tracker, projectCode, statusF, search, viewMode]);

  const statusOptions = useMemo(
    () => ["All", ...new Set(scoped.map((i) => i.status).filter(Boolean))],
    [scoped]
  );

  // ── RANGE MODE (Plan / Actual) ──────────────────────────────────────────
  const rangeRows = useMemo(() => {
    if (mode.kind !== "range") return [];
    return scoped
      .map((it) => {
        const s = parseDateStr(it[mode.startKey]);
        const e = parseDateStr(it[mode.endKey]);
        if (!s && !e) return null;
        let start = s, end = e, estimated = false;
        if (!start && end) { start = new Date(end.getTime() - 10 * 86400000); estimated = true; }
        if (start && !end) { end = new Date(start.getTime() + 10 * 86400000); estimated = true; }
        return { it, start, end, estimated };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  }, [scoped, mode]);

  const rangeAxis = useMemo(() => {
    if (!rangeRows.length) return null;
    const today = new Date();
    const allDates = rangeRows.flatMap((r) => [r.start, r.end]);
    let axisStart = new Date(Math.min(...allDates.map((d) => d.getTime()), today.getTime()) - 6 * 86400000);
    let axisEnd = new Date(Math.max(...allDates.map((d) => d.getTime()), today.getTime()) + 6 * 86400000);
    const total = axisEnd.getTime() - axisStart.getTime();
    const pctOf = (d) => Math.min(100, Math.max(0, ((d.getTime() - axisStart.getTime()) / total) * 100));
    const ticks = [];
    const cursor = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1);
    let lastPct = -Infinity;
    while (cursor <= axisEnd) {
      const p = pctOf(cursor);
      if (p - lastPct >= 9) { ticks.push(new Date(cursor)); lastPct = p; }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { axisStart, axisEnd, pctOf, ticks, todayPct: pctOf(today) };
  }, [rangeRows]);

  // ── METRIC MODE (TAT / Delay) ───────────────────────────────────────────
  const metricRows = useMemo(() => {
    if (mode.kind !== "metric") return [];
    return scoped
      .map((it) => ({ it, value: it[mode.key] }))
      .filter((r) => typeof r.value === "number" && !isNaN(r.value) && r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scoped, mode]);

  const visibleMetricRows = showAll ? metricRows : metricRows.slice(0, RANK_LIMIT);
  const maxMetric = metricRows.length ? metricRows[0].value : 1;

  const withData = mode.kind === "range" ? rangeRows.length : metricRows.length;

  return (
    <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header / controls */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.border}`, background: B.bg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>Schedule Explorer</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: B.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />
            Preview with sample data
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
            View
          </div>
          <Toggle options={VIEW_MODES.map((m) => [m.id, m.label])} value={viewMode} onChange={setViewMode} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={tracker} onChange={(e) => setTracker(e.target.value)} style={selStyle}>
            {["All", ...TRACKERS].map((t) => (
              <option key={t} value={t}>{t === "All" ? "All Trackers" : t}</option>
            ))}
          </select>
          <select value={projectCode} onChange={(e) => setProjectCode(e.target.value)} style={selStyle}>
            <option value="All">All Projects</option>
            {projects.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={selStyle}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s === "All" ? "All Statuses" : s}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item / code..."
            style={{ ...selStyle, width: 160 }}
          />
        </div>
      </div>

      {/* Demo banner */}
      {showDemo && (
        <div style={{ padding: "8px 16px", background: "#fff9c4", borderBottom: `1px solid ${B.border}`, fontSize: 11, color: "#8a7000", fontWeight: 600 }}>
          ⚠ Showing illustrative sample dates for preview only — your tracker doesn't have this data filled in yet. Turn this off to see the real (currently mostly empty) state.
        </div>
      )}

      <div style={{ padding: "6px 16px", fontSize: 11, color: B.muted, borderBottom: `1px solid ${B.border}` }}>
        <strong style={{ color: B.text }}>{withData}</strong> of <strong style={{ color: B.text }}>{scoped.length}</strong> items have {mode.label.toLowerCase()} data
        {!showDemo && withData === 0 && " — fill in the tracker to populate this view"}
      </div>

      {/* Body */}
      <div style={{ padding: "16px 20px 20px", overflowX: "auto" }}>
        {mode.kind === "range" && rangeRows.length === 0 && (
          <EmptyState text={`No items have both a ${mode.startKey === "planStart" ? "Plan" : "Actual"} Start/End on file for this selection.`} />
        )}
        {mode.kind === "range" && rangeRows.length > 0 && (
          <RangeChart rows={rangeRows} axis={rangeAxis} mode={mode} projectName={projectName} selectedId={selected?.id} onSelect={setSelected} />
        )}

        {mode.kind === "metric" && metricRows.length === 0 && (
          <EmptyState text={`No items have a ${mode.label} value for this selection.`} />
        )}
        {mode.kind === "metric" && metricRows.length > 0 && (
          <>
            <MetricChart rows={visibleMetricRows} max={maxMetric} mode={mode} projectName={projectName} selectedId={selected?.id} onSelect={setSelected} />
            {metricRows.length > RANK_LIMIT && (
              <button
                onClick={() => setShowAll((v) => !v)}
                style={{ marginTop: 10, fontSize: 11, color: B.blue, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                {showAll ? "Show top 30 only" : `Show all ${metricRows.length} items`}
              </button>
            )}
          </>
        )}
      </div>

      {selected && <ItemDetail item={selected} projectName={projectName} onClose={() => setSelected(null)} />}
    </div>
  );
}

const selStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  border: `1px solid ${B.border}`,
  background: "#fff",
  fontSize: 11,
  fontFamily: "inherit",
  outline: "none",
};

function EmptyState({ text }) {
  return (
    <div style={{ padding: "30px 10px", textAlign: "center", color: B.muted, fontSize: 12, fontStyle: "italic" }}>
      {text}
    </div>
  );
}

function RangeChart({ rows, axis, mode, projectName, selectedId, onSelect }) {
  const isDelaySensitive = mode.id === "plan"; // only Plan bars can show "still open past plan end"
  const today = new Date();
  return (
    <div>
      <div style={{ display: "flex", position: "relative", height: 22, borderBottom: `1px solid ${B.border}`, marginLeft: 260, marginBottom: 6 }}>
        {axis.ticks.map((m, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${axis.pctOf(m)}%`,
              borderLeft: `1px solid ${B.border}`,
              paddingLeft: 5,
              fontSize: 10,
              fontWeight: 600,
              color: B.muted,
              whiteSpace: "nowrap",
            }}
          >
            {m.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 460, overflowY: "auto" }}>
        {rows.map(({ it, start, end, estimated }) => {
          const color = TRACKER_COLOR[it.tracker] || B.blue;
          const light = TRACKER_LIGHT[it.tracker] || B.blueL;
          const left = axis.pctOf(start);
          const width = Math.max(1.2, axis.pctOf(end) - axis.pctOf(start));
          const overdue = isDelaySensitive && !estimated && end < today && it.status !== "Approved" && it.status !== "Completed" && it.status !== "Received" && it.status !== "GH2 Provided";
          const isSel = selectedId === it.id;
          return (
            <div
              key={it.id}
              onClick={() => onSelect(isSel ? null : it)}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: 34,
                cursor: "pointer",
                background: isSel ? B.blueL : "transparent",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  width: 260,
                  flexShrink: 0,
                  paddingRight: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  color: overdue ? "#c0392b" : B.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={`${it.name} · ${projectName(it.projectCode)} — click for remarks & dates`}
              >
                {it.name}
                <div style={{ fontSize: 9, fontWeight: 400, color: B.muted, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {projectName(it.projectCode)}
                </div>
              </div>
              <div style={{ flex: 1, position: "relative", height: 26 }}>
                <div style={{ position: "absolute", left: `${axis.todayPct}%`, top: -4, bottom: -4, width: 1, background: B.blue, opacity: 0.4 }} />
                <div
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 4,
                    height: 18,
                    borderRadius: 5,
                    background: overdue ? "#fef2f2" : light,
                    border: `1.5px ${estimated ? "dashed" : "solid"} ${overdue ? "#c0392b" : color}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricChart({ rows, max, mode, projectName, selectedId, onSelect }) {
  const isDelay = mode.id === "delay";
  return (
    <div style={{ maxHeight: 460, overflowY: "auto" }}>
      {rows.map(({ it, value }) => {
        const pct = Math.max(2, (value / max) * 100);
        const color = isDelay ? (value > 14 ? "#c0392b" : value > 5 ? "#c8850a" : "#e0a020") : TRACKER_COLOR[it.tracker] || B.blue;
        const isSel = selectedId === it.id;
        return (
          <div
            key={it.id}
            onClick={() => onSelect(isSel ? null : it)}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 30,
              cursor: "pointer",
              background: isSel ? B.blueL : "transparent",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width: 260,
                flexShrink: 0,
                paddingRight: 10,
                fontSize: 11,
                fontWeight: 600,
                color: B.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={`${it.name} · ${projectName(it.projectCode)} — click for remarks & dates`}
            >
              {it.name}
              <div style={{ fontSize: 9, fontWeight: 400, color: B.muted, overflow: "hidden", textOverflow: "ellipsis" }}>
                {projectName(it.projectCode)}
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 14, background: B.bg, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: 14, background: color, borderRadius: 4 }} />
              </div>
              <div style={{ width: 46, textAlign: "right", fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>
                {value}d
              </div>
              <StatusBadge status={it.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ITEM DETAIL — shown when a row is clicked, includes remarks + all dates ──
function ItemDetail({ item, projectName, onClose }) {
  const isMilestone = item.tracker === "Milestone Payments";
  const fields = isMilestone
    ? [
        ["Project", projectName(item.projectCode)],
        ["Tracker", item.tracker],
        ["Cost category", item.code],
        ["Status", item.status || "—"],
        ["Target date", dispDate(item.planEnd)],
        ["Achieved date", dispDate(item.actualEnd)],
        ["TAT (days)", item.tatDays ?? "—"],
        ["Delay (days)", item.delayDays ?? "—"],
        ["Pay %", item.payPct != null ? `${(item.payPct * 100).toFixed(1)}%` : "—"],
        ["Milestone total (INR)", item.totalAmt != null ? item.totalAmt.toLocaleString("en-IN") : "—"],
      ]
    : [
        ["Project", projectName(item.projectCode)],
        ["Tracker", item.tracker],
        ["Code", item.code],
        ["Status", item.status || "—"],
        ["Plan start", dispDate(item.planStart)],
        ["Plan end", dispDate(item.planEnd)],
        ["Actual start", dispDate(item.actualStart)],
        ["Actual end", dispDate(item.actualEnd)],
        ["TAT (days)", item.tatDays ?? "—"],
        ["Delay (days)", item.delayDays ?? "—"],
      ];
  if (item.vendor) fields.push(["Vendor", item.vendor]);
  if (item.uom) fields.push(["UOM", item.uom]);

  return (
    <div style={{ borderTop: `1px solid ${B.border}`, background: B.bg, padding: "14px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{item.name}</div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px 16px", marginBottom: 12 }}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: B.text, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
          Remarks
        </div>
        <div style={{ fontSize: 12, color: item.remarks ? B.text : B.muted, fontStyle: item.remarks ? "normal" : "italic", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {item.remarks || "No remarks logged yet."}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// APP — page layout, KPI strip, assembles everything above (was App.jsx)
// ============================================================================
function KpiCard({ val, lbl, sub, col, bg }) {
  return (
    <div style={{ background: bg, border: `1px solid ${col}33`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: col, marginTop: 2 }}>{lbl}</div>
      <div style={{ fontSize: 11, color: col, opacity: 0.6, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

// ============================================================================
// PROJECT DETAIL — journey bar + stage timeline for one project at a time.
// Reuses the item-level Plan/Actual dates already in tracker.json — no new
// Power Automate work needed. Each stage below is a *rollup* of existing
// tracker items, not a new data source:
//   Design & Engineering -> Design & Engineering tracker items
//   Procurement (Supply) -> SCM tracker items
//   Construction         -> Execution Tracker items, except WBS 4.3.x / 9.x
//   Transmission Line    -> Execution Tracker items with WBS code starting "4.3"
//   Commissioning        -> Execution Tracker items with WBS code starting "9"
//   Handover              -> the "Final acceptance and handover" milestone
//                            (currently unlinked/manual — see Milestone Payments)
// ============================================================================

const JOURNEY_STAGES = ["Project Won", "Design & Engineering", "Procurement", "Execution", "Commissioning", "Handover"];

const STAGE_TIMELINE_CONFIG = [
  { id: "design", label: "Design & Engineering", color: "#7B1FA2", light: "#F3E5F5", match: (it) => it.tracker === "Design & Engineering" },
  { id: "procure", label: "Procurement (Supply)", color: "#1565C0", light: "#E3F2FD", match: (it) => it.tracker === "SCM" },
  { id: "build", label: "Construction", color: "#E65100", light: "#FFF3E0", match: (it) => it.tracker === "Execution Tracker" && !(it.code || "").startsWith("4.3") && !(it.code || "").startsWith("9") },
  { id: "trans", label: "Transmission Line", color: "#4A148C", light: "#EDE7F6", match: (it) => it.tracker === "Execution Tracker" && (it.code || "").startsWith("4.3") },
  { id: "comm", label: "Commissioning", color: "#1B5E20", light: "#E8F5E9", match: (it) => it.tracker === "Execution Tracker" && (it.code || "").startsWith("9") },
  { id: "hand", label: "Handover", color: "#006064", light: "#E0F7FA", match: (it) => it.tracker === "Milestone Payments" && it.name === "Final acceptance and handover" },
];

// A "done" status per tracker, used only to color a stage's completion pace.
const DONE_STATUSES = new Set(["Approved", "GH2 Provided", "Completed", "Received", "Achieved", "Mobilized", "Demobilized"]);

function computeStageRanges(projectItems) {
  const today = new Date();
  return STAGE_TIMELINE_CONFIG.map((stage) => {
    const stageItems = projectItems.filter(stage.match);
    const dated = stageItems
      .map((it) => ({
        start: parseDateStr(it.actualStart) || parseDateStr(it.planStart),
        end: parseDateStr(it.actualEnd) || parseDateStr(it.planEnd),
      }))
      .filter((d) => d.start || d.end);
    if (!dated.length) return { stage, hasData: false, itemCount: stageItems.length };

    let start = dated.reduce((min, d) => (d.start && (!min || d.start < min) ? d.start : min), null);
    let end = dated.reduce((max, d) => (d.end && (!max || d.end > max) ? d.end : max), null);
    let estimated = false;
    if (!start && end) { start = new Date(end.getTime() - 20 * 86400000); estimated = true; }
    if (start && !end) { end = new Date(start.getTime() + 20 * 86400000); estimated = true; }

    const doneCount = stageItems.filter((it) => DONE_STATUSES.has(it.status)).length;
    const pct = stageItems.length ? Math.round((doneCount / stageItems.length) * 100) : 0;

    const isDelayed = !estimated && end < today && pct < 100;
    let isAtRisk = false;
    if (!estimated && !isDelayed && today >= start && today <= end) {
      const span = end.getTime() - start.getTime();
      const pctTimeUsed = span > 0 ? ((today.getTime() - start.getTime()) / span) * 100 : 0;
      isAtRisk = pctTimeUsed - pct >= 20;
    }
    return { stage, hasData: true, itemCount: stageItems.length, start, end, estimated, pct, isDelayed, isAtRisk };
  });
}

function ProjectJourney({ project }) {
  const idx = JOURNEY_STAGES.indexOf(project.stage);
  return (
    <div style={{ padding: "14px 20px", background: "#fff", border: `1px solid ${B.border}`, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: B.muted, letterSpacing: 1, marginBottom: 8 }}>PROJECT JOURNEY</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
        {JOURNEY_STAGES.map((lane, i) => {
          const isPast = i < idx, isCur = i === idx;
          const col = TRACKER_COLOR[lane] || B.blue;
          return (
            <div key={lane} style={{ flex: 1 }}>
              <div style={{ height: 7, borderRadius: 4, background: isCur ? B.blue : isPast ? B.olive : "#e0e0e0", marginBottom: 3 }} />
              {isCur && <div style={{ fontSize: 8, color: B.blue, fontWeight: 700, textAlign: "center" }}>▼</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: B.muted }}>Project Won</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: B.blue }}>{project.stage || "—"}</span>
        <span style={{ fontSize: 9, color: B.muted }}>Handover</span>
      </div>
    </div>
  );
}

function StageTimeline({ ranges }) {
  const dated = ranges.filter((r) => r.hasData);
  if (!dated.length) {
    return (
      <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 11, color: B.muted, fontStyle: "italic" }}>
        No task-level dates on file yet for this project — fill Plan/Actual dates in the tracker to see a stage timeline here.
      </div>
    );
  }
  const today = new Date();
  const allDates = dated.flatMap((r) => [r.start, r.end]);
  const axisStart = new Date(Math.min(...allDates.map((d) => d.getTime()), today.getTime()) - 10 * 86400000);
  const axisEnd = new Date(Math.max(...allDates.map((d) => d.getTime()), today.getTime()) + 10 * 86400000);
  const total = axisEnd.getTime() - axisStart.getTime();
  const pctOf = (d) => Math.min(100, Math.max(0, ((d.getTime() - axisStart.getTime()) / total) * 100));
  const todayPct = pctOf(today);

  const ticks = [];
  const cursor = new Date(axisStart.getFullYear(), axisStart.getMonth(), 1);
  let lastPct = -Infinity;
  while (cursor <= axisEnd) {
    const p = pctOf(cursor);
    if (p - lastPct >= 9) { ticks.push(new Date(cursor)); lastPct = p; }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${B.border}`, fontSize: 11, color: B.muted }}>
        Derived from Plan/Actual dates already in each tracker — not a separate data entry.{" "}
        <strong style={{ color: "#c0392b" }}>Red hatched</strong> = past its end date and not finished.{" "}
        <strong style={{ color: "#c8850a" }}>Amber dashed</strong> = within its window but behind pace.
      </div>
      <div style={{ padding: "16px 20px 20px", overflowX: "auto" }}>
        <div style={{ display: "flex", position: "relative", height: 22, borderBottom: `1px solid ${B.border}`, marginLeft: 190, marginBottom: 8 }}>
          {ticks.map((m, i) => (
            <div key={i} style={{ position: "absolute", left: `${pctOf(m)}%`, borderLeft: `1px solid ${B.border}`, paddingLeft: 5, fontSize: 10, fontWeight: 600, color: B.muted, whiteSpace: "nowrap" }}>
              {m.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
            </div>
          ))}
        </div>
        {ranges.map((r) => {
          const { stage } = r;
          if (!r.hasData) {
            return (
              <div key={stage.id} style={{ display: "flex", alignItems: "center", minHeight: 36 }}>
                <div style={{ width: 190, flexShrink: 0, fontSize: 12, fontWeight: 700, color: B.muted, paddingRight: 10 }}>{stage.label}</div>
                <div style={{ flex: 1, fontSize: 10, color: B.muted, fontStyle: "italic" }}>
                  {r.itemCount ? "No dates on file yet" : "No matching items in this tracker"}
                </div>
              </div>
            );
          }
          const left = pctOf(r.start);
          const width = Math.max(2, pctOf(r.end) - pctOf(r.start));
          const rowColor = r.isDelayed ? "#c0392b" : r.isAtRisk ? "#c8850a" : stage.color;
          const delayDays = r.isDelayed ? Math.round((today.getTime() - r.end.getTime()) / 86400000) : 0;
          const delayLeft = pctOf(r.end);
          const delayWidth = r.isDelayed ? Math.max(1, todayPct - delayLeft) : 0;
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", minHeight: 44 }}>
              <div style={{ width: 190, flexShrink: 0, fontSize: 12, fontWeight: 700, color: rowColor, paddingRight: 10, display: "flex", alignItems: "center", gap: 4 }}>
                {stage.label}
                {r.isDelayed && <span title={`${delayDays}d overdue`}>⚠</span>}
                {r.isAtRisk && <span title="Behind pace">⏱</span>}
              </div>
              <div style={{ flex: 1, position: "relative", height: 34 }}>
                <div style={{ position: "absolute", left: `${todayPct}%`, top: -4, bottom: -4, width: 1, background: B.blue, opacity: 0.4 }} />
                <div
                  title={`${fmtShortDate(r.start)} → ${fmtShortDate(r.end)}${r.estimated ? " (estimated)" : ""} · ${r.pct}% items done`}
                  style={{
                    position: "absolute", left: `${left}%`, width: `${width}%`, top: 5, height: 22,
                    borderRadius: r.isDelayed ? "6px 0 0 6px" : 6,
                    background: r.isAtRisk ? "#fdf0d5" : stage.light,
                    border: `2px ${r.estimated || r.isAtRisk ? "dashed" : "solid"} ${r.isAtRisk ? "#c8850a" : r.isDelayed ? "#c0392b" : stage.color}`,
                    borderRight: r.isDelayed ? "none" : undefined,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: rowColor, whiteSpace: "nowrap", overflow: "hidden",
                  }}
                >
                  {fmtShortDate(r.start)} → {fmtShortDate(r.end)}
                </div>
                {r.isDelayed && (
                  <div
                    title={`${delayDays}d overdue`}
                    style={{
                      position: "absolute", left: `${delayLeft}%`, width: `${delayWidth}%`, top: 5, height: 22,
                      borderRadius: "0 6px 6px 0",
                      background: "repeating-linear-gradient(45deg, #fef2f2, #fef2f2 4px, #fecaca 4px, #fecaca 8px)",
                      border: "2px solid #c0392b", borderLeft: "none",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TRACKER SUMMARY + DETAIL DRILL-DOWN ─────────────────────────────────────
// Click a card to expand the full line-item list for that tracker below it —
// every row in the sheet for this project, with its own dates/TAT/%/status,
// not just the aggregate count.
const ALL_TRACKERS_FOR_SUMMARY = ["Design & Engineering", "SCM", "Manpower & Machinery", "Execution Tracker", "Milestone Payments"];

function TrackerSummary({ projectItems, selected, onSelect }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
        Overall Journey — all trackers for this project (click a card for full line items)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
        {ALL_TRACKERS_FOR_SUMMARY.map((trackerName) => {
          const trackerItems = projectItems.filter((it) => it.tracker === trackerName);
          const total = trackerItems.length;
          const done = trackerItems.filter((it) => DONE_STATUSES.has(it.status)).length;
          const delayed = trackerItems.filter((it) => typeof it.delayDays === "number" && it.delayDays > 0).length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const color = TRACKER_COLOR[trackerName] || B.blue;
          const light = TRACKER_LIGHT[trackerName] || B.blueL;
          const isSel = selected === trackerName;
          return (
            <div
              key={trackerName}
              onClick={() => onSelect(isSel ? null : trackerName)}
              style={{
                background: isSel ? light : "#fff",
                border: `1px solid ${isSel ? color : B.border}`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 10,
                padding: "11px 12px",
                cursor: total ? "pointer" : "default",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 6, lineHeight: 1.2, minHeight: 24 }}>{trackerName}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: B.text, fontFamily: "monospace" }}>{total}</div>
              <div style={{ fontSize: 9, color: B.muted, marginBottom: 6 }}>items tracked</div>
              <div style={{ height: 5, background: light, borderRadius: 3, marginBottom: 4 }}>
                <div style={{ height: 5, borderRadius: 3, width: `${pct}%`, background: color }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                <span style={{ color: B.muted }}>{pct}% done</span>
                {delayed > 0 ? (
                  <span style={{ color: "#c0392b", fontWeight: 700 }}>{delayed} delayed</span>
                ) : total > 0 ? (
                  <span style={{ color: "#0d7a32", fontWeight: 700 }}>on track</span>
                ) : (
                  <span style={{ color: B.muted }}>—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackerDetailTable({ tracker, items, onClose }) {
  const color = TRACKER_COLOR[tracker] || B.blue;
  const isMilestone = tracker === "Milestone Payments";
  const isManpower = tracker === "Manpower & Machinery";

  return (
    <div style={{ background: "#fff", border: `1px solid ${B.border}`, borderLeft: `3px solid ${color}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${B.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>{tracker} — {items.length} items</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }} aria-label="Close">×</button>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: B.bg, zIndex: 1 }}>
              {["Item", "Status", "Plan", "Actual", "TAT", "Delay", isMilestone ? "Pay % / Amount" : isManpower ? "Qty" : "Remarks"].map((h) => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `2px solid ${B.border}`, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} style={{ background: i % 2 === 0 ? "#fff" : B.bg }}>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, maxWidth: 260 }}>
                  <div style={{ fontWeight: 600, color: B.text }}>{it.name || "—"}</div>
                  {it.code && <div style={{ fontSize: 9, color: B.muted }}>{it.code}</div>}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}` }}>
                  <StatusBadge status={it.status} />
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, whiteSpace: "nowrap", color: B.muted }}>
                  {dispDate(it.planStart)} → {dispDate(it.planEnd)}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, whiteSpace: "nowrap", color: B.muted }}>
                  {dispDate(it.actualStart)} → {dispDate(it.actualEnd)}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, textAlign: "right", fontFamily: "monospace" }}>
                  {typeof it.tatDays === "number" ? `${it.tatDays}d` : "—"}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, textAlign: "right", fontFamily: "monospace", color: typeof it.delayDays === "number" && it.delayDays > 0 ? "#c0392b" : B.muted, fontWeight: typeof it.delayDays === "number" && it.delayDays > 0 ? 700 : 400 }}>
                  {typeof it.delayDays === "number" ? `${it.delayDays}d` : "—"}
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${B.border}`, color: B.muted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isMilestone
                    ? `${it.payPct != null ? (it.payPct * 100).toFixed(1) + "%" : "—"} / ${it.totalAmt != null ? "₹" + it.totalAmt.toLocaleString("en-IN") : "—"}`
                    : isManpower
                    ? `${it.actualQty ?? "—"} / ${it.plannedQty ?? "—"}`
                    : it.remarks || "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: B.muted, fontStyle: "italic" }}>
                  No items in this tracker for this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Catches render errors so a genuine crash shows the actual error text instead
// of a blank white screen — makes any future bug reportable instead of just "it broke."
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, margin: 20, background: "#fef2f2", border: "1px solid #f5a5a5", borderRadius: 10, fontSize: 12, color: "#922b21" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Something broke rendering this page</div>
          <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{String(this.state.error?.message || this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProjectDetail({ projects, items }) {
  const [code, setCode] = useState(projects[0]?.code || "");
  const [expandedTracker, setExpandedTracker] = useState(null);
  const project = projects.find((p) => p.code === code);
  const projectItems = useMemo(() => items.filter((it) => it.projectCode === code), [items, code]);
  const ranges = useMemo(() => computeStageRanges(projectItems), [projectItems]);
  useEffect(() => setExpandedTracker(null), [code]);

  if (!project) {
    return <div style={{ padding: 20, fontSize: 12, color: B.muted }}>No projects on file yet.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <select value={code} onChange={(e) => setCode(e.target.value)} style={selStyle}>
          {projects.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: project.category === "GH2" ? B.blue : B.olive, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: B.muted }}>{project.code}</span>
            <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: (project.category === "GH2" ? B.blue : B.olive) + "25", color: project.category === "GH2" ? B.blue : B.olive, fontWeight: 700 }}>
              {project.type || project.category}
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: B.text }}>{project.name}</div>
        </div>
        <span style={{ fontSize: 12, background: B.greenL, color: "#0d7a32", border: "1px solid #86d9a0", padding: "4px 12px", borderRadius: 20, fontWeight: 600 }}>
          {project.status || "—"}
        </span>
      </div>

      <ProjectJourney project={project} />

      <TrackerSummary projectItems={projectItems} selected={expandedTracker} onSelect={setExpandedTracker} />

      {expandedTracker && (
        <TrackerDetailTable
          tracker={expandedTracker}
          items={projectItems.filter((it) => it.tracker === expandedTracker)}
          onClose={() => setExpandedTracker(null)}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        <SmallCard label="Size" value={project.capacityKwp ? `${project.capacityKwp.toLocaleString("en-IN")} kWp` : "—"} accent={B.olive} />
        <SmallCard label="Stage" value={project.stage || "—"} accent={B.blue} />
        <SmallCard label="Client" value={project.client || "—"} accent={B.green} />
        <SmallCard label="Contract End" value={dispDate(project.contractEnd)} accent="#E65100" />
      </div>

      <div style={{ padding: "16px 20px", background: "#fff", border: `1px solid ${B.border}`, borderLeft: `3px solid ${pctCol(project.execPct * 100 || 0)}`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>Overall completion</span>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: pctCol((project.execPct || 0) * 100) }}>
            {Math.round((project.execPct || 0) * 100)}%
          </span>
        </div>
        <div style={{ height: 10, background: "#e0e0e0", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ height: 10, borderRadius: 6, width: `${(project.execPct || 0) * 100}%`, background: pctCol((project.execPct || 0) * 100) }} />
        </div>
      </div>

      {project.remarks && project.remarks !== "-" && (
        <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #f5a5a5", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#c0392b" }}>REMARKS</div>
          <div style={{ fontSize: 12, color: "#922b21", marginTop: 2 }}>{project.remarks}</div>
        </div>
      )}

      <StageTimeline ranges={ranges} />
    </div>
  );
}

function SmallCard({ label, value, accent }) {
  return (
    <div style={{ background: B.bg, borderRadius: 10, border: `1px solid ${accent}22`, borderLeft: `3px solid ${accent}`, padding: "11px 14px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: B.text, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

export default function App() {
  const { projects, items, lastUpdated, loading, error } = useTrackerData();
  const [page, setPage] = useState("explorer"); // explorer | detail

  const totalItems = items.length;
  const delayedCount = items.filter((i) => typeof i.delayDays === "number" && i.delayDays > 0).length;
  const withDates = items.filter((i) => i.planStart || i.planEnd || i.actualStart || i.actualEnd).length;

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: B.bg, minHeight: "100vh" }}>
      <div
        style={{
          background: "#fff",
          borderBottom: `2px solid ${B.olive}`,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ padding: "12px 0", marginRight: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `linear-gradient(135deg,${B.olive},${B.green})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 900,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            GH2
            <br />
            SOLAR
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.muted, letterSpacing: 1 }}>UPNEDA TRACKER</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{page === "explorer" ? "Schedule Explorer" : "Project Detail"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 2, background: B.oliveL, borderRadius: 8, padding: 3 }}>
          {[["explorer", "Schedule Explorer"], ["detail", "Project Detail"]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPage(v)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: page === v ? "#fff" : "transparent",
                color: page === v ? B.text : B.muted,
                fontSize: 12, fontWeight: page === v ? 700 : 500,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <FreshnessIndicator lastUpdated={lastUpdated} />
          {error && (
            <span style={{ fontSize: 10, color: "#c0392b", background: "#fef2f2", padding: "3px 8px", borderRadius: 6 }}>
              ⚠ {error}
            </span>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "70vh", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: `4px solid ${B.border}`,
              borderTopColor: B.olive,
              animation: "spin 1s linear infinite",
            }}
          />
          <div style={{ fontSize: 13, color: B.muted }}>Loading tracker data...</div>
        </div>
      ) : (
        <div style={{ padding: 20, maxWidth: 1280, margin: "0 auto" }}>
          {page === "explorer" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                <KpiCard val={projects.length} lbl="Projects" sub="UPNEDA sites" col={B.olive} bg={B.oliveL} />
                <KpiCard val={totalItems} lbl="Tracked Items" sub="Design + SCM + Execution + Milestones" col={B.blue} bg={B.blueL} />
                <KpiCard val={withDates} lbl="With Dates On File" sub={`of ${totalItems} items`} col={B.green} bg={B.greenL} />
                <KpiCard val={delayedCount} lbl="Delayed Items" sub="Needs attention" col="#c0392b" bg="#fef2f2" />
              </div>
              <GanttExplorer items={items} projects={projects} />
            </>
          ) : (
            <ErrorBoundary>
              <ProjectDetail projects={projects} items={items} />
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}
