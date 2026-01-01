import { useEffect, useMemo, useRef, useState } from "react";
import { localDayKey } from "../utils/dateKey";

function todayKey() {
  return localDayKey();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatElapsedMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tryVibrate(pattern) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

function makeWolfPlayer() {
  let ctx = null;

  async function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }

  async function growl() {
    const c = await ensure();
    const now = c.currentTime;

    const freqs = [880, 1320];

    freqs.forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + i * 0.05);

      gain.gain.setValueAtTime(0.0001, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.7, now + i * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.8);

      osc.connect(gain);
      gain.connect(c.destination);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.85);
    });
  }

  return { ensure, growl };
}

const AREAS = [
  "Push",
  "Pull",
  "Legs",
  "Core",
  "Conditioning",
  "Full body",
  "Cardio",
];

const INTENSITY = ["Easy", "Moderate", "Hard", "High-intensity"];

export default function GymSession({ store, setStore }) {
  const gym = store.activeGymSession ?? null;

  // Modes: idle (home card), active (overlay), reflect (overlay)
  const [mode, setMode] = useState("idle");

  const wolfRef = useRef(null);
  const restFlashTimerRef = useRef(null);
  const [restDoneFlash, setRestDoneFlash] = useState(false);

  // Journal state (reflect screen)
  const [gymJournal, setGymJournal] = useState("");

  // Prefs
  const prefs = store.prefs ?? { wolfSound: false, wolfVibe: true };

  // Timer tick
  const [nowTs, setNowTs] = useState(Date.now());

  // “Timers” (formerly rest timers)
  const [restEndsAt, setRestEndsAt] = useState(null);
  const [restDurationSec, setRestDurationSec] = useState(null);

  // Freeze time when user holds End and we enter reflect
  const endFreezeTsRef = useRef(null);

  // Hold-to-end (1.5s)
  const [holdEndP, setHoldEndP] = useState(0);
  const holdEndRef = useRef({ raf: null, start: 0, done: false });

  // Hold-to-cancel (2.5s)
  const [holdCancelP, setHoldCancelP] = useState(0);
  const holdCancelRef = useRef({ raf: null, start: 0, done: false });

  // Keep mode sane across refreshes
  useEffect(() => {
    if (!gym) {
      setMode("idle");
      endFreezeTsRef.current = null;
      return;
    }
    if (mode === "idle") {
      setMode("active");
    }
  }, [gym?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every second while session exists
  useEffect(() => {
    if (!gym) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gym?.id]);

  function setPref(key, value) {
    setStore((prev) => ({
      ...prev,
      prefs: { ...(prev.prefs ?? {}), [key]: value },
    }));
  }

  function saveGymJournal(sessionId, text) {
    setStore((prev) => ({
      ...prev,
      journals: {
        ...(prev.journals ?? {}),
        gymBySessionId: {
          ...((prev.journals ?? {}).gymBySessionId ?? {}),
          [sessionId]: text,
        },
      },
    }));
  }

  function cancelRest() {
    setRestEndsAt(null);
    setRestDurationSec(null);
  }

  const displayNow = useMemo(() => {
    return endFreezeTsRef.current ?? nowTs;
  }, [nowTs]);

  const elapsedMs = gym ? displayNow - gym.startTs : 0;

  const restRemainingSec = useMemo(() => {
    if (!restEndsAt) return 0;
    const diff = Math.ceil((restEndsAt - nowTs) / 1000);
    return Math.max(0, diff);
  }, [restEndsAt, nowTs]);

  // Rest timer completion
  useEffect(() => {
    if (restEndsAt && restRemainingSec === 0) {
      if (prefs.wolfVibe) tryVibrate([90, 40, 90]);

      if (prefs.wolfSound) {
        if (!wolfRef.current) wolfRef.current = makeWolfPlayer();
        wolfRef.current.growl().catch(() => {});
      }

      setRestDoneFlash(true);
      if (restFlashTimerRef.current)
        window.clearTimeout(restFlashTimerRef.current);
      restFlashTimerRef.current = window.setTimeout(() => {
        setRestDoneFlash(false);
        restFlashTimerRef.current = null;
      }, 3000);

      setRestEndsAt(null);
      setRestDurationSec(null);
    }
  }, [restEndsAt, restRemainingSec, prefs.wolfSound, prefs.wolfVibe]);

  function startGym() {
    const id = uid();
    const now = Date.now();

    // init journal text for this new session
    setGymJournal(store.journals?.gymBySessionId?.[id] ?? "");
    endFreezeTsRef.current = null;

    setStore((prev) => ({
      ...prev,
      activeGymSession: {
        id,
        startTs: now,
        areas: [],
        intensity: null,
      },
      events: [
        ...prev.events,
        {
          type: "gym_start",
          ts: now,
          day: todayKey(),
          value: null,
          sessionId: id,
        },
      ],
    }));

    setMode("active");
    cancelRest();
  }

  function cancelGym() {
    cancelRest();
    endFreezeTsRef.current = null;

    setStore((prev) => {
      const s = prev.activeGymSession;
      if (!s) return prev;
      return {
        ...prev,
        activeGymSession: null,
        events: (prev.events || []).filter((e) => e.sessionId !== s.id),
      };
    });

    setMode("idle");
  }

  function toggleArea(area) {
    setStore((prev) => {
      const s = prev.activeGymSession;
      if (!s) return prev;

      const has = s.areas.includes(area);
      const nextAreas = has
        ? s.areas.filter((a) => a !== area)
        : [...s.areas, area];

      return {
        ...prev,
        activeGymSession: { ...s, areas: nextAreas },
      };
    });
  }

  function setIntensity(level) {
    setStore((prev) => {
      const s = prev.activeGymSession;
      if (!s) return prev;
      return { ...prev, activeGymSession: { ...s, intensity: level } };
    });
  }

  function startTimer(seconds) {
    if (!gym) return;

    // ensure audio context primed if sound is enabled
    if (!wolfRef.current) wolfRef.current = makeWolfPlayer();
    if (prefs.wolfSound) wolfRef.current.ensure().catch(() => {});

    const now = Date.now();
    setRestDurationSec(seconds);
    setRestEndsAt(now + seconds * 1000);

    setStore((prev) => ({
      ...prev,
      events: [
        ...prev.events,
        {
          type: "gym_rest_start",
          ts: now,
          day: todayKey(),
          value: { seconds },
          sessionId: gym.id,
        },
      ],
    }));
  }

  function enterReflect() {
    if (!gym) return;

    cancelRest(); // stop any timer UI and prevent completion bell during reflection
    endFreezeTsRef.current = Date.now(); // freeze time display while reflecting

    // load latest journal
    setGymJournal(store.journals?.gymBySessionId?.[gym.id] ?? "");

    setMode("reflect");
  }

  function backToActive() {
    // user decided not to end yet, continue session
    endFreezeTsRef.current = null;
    setMode("active");
  }

  function finalizeEndGym() {
    setStore((prev) => {
      const s = prev.activeGymSession;
      if (!s) return prev;

      const endTs = endFreezeTsRef.current ?? Date.now();

      return {
        ...prev,
        journals: {
          ...(prev.journals ?? {}),
          gymBySessionId: {
            ...((prev.journals ?? {}).gymBySessionId ?? {}),
            [s.id]: gymJournal, // ensure latest
          },
        },
        activeGymSession: null,
        events: [
          ...prev.events,
          {
            type: "gym_end",
            ts: endTs,
            day: todayKey(),
            value: {
              totalSec: Math.round((endTs - s.startTs) / 1000),
              areas: s.areas,
              intensity: s.intensity,
            },
            sessionId: s.id,
          },
        ],
      };
    });

    cancelRest();
    endFreezeTsRef.current = null;
    setMode("idle");
  }

  // ---------------- Hold helpers ----------------
  function stopHoldEnd() {
    const h = holdEndRef.current;
    if (h.raf) cancelAnimationFrame(h.raf);
    h.raf = null;
    h.start = 0;
    h.done = false;
    setHoldEndP(0);
  }

  function startHoldEnd() {
    const h = holdEndRef.current;
    if (h.raf) return;

    h.start = performance.now();
    h.done = false;

    const tick = (t) => {
      const elapsed = t - h.start;
      const p = Math.min(1, elapsed / 1500); // 1.5s hold
      setHoldEndP(p);

      if (p >= 1 && !h.done) {
        h.done = true;
        stopHoldEnd();
        enterReflect();
        return;
      }

      h.raf = requestAnimationFrame(tick);
    };

    h.raf = requestAnimationFrame(tick);
  }

  function stopHoldCancel() {
    const h = holdCancelRef.current;
    if (h.raf) cancelAnimationFrame(h.raf);
    h.raf = null;
    h.start = 0;
    h.done = false;
    setHoldCancelP(0);
  }

  function startHoldCancel() {
    const h = holdCancelRef.current;
    if (h.raf) return;

    h.start = performance.now();
    h.done = false;

    const tick = (t) => {
      const elapsed = t - h.start;
      const p = Math.min(1, elapsed / 2500); // 2.5s hold
      setHoldCancelP(p);

      if (p >= 1 && !h.done) {
        h.done = true;
        stopHoldCancel();
        cancelGym();
        return;
      }

      h.raf = requestAnimationFrame(tick);
    };

    h.raf = requestAnimationFrame(tick);
  }

  // ---------------- Overlay styles (Edge-style) ----------------
  const overlayBase = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(9, 10, 12, 0.94)",
    display: "grid",
    placeItems: "center",
    padding: 18,
    paddingTop: "calc(18px + env(safe-area-inset-top))",
    paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(18px + env(safe-area-inset-left))",
    paddingRight: "calc(18px + env(safe-area-inset-right))",
    overflow: "hidden",
  };

  const overlayCard = {
    width: "min(420px, 100%)",
    borderRadius: 18,
    background: "rgba(26,29,32,0.98)",
    border: "1px solid #2a2f34",
    boxShadow: "0 18px 70px rgba(0,0,0,0.65)",
    padding: 16,
    boxSizing: "border-box",
  };

  const titleStyle = {
    margin: 0,
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 0.2,
  };

  const quietHintStyle = {
    marginTop: 10,
    textAlign: "center",
    opacity: 0.72,
    fontSize: 13,
  };

  // ---------------- Render ----------------
  return (
    <section className="card card-gym">
      <h2 className="card-title-centered">Gym Forge</h2>

      {!gym && mode === "idle" && (
        <button className="primary gym" onClick={startGym}>
          Start Gym
        </button>
      )}

      {/* ACTIVE OVERLAY */}
      {gym && mode === "active" && (
        <div
          className="edgeRitualModalOverlay"
          style={overlayBase}
          role="dialog"
          aria-modal="true"
        >
          <div className="edgeRitualModal" style={overlayCard}>
            <h2 style={titleStyle}>Gym Forge</h2>

            <div
              style={{
                marginTop: 14,
                textAlign: "center",
                fontSize: 56,
                fontWeight: 900,
                letterSpacing: 1,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {formatElapsedMs(elapsedMs)}
            </div>

            <div style={quietHintStyle}>
              <div>
                We're tracking your active time here, we'll capture your workout
                and optional journal when you're done
              </div>

              <div style={{ marginTop: 6 }}>
                You can lock your phone, <strong>The Den</strong> will be
                ticking away in the background
              </div>

              <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                Below are some timers if you need them
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="subhead">Timers</div>
              <div className="rest-row">
                {[30, 60, 90, 120].map((s) => (
                  <button key={s} onClick={() => startTimer(s)} type="button">
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            {/* Countdown (active only) */}
            {restEndsAt && (
              <div className="rest-box" style={{ marginTop: 12 }}>
                <div>
                  Timer: <b>{restRemainingSec}s</b>
                  {restDurationSec ? (
                    <span className="muted"> / {restDurationSec}s</span>
                  ) : null}
                </div>
                <button className="danger" onClick={cancelRest} type="button">
                  Cancel
                </button>
              </div>
            )}

            {/* Preferences (optional, but handy) */}
            <div className="prefs-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className={`chip ${prefs.wolfVibe ? "chip-on" : ""}`}
                onClick={() => setPref("wolfVibe", !prefs.wolfVibe)}
              >
                Vibe
              </button>

              <button
                type="button"
                className={`chip ${prefs.wolfSound ? "chip-on" : ""}`}
                onClick={() => setPref("wolfSound", !prefs.wolfSound)}
              >
                Sound
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {/* Hold to End (1.5s) */}
              <button type="button" className="primary" onClick={enterReflect}>
                End Gym
              </button>

              {/* Hold to Cancel (2.5s) */}
              <button
                type="button"
                className="hold-cancel"
                style={{ ["--p"]: holdCancelP, opacity: 0.9 }}
                onPointerDown={startHoldCancel}
                onPointerUp={stopHoldCancel}
                onPointerCancel={stopHoldCancel}
                onPointerLeave={stopHoldCancel}
              >
                Hold to Cancel Gym
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFLECTION OVERLAY */}
      {gym && mode === "reflect" && (
        <div
          className="edgeRitualModalOverlay"
          style={overlayBase}
          role="dialog"
          aria-modal="true"
        >
          <div className="edgeRitualModal" style={overlayCard}>
            <h2 style={titleStyle}>Gym Reflection</h2>

            <div style={{ marginTop: 10, textAlign: "center", opacity: 0.72 }}>
              {formatElapsedMs(elapsedMs)}
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="subhead">Areas trained</div>
              <div className="chips">
                {AREAS.map((a) => (
                  <button
                    key={a}
                    className={`chip ${gym.areas.includes(a) ? "chip-on" : ""}`}
                    onClick={() => toggleArea(a)}
                    type="button"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="subhead">Intensity</div>
              <div className="chips">
                {INTENSITY.map((lvl) => (
                  <button
                    key={lvl}
                    className={`chip ${gym.intensity === lvl ? "chip-on" : ""}`}
                    onClick={() => setIntensity(lvl)}
                    type="button"
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="subhead">Journal (optional)</div>
              <div className="journal-bubble">
                <textarea
                  className="journal-input"
                  rows={3}
                  value={gymJournal}
                  placeholder="Optional reflection…"
                  onChange={(e) => {
                    const text = e.target.value;
                    setGymJournal(text);
                    saveGymJournal(gym.id, text);
                  }}
                />
                <div className="journal-hint">
                  {gymJournal.trim().length
                    ? `${gymJournal.trim().length} chars`
                    : "Tap to type. Saves automatically."}
                </div>
              </div>
            </div>

            <div className="journal-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="primary"
                onClick={finalizeEndGym}
              >
                Save &amp; Finish
              </button>
              <button type="button" className="cancel" onClick={backToActive}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
