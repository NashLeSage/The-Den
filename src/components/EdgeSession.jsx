// src/components/EdgeSession.jsx
import { localDayKey } from "../utils/dateKey";
import { useEffect, useMemo, useRef, useState } from "react";

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

function safeVibrate(pattern) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // no-op (Safari may ignore)
  }
}

function heartbeatHaptic5s() {
  const pulse = [120, 120, 120, 120];
  const pattern = [];
  for (let i = 0; i < 10; i++) pattern.push(...pulse);
  safeVibrate(pattern);
}

const INTENTS = [
  "Presence",
  "Release",
  "Energy",
  "Exploration",
  "No intent today",
];

const BODY_STATES = ["Settled", "Charged", "Open", "Heavy"];
const MIND_STATES = ["Quiet", "Clear", "Foggy", "Content"];

const OUTCOMES = [
  { label: "No Release", className: "success" },
  { label: "Good Release", className: "" },
  { label: "Great Release", className: "" },
  { label: "Shooter", className: "" },
  { label: "Multiple", className: "" },
  { label: "Ruined", className: "danger" },
];

export default function EdgeSession({ store, setStore }) {
  const session = store?.activeSession ?? null;

  // Modes: idle, entry, active, closing, reflect
  const [mode, setMode] = useState("idle");

  // Timer tick
  const [nowTs, setNowTs] = useState(Date.now());

  // Entry / Ritual
  const [ritualIntent, setRitualIntent] = useState(null);
  const [showLockHint, setShowLockHint] = useState(false);

  // Reflection
  const [bodyState, setBodyState] = useState("");
  const [mindState, setMindState] = useState("");
  const [outcome, setOutcome] = useState("");
  const [edgeJournal, setEdgeJournal] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  // Threshold flash
  const [thresholdFlash, setThresholdFlash] = useState(false);
  const thresholdFlashRef = useRef(null);

  // Freeze timing when user taps End (closing/reflect)
  const endFreezeTsRef = useRef(null);

  // Notes refs (scroll behavior like Gym)
  const notesRef = useRef(null);
  const reflectScrollRef = useRef(null);

  // Hold-to-cancel refs
  const holdCancelTimerRef = useRef(null);
  const holdCancelStartRef = useRef(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdArmed, setHoldArmed] = useState(false);

  // Keep mode sane across refreshes
  useEffect(() => {
    if (!session) {
      setMode("idle");
      endFreezeTsRef.current = null;

      if (thresholdFlashRef.current) clearTimeout(thresholdFlashRef.current);
      thresholdFlashRef.current = null;
      setThresholdFlash(false);

      // clear hold state
      if (holdCancelTimerRef.current) clearInterval(holdCancelTimerRef.current);
      holdCancelTimerRef.current = null;
      holdCancelStartRef.current = null;
      setHoldProgress(0);
      setHoldArmed(false);

      return;
    }

    // If session exists but UI reset, assume active unless already ended/frozen
    if (mode === "idle" || mode === "entry") {
      setMode(session.endTs ? "reflect" : "active");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Tick every second while session exists
  useEffect(() => {
    if (!session) return;

    const id = setInterval(() => {
      const freeze = endFreezeTsRef.current;
      setNowTs(freeze ?? Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [session?.id]);

  // Helpers
  function saveEdgeJournal(sessionId, text) {
    setStore((prev) => ({
      ...prev,
      journals: {
        ...(prev.journals ?? {}),
        edgeBySessionId: {
          ...((prev.journals ?? {}).edgeBySessionId ?? {}),
          [sessionId]: text,
        },
      },
    }));
  }

  function startSessionWithRitual(intentOrNull) {
    const id = uid();
    const now = Date.now();

    setBodyState("");
    setMindState("");
    setOutcome("");
    setEdgeJournal(store?.journals?.edgeBySessionId?.[id] ?? "");
    setNotesOpen(false);

    setShowLockHint(true);
    setTimeout(() => setShowLockHint(false), 13000);

    heartbeatHaptic5s();

    setStore((prev) => ({
      ...prev,
      activeSession: {
        id,
        startTs: now,

        edges: 0,
        breaks: 0,
        breakActive: false,
        breakSinceTs: null,

        activeMs: 0,
        activeSinceTs: now,
        edgeMs: 0,
        edgeSinceTs: null,

        ritual: {
          intent: intentOrNull ?? null,
          thresholdMarkers: [],
          postState: { body: "", mind: "" },
        },

        endTs: null,
      },
      events: [
        ...prev.events,
        {
          type: "edge_start",
          ts: now,
          day: todayKey(),
          value: null,
          sessionId: id,
        },
      ],
    }));
  }

  function addThresholdMarker() {
    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const now = Date.now();

      const nextSession = {
        ...s,
        edges: (s.edges ?? 0) + 1,
        edgeSinceTs: s.edgeSinceTs ?? now,
        ritual: {
          ...(s.ritual ?? {
            intent: null,
            thresholdMarkers: [],
            postState: { body: "", mind: "" },
          }),
          thresholdMarkers: [...((s.ritual ?? {}).thresholdMarkers || []), now],
        },
      };

      return {
        ...prev,
        activeSession: nextSession,
        events: [
          ...prev.events,
          {
            type: "edge_hit",
            ts: now,
            day: todayKey(),
            value: null,
            sessionId: nextSession.id,
          },
        ],
      };
    });
  }

  function thresholdWithFlash() {
    setThresholdFlash(true);
    addThresholdMarker();

    if (thresholdFlashRef.current) clearTimeout(thresholdFlashRef.current);
    thresholdFlashRef.current = setTimeout(() => {
      setThresholdFlash(false);
      thresholdFlashRef.current = null;
    }, 420);
  }

  function freezeSessionAndClose() {
    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const now = Date.now();
      endFreezeTsRef.current = now;

      let activeMs = s.activeMs ?? 0;
      if (s.activeSinceTs) activeMs += now - s.activeSinceTs;

      let edgeMs = s.edgeMs ?? 0;
      if (s.edgeSinceTs) edgeMs += now - s.edgeSinceTs;

      return {
        ...prev,
        activeSession: {
          ...s,
          endTs: now,
          activeMs,
          activeSinceTs: null,
          edgeMs,
          edgeSinceTs: null,
          breakActive: false,
          breakSinceTs: null,
        },
      };
    });

    setMode("closing");
    setTimeout(() => setMode("reflect"), 3000);
  }

  // Back from Reflection: undo freeze + keep session alive
  function resumeFromReflection() {
    endFreezeTsRef.current = null;
    setNowTs(Date.now());

    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const now = Date.now();
      return {
        ...prev,
        activeSession: {
          ...s,
          endTs: null,
          activeSinceTs: now,
        },
      };
    });

    setMode("active");
  }

  // Break: Active -> Home
  function startBreakAndGoHome() {
    if (!session) {
      setMode("idle");
      return;
    }

    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const now = Date.now();

      let activeMs = s.activeMs ?? 0;
      if (s.activeSinceTs) activeMs += now - s.activeSinceTs;

      return {
        ...prev,
        activeSession: {
          ...s,
          activeMs,
          activeSinceTs: null,
          breakActive: true,
          breakSinceTs: now,
          breaks: (s.breaks ?? 0) + 1,
        },
        events: [
          ...prev.events,
          {
            type: "edge_break_start",
            ts: now,
            day: todayKey(),
            value: null,
            sessionId: s.id,
          },
        ],
      };
    });

    setMode("idle");
  }

  // Resume: Home -> Active (logs break end if needed)
  function resumeFromHome() {
    if (!session) return;

    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const now = Date.now();

      if (!s.breakActive) {
        return {
          ...prev,
          activeSession: { ...s, activeSinceTs: s.activeSinceTs ?? now },
        };
      }

      const breakSince = s.breakSinceTs ?? now;
      const breakMs = Math.max(0, now - breakSince);

      return {
        ...prev,
        activeSession: {
          ...s,
          breakActive: false,
          breakSinceTs: null,
          activeSinceTs: now,
        },
        events: [
          ...prev.events,
          {
            type: "edge_break_end",
            ts: now,
            day: todayKey(),
            value: { breakSec: Math.round(breakMs / 1000) },
            sessionId: s.id,
          },
        ],
      };
    });

    setMode("active");
  }

  // Hold-to-cancel (1.5s)
  function clearHoldCancel() {
    if (holdCancelTimerRef.current) clearInterval(holdCancelTimerRef.current);
    holdCancelTimerRef.current = null;
    holdCancelStartRef.current = null;
    setHoldProgress(0);
    setHoldArmed(false);
  }

  function startHoldCancel() {
    if (!session) return;

    setHoldArmed(true);
    holdCancelStartRef.current = Date.now();

    if (holdCancelTimerRef.current) clearInterval(holdCancelTimerRef.current);

    holdCancelTimerRef.current = setInterval(() => {
      const start = holdCancelStartRef.current ?? Date.now();
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / 1500);
      setHoldProgress(p);

      if (p >= 1) {
        // stop the timer/progress UI first
        clearHoldCancel();

        // small confirmation buzz (if supported)
        safeVibrate([60, 50, 60]);

        // 🔥 Option A: nuke this session and ALL its logs/journal
        cancelSessionCompletely();
      }
    }, 50);
  }

  function finishAndSave() {
    if (!session) return;
    if (!bodyState || !mindState || !outcome) return;

    const sid = session.id;
    saveEdgeJournal(sid, edgeJournal);

    setStore((prev) => {
      const s = prev.activeSession;
      if (!s) return prev;

      const endTs = s.endTs ?? Date.now();
      const startTs = s.startTs ?? endTs;
      const totalMs = endTs - startTs;

      const ritual = s.ritual ?? null;
      const ritualValue = ritual
        ? {
            intent: ritual.intent ?? null,
            thresholdMarkers: ritual.thresholdMarkers ?? [],
            postState: { body: bodyState, mind: mindState },
          }
        : null;

      const activeMs = s.activeMs ?? 0;
      const edgeMs = s.edgeMs ?? 0;

      return {
        ...prev,
        activeSession: null,
        events: [
          ...prev.events,
          {
            type: "edge_end",
            ts: endTs,
            day: todayKey(),
            value: {
              outcome,
              totalSec: Math.round(totalMs / 1000),
              activeSec: Math.round(activeMs / 1000),
              edgeSec: Math.round(edgeMs / 1000),
              edgeHits: s.edges ?? 0,
              breaks: s.breaks ?? 0,
              ritual: ritualValue,
            },
            sessionId: s.id,
          },
        ],
      };
    });

    endFreezeTsRef.current = null;
    setMode("idle");
    setRitualIntent(null);
    setBodyState("");
    setMindState("");
    setOutcome("");
    setEdgeJournal("");
    setNotesOpen(false);

    if (thresholdFlashRef.current) clearTimeout(thresholdFlashRef.current);
    thresholdFlashRef.current = null;
    setThresholdFlash(false);

    clearHoldCancel();
  }

  function cancelSessionCompletely() {
    if (!session) {
      setMode("idle");
      return;
    }

    const sid = session.id;

    setStore((prev) => ({
      ...prev,

      // 🔥 remove ALL events belonging to this session
      events: (prev.events || []).filter((e) => e.sessionId !== sid),

      // 🔥 remove any journal notes for this session
      journals: {
        ...(prev.journals ?? {}),
        edgeBySessionId: Object.fromEntries(
          Object.entries(prev.journals?.edgeBySessionId ?? {}).filter(
            ([key]) => key !== sid,
          ),
        ),
      },

      // 🔥 kill the session completely
      activeSession: null,
    }));

    // local UI reset
    endFreezeTsRef.current = null;
    setMode("idle");
    setRitualIntent(null);
    setBodyState("");
    setMindState("");
    setOutcome("");
    setEdgeJournal("");
    setNotesOpen(false);
  }

  const displayNow = useMemo(() => {
    const freeze = endFreezeTsRef.current;
    return freeze ?? nowTs;
  }, [nowTs]);

  const timerText = useMemo(() => {
    if (!session) return "00:00";
    const endTs = session.endTs ?? displayNow;
    const totalMs = Math.max(0, endTs - session.startTs);
    return formatElapsedMs(totalMs);
  }, [session, displayNow]);

  // Keep intent synced from store
  useEffect(() => {
    if (!session) return;
    setRitualIntent(session.ritual?.intent ?? null);
  }, [session?.id]);

  // Load existing journal when reflect opens
  useEffect(() => {
    if (!session) return;
    if (mode !== "reflect") return;
    const existing = store?.journals?.edgeBySessionId?.[session.id] ?? "";
    setEdgeJournal(existing);

    // ensure scroll starts at top like Gym
    setTimeout(() => {
      reflectScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session?.id]);

  // When notes open, gently bring textarea into view (Gym-like)
  useEffect(() => {
    if (mode !== "reflect") return;
    if (!notesOpen) return;
    setTimeout(() => {
      notesRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 200);
  }, [notesOpen, mode]);

  // ---------- UI building blocks ----------
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
  };

  const overlayCard = {
    width: "min(420px, 100%)",
    borderRadius: 18,
    background: "rgba(26,29,32,0.98)",
    border: "1px solid #2a2f34",
    boxShadow: "0 18px 70px rgba(0,0,0,0.65)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    maxHeight:
      "calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
    overflow: "hidden",
    padding: 16,
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

  function ChipRow({ items, value, onPick }) {
    return (
      <div className="chips">
        {items.map((x) => {
          const on = value === x;
          return (
            <button
              key={x}
              type="button"
              className={`chip ${on ? "chip-on" : ""}`}
              onClick={() => onPick(on ? "" : x)}
            >
              {x}
            </button>
          );
        })}
      </div>
    );
  }

  // ---------- Main Card ----------
  return (
    <section className="card card-edge">
      <h2 className="card-title-centered">Edge Ritual</h2>

      {/* HOME */}
      {!session && mode === "idle" && (
        <button
          className="primary edge"
          onClick={() => {
            setMode("entry");
            setRitualIntent(null);
          }}
        >
          Let&apos;s Bate 👊
        </button>
      )}

      {session && mode === "idle" && (
        <button className="primary edge" onClick={resumeFromHome}>
          Resume Ritual
        </button>
      )}

      {/* ENTRY OVERLAY */}
      {mode === "entry" && !session && (
        <div style={overlayBase} role="dialog" aria-modal="true">
          <div style={overlayCard}>
            <h2 style={titleStyle}>Edge Ritual</h2>
            <div style={quietHintStyle}>This time is yours.</div>

            <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13 }}>
              Optional intent (or just tap &quot;Begin&quot;):
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="chips" style={{ justifyContent: "center" }}>
                {INTENTS.map((x) => {
                  const normalized = x === "No intent today" ? null : x;
                  const on = ritualIntent === normalized;
                  return (
                    <button
                      key={x}
                      type="button"
                      className={`chip ${on ? "chip-on" : ""}`}
                      onClick={() => setRitualIntent(on ? null : normalized)}
                    >
                      {x}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              className="primary edge"
              style={{ marginTop: 14 }}
              onClick={() => {
                startSessionWithRitual(ritualIntent);
                setMode("active");
              }}
            >
              Begin
            </button>

            <button
              type="button"
              className="cancel"
              onClick={() => setMode("idle")}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE OVERLAY */}
      {mode === "active" && session && (
        <div style={overlayBase} role="dialog" aria-modal="true">
          <div style={overlayCard}>
            <h2 style={titleStyle}>Edge Ritual</h2>

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
              {timerText}
            </div>

            <div style={quietHintStyle}>
              Tap Threshold when you reach it. Or don’t. Just enjoy.
            </div>

            {showLockHint && (
              <div
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  fontSize: 13,
                  opacity: 0.85,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                You can lock your phone now. <strong>The Den</strong> will keep
                time.
              </div>
            )}

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <button
                type="button"
                className={`threshold-btn ${thresholdFlash ? "threshold-flash" : ""}`}
                onClick={thresholdWithFlash}
              >
                Threshold
              </button>

              <button
                type="button"
                className="primary edge"
                onClick={freezeSessionAndClose}
              >
                End
              </button>

              <button
                type="button"
                className="cancel"
                onClick={startBreakAndGoHome}
              >
                Back to Home (take a break)
              </button>

              {/* ✅ Hold to Cancel (1.5s) */}
              <button
                type="button"
                className="cancel"
                onMouseDown={startHoldCancel}
                onMouseUp={clearHoldCancel}
                onMouseLeave={clearHoldCancel}
                onTouchStart={startHoldCancel}
                onTouchEnd={clearHoldCancel}
                onTouchCancel={clearHoldCancel}
                style={{
                  opacity: holdArmed ? 0.95 : 0.7,
                  borderColor: holdArmed ? "rgba(255,255,255,0.16)" : undefined,
                }}
              >
                Hold to Cancel{" "}
                {holdArmed ? `(${Math.round(holdProgress * 100)}%)` : ""}
              </button>

              {holdArmed ? (
                <div
                  className="muted"
                  style={{ textAlign: "center", fontSize: 12, opacity: 0.7 }}
                >
                  Keep holding to cancel this session (nothing will be saved).
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* CLOSING SCREEN */}
      {mode === "closing" && session && (
        <div style={overlayBase} role="dialog" aria-modal="true">
          <div
            style={{
              ...overlayCard,
              background: "rgba(10,12,14,0.96)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                textAlign: "center",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 0.3,
                opacity: 0.88,
                padding: "34px 10px",
              }}
            >
              Take a breath.
            </div>
          </div>
        </div>
      )}

      {/* REFLECTION OVERLAY (Gym-like: scroll to buttons, no fixed footer) */}
      {mode === "reflect" && session && (
        <div style={overlayBase} role="dialog" aria-modal="true">
          <div style={overlayCard}>
            <h2 style={titleStyle}>Reflection</h2>

            <div style={{ marginTop: 10, textAlign: "center", opacity: 0.72 }}>
              {timerText}
            </div>

            {/* Single scroll area, like Gym */}
            <div
              ref={reflectScrollRef}
              style={{
                marginTop: 12,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                paddingBottom: 24,
              }}
            >
              <div style={{ marginTop: 4 }}>
                <div className="subhead">Body state</div>
                <ChipRow
                  items={BODY_STATES}
                  value={bodyState}
                  onPick={setBodyState}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="subhead">Mind state</div>
                <ChipRow
                  items={MIND_STATES}
                  value={mindState}
                  onPick={setMindState}
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="subhead">Outcome</div>
                <div className="end-row">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      className={o.className}
                      onClick={() => setOutcome(o.label)}
                      style={
                        outcome === o.label
                          ? {
                              outline: "2px solid rgba(59,92,255,0.55)",
                              outlineOffset: 2,
                            }
                          : undefined
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setNotesOpen((v) => !v)}
                  style={{ width: "auto" }}
                >
                  {notesOpen ? "Hide Notes" : "Add Notes (optional)"}
                </button>

                {notesOpen && (
                  <div className="journal-bubble" style={{ marginTop: 10 }}>
                    <textarea
                      ref={notesRef}
                      className="journal-input"
                      rows={5}
                      value={edgeJournal}
                      placeholder="Optional reflection…"
                      onChange={(e) => setEdgeJournal(e.target.value)}
                    />
                    <div className="journal-hint">
                      {edgeJournal.trim().length
                        ? `${edgeJournal.trim().length} chars`
                        : "Tap to type. Saves when you finish."}
                    </div>
                  </div>
                )}
              </div>

              {/* Buttons are part of scroll (Gym-like) */}
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <button
                  type="button"
                  className="primary edge"
                  disabled={!bodyState || !mindState || !outcome}
                  onClick={finishAndSave}
                >
                  Save & Finish
                </button>

                <button
                  type="button"
                  className="cancel"
                  onClick={resumeFromReflection}
                >
                  Back
                </button>
              </div>

              {/* Spacer so buttons can sit above keyboard a bit */}
              <div style={{ height: 24 }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
