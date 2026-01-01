// src/components/WeeklyInsights.jsx
import { useMemo } from "react";
import { deriveWeeklyInsights } from "../utils/deriveWeeklyInsights";

function prettyRange(weekStartKey) {
  if (!weekStartKey) return "";
  const [y, m, d] = weekStartKey.split("-").map(Number);
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

function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "–";
  const p = Math.pow(10, digits);
  return String(Math.round(n * p) / p);
}

function listDist(dist) {
  const entries = Object.entries(dist ?? {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "–";
  return entries.map(([k, v]) => `${k} (${v})`).join(" · ");
}

export default function WeeklyInsights({ store, weekStartKey }) {
  const data = useMemo(() => {
    return deriveWeeklyInsights(
      {
        days: store?.days,
        events: store?.events,
        journals: store?.journals,
      },
      weekStartKey,
    );
  }, [store, weekStartKey]);

  const s = data?.summary ?? {};
  const mw = s.morningWood ?? { count: 0, known: 0, outOf: 7 };
  const edge = s.edge ?? {
    sessions: 0,
    totalMinutes: 0,
    avgMinutes: null,
    outcomeDist: {},
    releaseCount: 0,
    noReleaseCount: 0,
  };
  const gym = s.gym ?? { sessions: 0, totalMinutes: 0, intensityDist: {} };

  // Filter signals: alcohol only allowed if negative sleep impact already detected
  const filteredSignals = (data?.signals ?? []).filter((sig) => {
    const t = String(sig?.title ?? "").toLowerCase();
    const f = String(sig?.finding ?? "").toLowerCase();
    const mentionsAlcohol = t.includes("alcohol") || f.includes("alcohol");
    return !mentionsAlcohol; // alcohol signals already gated in deriveWeeklyInsights
  });

  return (
    <>
      <section className="card">
        <h2>This Week in One Breath</h2>

        <div className="muted" style={{ marginTop: 6 }}>
          {prettyRange(s.weekStartKey)}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Edge Ritual</div>
            <div className="muted" style={{ lineHeight: 1.6 }}>
              You edged for <b>{fmt(edge.totalMinutes, 0)}</b> minutes across{" "}
              <b>{edge.sessions}</b> session(s).
              {Number.isFinite(edge.avgMinutes) ? (
                <>
                  {" "}
                  Avg session: <b>{fmt(edge.avgMinutes, 0)}</b> min.
                </>
              ) : null}
              <br />
              Releases: <b>{edge.releaseCount ?? 0}</b> ⭐ · Held edges:{" "}
              <b>{edge.noReleaseCount ?? 0}</b> 🔒
            </div>
          </div>

          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Morning signals</div>
            <div className="muted" style={{ lineHeight: 1.6 }}>
              Restore avg: <b>{fmt(s.avgRestore, 1)}</b> · Quality avg:{" "}
              <b>{fmt(s.avgQuality, 1)}</b>
              <br />
              Stress avg: <b>{fmt(s.avgStress, 1)}</b> · Libido avg:{" "}
              <b>{fmt(s.avgLibido, 1)}</b>
              <br />
              Morning wood: <b>{mw.count}</b>/{mw.outOf}
              {mw.known ? (
                <span className="muted"> (known: {mw.known})</span>
              ) : null}
            </div>

            {mw.known === 0 ? (
              <div className="muted" style={{ marginTop: 10, opacity: 0.7 }}>
                No morning check-ins logged this week yet.
              </div>
            ) : null}
          </div>

          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Gym</div>
            <div className="muted" style={{ lineHeight: 1.6 }}>
              Sessions: <b>{gym.sessions}</b> · Total time:{" "}
              <b>{fmt(gym.totalMinutes, 0)}</b> min
              <br />
              Intensity: <b>{listDist(gym.intensityDist)}</b>
            </div>
          </div>

          {data?.alcoholSleepNote ? (
            <div className="mw-block" style={{ margin: 0 }}>
              <div className="mw-title">Heads up</div>
              <div className="muted" style={{ lineHeight: 1.6 }}>
                🍷 Alcohol may have reduced your sleep quality this week.
                <br />
                <span className="muted" style={{ opacity: 0.8 }}>
                  {data.alcoholSleepNote}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>Signals &amp; Triggers</h2>

        {filteredSignals.length ? (
          <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
            {filteredSignals.map((sig, idx) => (
              <div key={idx} className="card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 900, opacity: 0.95 }}>
                  {sig.title}
                </div>

                <div
                  className="muted"
                  style={{ marginTop: 6, lineHeight: 1.55 }}
                >
                  • {sig.finding}
                  {sig.suggestion ? (
                    <>
                      <br />• Try: {sig.suggestion}
                    </>
                  ) : null}
                  <br />
                  <span className="muted" style={{ opacity: 0.7 }}>
                    Confidence: {sig.confidence} · Based on: {sig.basedOn}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            Not enough data this week yet to surface reliable signals. Keep
            logging lightly.
          </div>
        )}
      </section>

      <section className="card">
        <h2>Moments Worth Revisiting</h2>

        {data?.moments?.length ? (
          <div className="log-list" style={{ marginTop: 10 }}>
            {data.moments.map((m, idx) => (
              <div key={idx} className="log-row">
                <div className="log-time" style={{ width: 72 }}>
                  {m.type}
                </div>
                <div>
                  <div style={{ fontWeight: 800, opacity: 0.95 }}>{m.day}</div>
                  <pre className="timeline-pre" style={{ marginTop: 6 }}>
                    {m.preview}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            No journals this week yet.
          </div>
        )}
      </section>
    </>
  );
}
