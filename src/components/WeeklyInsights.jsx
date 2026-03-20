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

function pluralize(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function dominantKey(dist) {
  const entries = Object.entries(dist ?? {}).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : null;
}

function moodWord(value, { low, mid, high }) {
  if (!Number.isFinite(value)) return null;
  if (value >= high) return "strong";
  if (value >= mid) return "steady";
  if (value >= low) return "mixed";
  return "soft";
}

function buildWeeklyNarrative({ edge, gym, mw, summary, signalCount, momentCount }) {
  const parts = [];

  if (edge.sessions > 0) {
    const edgeTone =
      edge.sessions >= 5
        ? "edge energy was very present"
        : edge.sessions >= 3
          ? "edge energy showed up consistently"
          : "edge energy appeared lightly";

    const releaseBit = edge.noReleaseCount > edge.releaseCount
      ? "with more held edges than releases"
      : edge.releaseCount > 0
        ? "with release part of the pattern"
        : "without release shaping the week";

    parts.push(
      `This week, ${edgeTone}, with ${pluralize(edge.sessions, "session")} and ${fmt(edge.totalMinutes, 0)} minutes logged overall, ${releaseBit}.`,
    );
  } else {
    parts.push("This week was quiet on the edge front, with no edge sessions logged.");
  }

  if (gym.sessions > 0) {
    const dominantIntensity = dominantKey(gym.intensityDist);
    const gymTone =
      gym.sessions >= 4
        ? "training looked consistent"
        : gym.sessions >= 2
          ? "training was present but measured"
          : "training made a light appearance";

    parts.push(
      `${gymTone}, with ${pluralize(gym.sessions, "session")} and ${fmt(gym.totalMinutes, 0)} minutes in total${dominantIntensity ? `, mostly in the ${dominantIntensity.toLowerCase()} range` : ""}.`,
    );
  } else {
    parts.push("No gym sessions were logged this week, so the physical side of the picture is still quiet.");
  }

  if (mw.known > 0) {
    const restoreTone = moodWord(summary.avgRestore, { low: 4, mid: 6, high: 8 });
    const qualityTone = moodWord(summary.avgQuality, { low: 4, mid: 6, high: 8 });
    const libidoTone = moodWord(summary.avgLibido, { low: 4, mid: 6, high: 8 });
    const stressTone = moodWord(summary.avgStress, { low: 3, mid: 5, high: 7 });

    parts.push(
      `Morning signals looked ${restoreTone ?? "mixed"} for restoration, ${qualityTone ?? "mixed"} for sleep quality, ${libidoTone ?? "mixed"} for libido, and ${stressTone === "strong" ? "elevated" : stressTone === "steady" ? "noticeable" : stressTone === "mixed" ? "mixed" : "fairly settled"} for stress. Morning wood showed up ${mw.count} time${mw.count === 1 ? "" : "s"} across ${mw.known} logged morning${mw.known === 1 ? "" : "s"}.`,
    );
  } else {
    parts.push("Morning check-ins were too light this week to read the body with confidence.");
  }

  if (signalCount > 0) {
    parts.push(`The app picked up ${pluralize(signalCount, "signal")}, so patterns are starting to emerge rather than just isolated events.`);
  }

  if (momentCount > 0) {
    parts.push(`You also left ${pluralize(momentCount, "moment")} worth revisiting, which gives the numbers some human texture.`);
  }

  return parts.join(" ");
}

function buildEdgeSummary(edge) {
  if (!edge.sessions) {
    return "No edge sessions were logged this week yet.";
  }

  const pieces = [
    `You logged ${pluralize(edge.sessions, "edge session")} across ${fmt(edge.totalMinutes, 0)} total minutes.`,
  ];

  if (Number.isFinite(edge.avgMinutes)) {
    pieces.push(`Your average session sat around ${fmt(edge.avgMinutes, 0)} minutes.`);
  }

  if (edge.releaseCount || edge.noReleaseCount) {
    pieces.push(
      `Releases: ${edge.releaseCount ?? 0} ⭐ · Held edges: ${edge.noReleaseCount ?? 0} 🔒.`,
    );
  }

  return pieces.join(" ");
}

function buildMorningSummary(summary, mw) {
  if (!mw.known) {
    return "No morning check-ins were logged this week yet.";
  }

  return `Restore felt around ${fmt(summary.avgRestore, 1)}/10, sleep quality around ${fmt(summary.avgQuality, 1)}/10, libido around ${fmt(summary.avgLibido, 1)}/10, and stress around ${fmt(summary.avgStress, 1)}/10. Morning wood showed up ${mw.count} time${mw.count === 1 ? "" : "s"} across ${mw.known} logged morning${mw.known === 1 ? "" : "s"}.`;
}

function buildGymSummary(gym) {
  if (!gym.sessions) {
    return "No gym sessions were logged this week yet.";
  }

  const dominantIntensity = dominantKey(gym.intensityDist);
  return `You trained across ${pluralize(gym.sessions, "session")} for ${fmt(gym.totalMinutes, 0)} total minutes${dominantIntensity ? `, with ${dominantIntensity.toLowerCase()} showing up most often` : ""}.`;
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

  const momentCount = data?.moments?.length ?? 0;

  // Filter signals: alcohol only allowed if negative sleep impact already detected
  const filteredSignals = (data?.signals ?? []).filter((sig) => {
    const t = String(sig?.title ?? "").toLowerCase();
    const f = String(sig?.finding ?? "").toLowerCase();
    const mentionsAlcohol = t.includes("alcohol") || f.includes("alcohol");
    return !mentionsAlcohol; // alcohol signals already gated in deriveWeeklyInsights
  });

  const weeklyNarrative = buildWeeklyNarrative({
    edge,
    gym,
    mw,
    summary: s,
    signalCount: filteredSignals.length,
    momentCount,
  });

  const edgeSummary = buildEdgeSummary(edge);
  const morningSummary = buildMorningSummary(s, mw);
  const gymSummary = buildGymSummary(gym);

  return (
    <>
      <section className="card">
        <h2>This Week in One Breath</h2>

        <div className="muted" style={{ marginTop: 6 }}>
          {prettyRange(s.weekStartKey)}
        </div>

        <div className="mw-block" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="mw-title">What this week felt like</div>
          <div className="muted" style={{ lineHeight: 1.65 }}>
            {weeklyNarrative}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Edge Ritual</div>
            <div className="muted" style={{ lineHeight: 1.65 }}>
              {edgeSummary}
              {edge.sessions > 0 ? (
                <>
                  <br />
                  Outcome mix: <b>{listDist(edge.outcomeDist)}</b>
                </>
              ) : null}
            </div>
          </div>

          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Morning signals</div>
            <div className="muted" style={{ lineHeight: 1.65 }}>
              {morningSummary}
            </div>

            {mw.known === 0 ? (
              <div className="muted" style={{ marginTop: 10, opacity: 0.7 }}>
                No morning check-ins logged this week yet.
              </div>
            ) : null}
          </div>

          <div className="mw-block" style={{ margin: 0 }}>
            <div className="mw-title">Gym</div>
            <div className="muted" style={{ lineHeight: 1.65 }}>
              {gymSummary}
              {gym.sessions > 0 ? (
                <>
                  <br />
                  Intensity spread: <b>{listDist(gym.intensityDist)}</b>
                </>
              ) : null}
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
