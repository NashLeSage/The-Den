import { useEffect, useMemo, useState } from "react";
import DailyTimeline from "./DailyTimeline";
import WeeklyInsights from "./WeeklyInsights";
import { localDayKey } from "../utils/dateKey";

function addDays(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prettyDay(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// Monday-start week (AU-friendly)
function startOfWeek(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0 Sun .. 6 Sat
  const weekStartsOn = 1; // Monday
  const diff = (dow - weekStartsOn + 7) % 7;
  dt.setDate(dt.getDate() - diff);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prettyWeek(dayKey) {
  const ws = startOfWeek(dayKey);
  const [y, m, d] = ws.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d);
  end.setDate(end.getDate() + 6);

  const startStr = start.toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const endStr = end.toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  return `${startStr} → ${endStr}`;
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Insights({ store, onBack }) {
  const today = useMemo(() => localDayKey(), []);
  const [dayKey, setDayKey] = useState(today);
  const [bump, setBump] = useState(0);

  const [view, setView] = useState("daily"); // daily | weekly | monthly | yearly

  // open at top
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  function go(deltaDays) {
    setDayKey((prev) => addDays(prev, deltaDays));
    setBump((x) => x + 1);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function setViewAndReset(next) {
    setView(next);
    setBump((x) => x + 1);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  const journals = store.journals ?? {};
  const morningJournal = journals.morningByDay?.[dayKey] ?? "";

  const edgeEnds = useMemo(() => {
    const events = store.events ?? [];
    return events
      .filter((e) => e?.type === "edge_end" && e?.day === dayKey)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  }, [store.events, dayKey]);

  const gymEnds = useMemo(() => {
    const events = store.events ?? [];
    return events
      .filter((e) => e?.type === "gym_end" && e?.day === dayKey)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  }, [store.events, dayKey]);

  const isDaily = view === "daily";
  const isWeekly = view === "weekly";

  const navLabel = isWeekly ? prettyWeek(dayKey) : prettyDay(dayKey);
  const step = isWeekly ? 7 : 1;
  const thisWeekKey = startOfWeek(today);
  const viewingWeekKey = startOfWeek(dayKey);

  const isOnToday = dayKey === today;
  const isOnThisWeek = viewingWeekKey === thisWeekKey;

  return (
    <div className="den">
      <header className="den-header">
        <button onClick={onBack}>← Back</button>
        <h1>Insights</h1>
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
          👷‍♂️ Work In Progress 🚜
        </div>
      </header>

      <div className="chips" style={{ marginTop: 12, marginBottom: 12 }}>
        <button
          type="button"
          className={`chip ${isDaily ? "chip-on" : ""}`}
          onClick={() => setViewAndReset("daily")}
        >
          Daily
        </button>

        <button
          type="button"
          className={`chip ${isWeekly ? "chip-on" : ""}`}
          onClick={() => setViewAndReset("weekly")}
        >
          Weekly
        </button>

        <button type="button" className="chip chip-off" disabled>
          Monthly
        </button>
        <button type="button" className="chip chip-off" disabled>
          Yearly
        </button>
      </div>

      <div className="insights-daybar">
        <button type="button" className="chip" onClick={() => go(-step)}>
          ← Prev
        </button>

        <div className="insights-day">{navLabel}</div>

        <button
          type="button"
          className={`chip ${dayKey === today && isDaily ? "chip-off" : ""}`}
          onClick={() => go(step)}
          disabled={dayKey === today && isDaily}
        >
          Next →
        </button>
      </div>
      {/* Quick return button under the nav bar */}
      {isDaily && !isOnToday && (
        <button
          type="button"
          className="chip"
          style={{ width: "100%", marginTop: 10, opacity: 0.95 }}
          onClick={() => {
            setDayKey(today);
            setBump((x) => x + 1);
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
        >
          Today
        </button>
      )}

      {isWeekly && !isOnThisWeek && (
        <button
          type="button"
          className="chip"
          style={{ width: "100%", marginTop: 10, opacity: 0.95 }}
          onClick={() => {
            setDayKey(thisWeekKey);
            setBump((x) => x + 1);
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }}
        >
          This Week
        </button>
      )}

      <div key={bump} className="insights-fade">
        {isWeekly ? (
          <WeeklyInsights store={store} weekStartKey={startOfWeek(dayKey)} />
        ) : (
          <>
            <DailyTimeline store={store} dayKey={dayKey} />

            <section className="card">
              <h2>Journals</h2>

              <div className="subhead">Morning Journal</div>
              {morningJournal.trim().length ? (
                <pre className="timeline-pre">{morningJournal}</pre>
              ) : (
                <div className="muted">No morning reflection for this day.</div>
              )}

              <div className="subhead" style={{ marginTop: 14 }}>
                Edge Journal
              </div>
              {edgeEnds.length ? (
                <div className="log-list">
                  {edgeEnds.map((e) => {
                    const sid = e.sessionId;
                    const text = (journals.edgeBySessionId?.[sid] ?? "").trim();
                    const outcome = e.value?.outcome ?? "";
                    return (
                      <div key={`${sid}-${e.ts}`} className="log-row">
                        <div className="log-time">{fmtTime(e.ts)}</div>
                        <div>
                          <div style={{ fontWeight: 800, opacity: 0.95 }}>
                            {outcome ? `Outcome: ${outcome}` : "Edge Session"}
                          </div>
                          {text ? (
                            <pre className="timeline-pre">{text}</pre>
                          ) : (
                            <div className="muted">No reflection saved.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted">No edge sessions ended on this day.</div>
              )}

              <div className="subhead" style={{ marginTop: 14 }}>
                Gym Journal
              </div>
              {gymEnds.length ? (
                <div className="log-list">
                  {gymEnds.map((e) => {
                    const sid = e.sessionId;
                    const text = (journals.gymBySessionId?.[sid] ?? "").trim();
                    const intensity = e.value?.intensity ?? "";
                    const areas = Array.isArray(e.value?.areas)
                      ? e.value.areas
                      : [];
                    const metaParts = [
                      intensity ? `Intensity: ${intensity}` : null,
                      areas.length ? `Areas: ${areas.join(", ")}` : null,
                    ].filter(Boolean);

                    return (
                      <div key={`${sid}-${e.ts}`} className="log-row">
                        <div className="log-time">{fmtTime(e.ts)}</div>
                        <div>
                          <div style={{ fontWeight: 800, opacity: 0.95 }}>
                            Gym Session
                            {metaParts.length
                              ? ` (${metaParts.join(" · ")})`
                              : ""}
                          </div>
                          {text ? (
                            <pre className="timeline-pre">{text}</pre>
                          ) : (
                            <div className="muted">No reflection saved.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted">No gym sessions ended on this day.</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
