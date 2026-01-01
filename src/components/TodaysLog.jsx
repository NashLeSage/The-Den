import { useState } from "react";
import { localDayKey } from "../utils/dateKey";

function todayKey() {
  return localDayKey();
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

function labelFor(e) {
  switch (e.type) {
    case "supp_taken":
      return `Supp: ${e.value?.name ?? "Unknown"}`;
    case "alc_drink":
      return `Alcohol: ${e.value?.label ?? "Drink"}`;

    case "gym_start":
      return "Gym: Start";
    case "gym_rest_start":
      return `Gym: Rest ${e.value?.seconds ?? ""}s`;
    case "gym_end": {
      const totalSec = Number(e.value?.totalSec);
      if (!totalSec) return "Gym: End";
      const mins = Math.round(totalSec / 60);
      return `Gym: End (${mins} min)`;
    }

    case "edge_start":
      return "Edge: Start";
    case "edge_hit":
      return "Edge: Approached edge";
    case "edge_break_start":
      return "Edge: Break start";
    case "edge_break_end":
      return "Edge: Break end";
    case "edge_cancel":
      return "Edge: Cancelled";
    case "edge_end":
      return `Edge: End (${e.value?.outcome ?? "?"})`;
  }
}

// 👇 add semantic classes for styling borders
function logClassFor(type) {
  // BREAKS should be neutral (no start/end highlighting)
  if (type === "edge_break_start" || type === "edge_break_end") return "log";

  // Edge start/end
  if (type === "edge_start") return "log edge start";
  if (type === "edge_end") return "log edge end";

  // Gym start/end
  if (type === "gym_start") return "log gym start";
  if (type === "gym_end") return "log gym end";

  return "log";
}

export default function TodaysLog({ store }) {
  const today = todayKey();
  const [open, setOpen] = useState(false); // default collapsed

  const events = (store.events || [])
    .filter((e) => e.day === today)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  return (
    <section className="card">
      <div className="mc-head">
        <h2>Today's Log</h2>
        <button
          type="button"
          className="chip"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "View"}
        </button>
      </div>

      {!open ? (
        <div className="muted">
          {events.length
            ? `${events.length} event${events.length > 1 ? "s" : ""} logged today`
            : "No events yet today."}
        </div>
      ) : !events.length ? (
        <div className="muted">No events yet today.</div>
      ) : (
        <div className="log-list">
          {events.map((e, idx) => (
            <div
              key={`${e.ts}-${idx}`}
              className={`log-row ${logClassFor(e.type)}`}
            >
              <div className="log-time">{fmtTime(e.ts)}</div>
              <div className="log-text">{labelFor(e)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
