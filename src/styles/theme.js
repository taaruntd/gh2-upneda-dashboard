// Brand tokens copied from the existing GH2 Solar Ops Dashboard (App.jsx "B" object)
// so this tracker reads as the same product, not a new one.
export const B = {
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
export const STATUS_COLORS = {
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
};
export const NO_STATUS = { bg: "#f5f5f5", border: "#e2ebd0", text: B.muted, dot: "#c3ccb6" };
export const statusStyle = (s) => STATUS_COLORS[s] || NO_STATUS;

export const TRACKERS = ["Design & Engineering", "SCM", "Execution Tracker"];
export const TRACKER_COLOR = {
  "Design & Engineering": "#7B1FA2",
  SCM: "#1565C0",
  "Execution Tracker": "#E65100",
};
export const TRACKER_LIGHT = {
  "Design & Engineering": "#F3E5F5",
  SCM: "#E3F2FD",
  "Execution Tracker": "#FFF3E0",
};

// ── Date helpers (same parsing contract as the ops dashboard) ──────────────
export const parseDateStr = (s) => {
  if (s === null || s === undefined || s === "") return null;
  if (typeof s !== "string") return null;
  const clean = s.trim();
  if (!clean || clean.toLowerCase() === "tbd" || clean === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }
  const sep = clean.includes("/") ? "/" : clean.includes("-") ? "-" : null;
  if (!sep) return null;
  const p = clean.split(sep).map((x) => x.trim());
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  if (!/^\d{1,2}$/.test(dd) || !/^\d{1,2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return null;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
};

export const fmtShortDate = (d) =>
  d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export const pctCol = (p) => (p >= 90 ? B.green : p >= 40 ? "#e07b20" : "#c0392b");
