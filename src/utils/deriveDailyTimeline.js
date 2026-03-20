import { localDayKey } from "./dateKey";

export function deriveDailyTimeline(events, dayKey = localDayKey()) {
  const dayEvents = (events || [])
    .filter((e) => e.day === dayKey)
    .sort((a, b) => a.ts - b.ts);

  const blocks = [];
  const points = [];

  // Group by sessionId
  const bySession = {};
  for (const e of dayEvents) {
    if (e.sessionId) {
      bySession[e.sessionId] ||= [];
      bySession[e.sessionId].push(e);
    }
  }

  Object.values(bySession).forEach((sessionEvents) => {
    const start = sessionEvents.find((e) => e.type.endsWith("_start"));
    const end = sessionEvents.find((e) => e.type.endsWith("_end"));
    if (!start || !end) return;

    if (start.type === "edge_start") {
      blocks.push({
        kind: "edge",
        startTs: start.ts,
        endTs: end.ts,
        meta: end.value,
      });
    }
    if (start.type === "gym_start") {
      blocks.push({
        kind: "gym",
        startTs: start.ts,
        endTs: end.ts,
        meta: end.value,
      });
    }
  });

  // Point events (supp + alcohol)
  for (const e of dayEvents) {
    if (e.type === "supp_taken") {
      const name = e.value?.name ?? "Supplement";
      const dose = e.value?.dose?.trim?.() ?? "";

      points.push({
        kind: "supp",
        ts: e.ts,
        label: dose ? `${name} (${dose})` : name,
      });
    }
    if (e.type === "alc_drink") {
      points.push({
        kind: "alc",
        ts: e.ts,
        label: e.value?.label ?? "Alcohol",
      });
    }
  }

  // ---- Lane assignment for blocks (prevents overlap) ----
  blocks.sort((a, b) => a.startTs - b.startTs);
  const laneEnds = []; // laneEnds[i] = endTs
  for (const b of blocks) {
    let lane = laneEnds.findIndex((endTs) => endTs <= b.startTs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.endTs);
    } else {
      laneEnds[lane] = b.endTs;
    }
    b.lane = lane;
  }

  return { blocks, points, laneCount: laneEnds.length };
}
