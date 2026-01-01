// utils/exportEdgeCsv.js
export function exportEdgeSessionsCsv(store) {
  const events = store?.events ?? [];
  const journalsBySessionId = store?.journals?.edgeBySessionId ?? {};

  // group events by sessionId
  const byId = new Map();
  for (const e of events) {
    if (!e?.sessionId) continue;
    if (!byId.has(e.sessionId)) byId.set(e.sessionId, []);
    byId.get(e.sessionId).push(e);
  }

  const header = [
    "date",
    "start_time",
    "end_time",
    "total_minutes",
    "active_minutes",
    "edge_minutes",
    "active_ratio",
    "edge_ratio",
    "edge_hits",
    "break_count",
    "break_seconds_total", // ✅ NEW (sum)
    "outcome",
    "intent", // ✅ NEW
    "body_state", // ✅ NEW
    "mind_state", // ✅ NEW
    "threshold_hits", // ✅ NEW (count)
    "journal", // ✅ NEW
  ];

  const lines = [header.join(",")];

  // helper to keep CSV safe
  const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

  const fmtTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  for (const [sessionId, sessionEvents] of byId.entries()) {
    // sort by time just in case
    sessionEvents.sort((a, b) => (a?.ts ?? 0) - (b?.ts ?? 0));

    const start = sessionEvents.find((x) => x.type === "edge_start");
    const end = sessionEvents.find((x) => x.type === "edge_end");
    if (!start || !end) continue; // incomplete session

    const startTs = start.ts;
    const endTs = end.ts;

    const totalMin = (endTs - startTs) / 60000;

    const activeMin = (end.value?.activeSec ?? 0) / 60;
    const edgeMin = (end.value?.edgeSec ?? 0) / 60;

    const activeRatio = totalMin > 0 ? activeMin / totalMin : 0;
    const edgeRatio = totalMin > 0 ? edgeMin / totalMin : 0;

    const edgeHits =
      end.value?.edgeHits ??
      sessionEvents.filter((x) => x.type === "edge_hit").length;

    const breakCount =
      end.value?.breaks ??
      sessionEvents.filter((x) => x.type === "edge_break_start").length;

    // ✅ Sum break seconds from explicit break-end events (more accurate than inferring)
    const breakSecondsTotal = sessionEvents
      .filter((x) => x.type === "edge_break_end")
      .reduce((sum, x) => sum + Number(x?.value?.breakSec ?? 0), 0);

    const outcome = end.value?.outcome ?? "";
    const date = start.day ?? "";

    // ✅ ritual fields (saved inside edge_end.value.ritual in your EdgeSession.jsx)
    const ritual = end.value?.ritual ?? null;
    const intent = ritual?.intent ?? "";
    const bodyState = ritual?.postState?.body ?? "";
    const mindState = ritual?.postState?.mind ?? "";
    const thresholdHits = Array.isArray(ritual?.thresholdMarkers)
      ? ritual.thresholdMarkers.length
      : "";

    // ✅ Journal text (single cell)
    const journalRaw = journalsBySessionId?.[sessionId] ?? "";
    const journal = String(journalRaw).replace(/\r?\n/g, " ").trim();

    lines.push(
      [
        csvCell(date),
        csvCell(fmtTime(startTs)),
        csvCell(fmtTime(endTs)),
        csvCell(totalMin.toFixed(1)),
        csvCell(activeMin.toFixed(1)),
        csvCell(edgeMin.toFixed(1)),
        csvCell(activeRatio.toFixed(2)),
        csvCell(edgeRatio.toFixed(2)),
        csvCell(edgeHits),
        csvCell(breakCount),
        csvCell(breakSecondsTotal),
        csvCell(outcome),
        csvCell(intent),
        csvCell(bodyState),
        csvCell(mindState),
        csvCell(thresholdHits),
        csvCell(journal),
      ].join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `edge-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}
