import { useEffect, useMemo, useRef, useState } from "react";
import { deriveDailyTimeline } from "../utils/deriveDailyTimeline";
import { localDayKey } from "../utils/dateKey";

const DAY_MS = 24 * 60 * 60 * 1000;

// Visual scale: 1px per minute, so a day is 1440px wide
const DAY_WIDTH_PX = 1440;

// If a block is too narrow, we hide its label
const LABEL_MIN_PX = 34;

function startOfDayMs(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function fmtHM(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function pxOfDay(ts, dayStartMs) {
  return ((ts - dayStartMs) / DAY_MS) * DAY_WIDTH_PX;
}

function hasUsefulMeta(meta) {
  if (!meta || typeof meta !== "object") return false;
  return Object.keys(meta).length > 0;
}
function stripUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// Keep only keys from `extra` that are not present in `base`
// OR present but different (shallow compare).
function diffMeta(extra, base) {
  if (!extra || typeof extra !== "object") return null;
  const e = stripUndefined(extra);
  const b = stripUndefined(base || {});
  const out = {};

  for (const [k, v] of Object.entries(e)) {
    const bv = b[k];

    const bothObjects =
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv);

    if (bothObjects) {
      // shallow compare nested objects (enough for your ritual object etc.)
      if (!shallowEqual(v, bv)) out[k] = v;
    } else {
      if (!(k in b) || v !== bv) out[k] = v;
    }
  }

  return Object.keys(out).length ? out : null;
}
// Find the FIRST end event after startTs (within MAX_WINDOW).
function findEndEventAfterStart(events, kind, startTs) {
  const type = kind === "edge" ? "edge_end" : "gym_end";
  const MAX_WINDOW = 8 * 60 * 60 * 1000; // 8 hours
  const maxTs = startTs + MAX_WINDOW;

  let best = null;
  let bestTs = Infinity;

  for (const e of events) {
    if (!e || e.type !== type) continue;
    if (typeof e.ts !== "number") continue;
    if (e.ts < startTs || e.ts > maxTs) continue;

    // earliest end after start
    if (e.ts < bestTs) {
      best = e;
      bestTs = e.ts;
    }
  }

  return best;
}
function edgeOutcomeEmoji(outcome) {
  if (!outcome) return "⭐️";
  if (outcome === "No Release") return "🔒";
  if (outcome === "Ruined") return "🥵";
  return "⭐️"; // Good Release / Great Release / Shooter / Multiple
}
export default function DailyTimeline({ store, dayKey: dayKeyProp }) {
  const dayKey = dayKeyProp ?? localDayKey();

  const [selected, setSelected] = useState(null);
  const scrollRef = useRef(null);

  const dayStartMs = useMemo(() => startOfDayMs(dayKey), [dayKey]);

  const events = store.events || [];

  const { blocks, points, laneCount } = useMemo(
    () => deriveDailyTimeline(events, dayKey),
    [events, dayKey],
  );

  // Resolve blocks to use true endTs + sessionId when possible
  const resolvedBlocks = useMemo(() => {
    return blocks.map((b) => {
      if (b.kind !== "edge" && b.kind !== "gym") return b;

      const endEvent = findEndEventAfterStart(events, b.kind, b.startTs);
      const trueEndTs = endEvent?.ts ?? b.endTs;

      return {
        ...b,
        endTs: trueEndTs,
        sessionId:
          b.sessionId ?? endEvent?.sessionId ?? b.meta?.sessionId ?? null,
      };
    });
  }, [blocks, events]);

  // Map end events by sessionId (best case)
  const { edgeEndById, gymEndById } = useMemo(() => {
    const edgeMap = new Map();
    const gymMap = new Map();

    for (const e of events) {
      if (!e?.sessionId) continue;
      if (e.type === "edge_end") edgeMap.set(e.sessionId, e);
      if (e.type === "gym_end") gymMap.set(e.sessionId, e);
    }

    return { edgeEndById: edgeMap, gymEndById: gymMap };
  }, [events]);
  // ⭐ / 🔒 / 🥵 Edge outcomes for this day
  const edgeOutcomePoints = useMemo(() => {
    return (events || [])
      .filter((e) => e?.type === "edge_end" && e?.day === dayKey)
      .map((e) => {
        const outcome = e?.value?.outcome ?? "";
        if (!outcome) return null;

        if (outcome === "No Release") {
          return {
            ts: e.ts,
            outcome,
            kind: "lock",
            emoji: "🔒",
            sessionId: e.sessionId ?? null,
          };
        }

        if (outcome === "Ruined") {
          return {
            ts: e.ts,
            outcome,
            kind: "ruined",
            emoji: "🥵",
            sessionId: e.sessionId ?? null,
          };
        }

        // Good Release / Great Release / Shooter / Multiple (and any other future “release” labels)
        return {
          ts: e.ts,
          outcome,
          kind: "release",
          emoji: "⭐️",
          sessionId: e.sessionId ?? null,
        };
      })
      .filter(Boolean);
  }, [events, dayKey]);
  const hours = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  // Default scroll position to ~5am
  useEffect(() => {
    if (!scrollRef.current) return;
    const START_MINUTE = 5 * 60; // 5:00am
    scrollRef.current.scrollLeft = START_MINUTE; // 1px per minute
  }, [dayKey]);

  function selectSessionBlock(b) {
    const isEdge = b.kind === "edge";
    const title = isEdge ? "Edge Session" : "Gym Session";

    let sessionId = b.sessionId ?? b.meta?.sessionId ?? null;

    let endEvent = sessionId
      ? isEdge
        ? edgeEndById.get(sessionId)
        : gymEndById.get(sessionId)
      : null;

    if (!endEvent) {
      endEvent = findEndEventAfterStart(events, b.kind, b.startTs);
      if (endEvent?.sessionId) sessionId = endEvent.sessionId;
    }

    const summary = endEvent?.value ?? null;

    const journal = sessionId
      ? isEdge
        ? (store.journals?.edgeBySessionId?.[sessionId] ?? "")
        : (store.journals?.gymBySessionId?.[sessionId] ?? "")
      : "";

    const displayEndTs = endEvent?.ts ?? b.endTs;

    const timelineMetaExtra = diffMeta(b.meta, summary);

    const meta = {
      ...(hasUsefulMeta(summary) ? { summary } : {}),
      ...(journal.trim() ? { journal } : {}),
      ...(timelineMetaExtra ? { timelineMeta: timelineMetaExtra } : {}),
      ...(sessionId ? { sessionId } : {}),
    };

    setSelected({
      kind: b.kind,
      title,
      start: fmtHM(b.startTs),
      end: fmtHM(displayEndTs),
      meta,
    });
  }

  return (
    <section className="card">
      <h2>Daily Timeline</h2>

      <div className="timeline-legend">
        <div className="legend-item">
          <span className="legend-swatch edge" /> Edge Session
        </div>
        <div className="legend-item">
          <span className="legend-swatch gym" /> Gym Session
        </div>
        <div className="legend-item">
          <span className="legend-swatch supp" /> Supplement
        </div>
        <div className="legend-item">
          <span className="legend-swatch alc" /> Alcohol
        </div>
        <div className="legend-item">
          <span className="legend-lock">🔒</span> Held Edge
        </div>
        <div className="legend-item">
          <span className="legend-star">⭐</span> Release
        </div>
        <div className="legend-item">
          <span className="legend-ruined">🥵</span> Ruined
        </div>
      </div>

      <div ref={scrollRef} className="timeline-scroll">
        <div className="timeline">
          {/* Hour markers (px-based to match 1px/min) */}
          <div className="tl-hours">
            {hours.map((h) => (
              <div key={h} className="tl-hour" style={{ left: `${h * 60}px` }}>
                <div className="tl-hour-line" />
                <div className="tl-hour-label">
                  {String(h).padStart(2, "0")}:00
                </div>
              </div>
            ))}
          </div>

          {/* Blocks (precise px sizing) */}
          {resolvedBlocks.map((b, i) => {
            const startPx = pxOfDay(b.startTs, dayStartMs);

            const safeEndTs = Math.max(b.endTs, b.startTs);
            const endPx = pxOfDay(safeEndTs, dayStartMs);

            // Clamp within the 0..1440px lane (prevents weird off-day math)
            const leftPx = Math.max(0, Math.min(DAY_WIDTH_PX, startPx));
            const rightPx = Math.max(0, Math.min(DAY_WIDTH_PX, endPx));

            const widthPx = Math.max(1, rightPx - leftPx);
            const showLabel = widthPx >= LABEL_MIN_PX;

            return (
              <button
                key={`b-${i}`}
                type="button"
                className={`timeline-block ${b.kind}`}
                style={{
                  left: `${leftPx}px`,
                  width: `${widthPx}px`,
                  top: `${46 + (b.lane ?? 0) * 44}px`,
                }}
                onClick={() => selectSessionBlock(b)}
                aria-label={b.kind === "edge" ? "Edge session" : "Gym session"}
              >
                {showLabel ? (b.kind === "edge" ? "Edge" : "Gym") : null}
              </button>
            );
          })}

          {/* Points (still fine as % or px; keep % for now) */}
          {points.map((p, i) => {
            const leftPx = pxOfDay(p.ts, dayStartMs);
            const jitter = (i % 3) * 10;

            return (
              <button
                key={`p-${i}`}
                type="button"
                className={`timeline-point ${p.kind}`}
                style={{
                  left: `${Math.max(0, Math.min(DAY_WIDTH_PX, leftPx))}px`,
                  top: `${54 + jitter}px`,
                }}
                onClick={() =>
                  setSelected({
                    kind: p.kind,
                    title: p.kind === "supp" ? "Supplement" : "Alcohol",
                    time: fmtHM(p.ts),
                    label: p.label,
                  })
                }
                aria-label={p.label}
              />
            );
          })}
          {/* ⭐ / 🔒 Edge outcome markers */}
          {edgeOutcomePoints.map((r, i) => {
            const leftPx = pxOfDay(r.ts, dayStartMs);

            return (
              <button
                key={`edge-${r.sessionId ?? i}-${r.ts}`}
                type="button"
                className={`timeline-edge-outcome ${r.kind}`}
                style={{
                  left: `${Math.max(0, Math.min(DAY_WIDTH_PX, leftPx))}px`,
                  top: `18px`,
                }}
                onClick={() =>
                  setSelected({
                    kind: r.kind,
                    title: r.kind === "lock" ? "Held Edge" : "Release",
                    time: fmtHM(r.ts),
                    label: r.outcome,
                    sessionId: r.sessionId,
                  })
                }
                aria-label={`${r.kind === "lock" ? "Held edge" : "Release"}: ${r.outcome}`}
                title={r.outcome}
              >
                {r.emoji}
              </button>
            );
          })}
          {laneCount === 0 && (
            <div className="tl-empty-hint">
              Log stuff and it appears here 👀
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="timeline-details">
          <div className="timeline-details-head">
            <div className="timeline-details-title">{selected.title}</div>
            <button
              type="button"
              className="chip"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>

          <div className="timeline-details-body">
            {"start" in selected && (
              <div className="muted">
                {selected.start} → {selected.end}
              </div>
            )}

            {"time" in selected && <div className="muted">{selected.time}</div>}

            {"label" in selected && (
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                {selected.label}
              </div>
            )}

            {"meta" in selected && hasUsefulMeta(selected.meta) ? (
              <pre className="timeline-pre">
                {JSON.stringify(selected.meta, null, 2)}
              </pre>
            ) : (
              "meta" in selected && (
                <div className="muted" style={{ marginTop: 10 }}>
                  No details captured for this item.
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
