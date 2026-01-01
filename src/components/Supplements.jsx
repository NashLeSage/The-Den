import { useMemo, useState } from "react";
import { localDayKey } from "../utils/dateKey";

function todayKey() {
  return localDayKey();
}

const SUPPS = [
  "5-HTP",
  "B12",
  "Creatine",
  "L-Arginine",
  "Magnesium",
  "Multi-vit",
  "Protein",
  "Shilajit",
  "Silimarin",
  "Zinc",
  "Other",
];

export default function Supplements({ store, setStore }) {
  const today = todayKey();
  const [isEditing, setIsEditing] = useState(false);

  const todaysEvents = useMemo(() => {
    return (store.events || []).filter(
      (e) => e?.day === today && e?.type === "supp_taken",
    );
  }, [store.events, today]);

  const counts = useMemo(() => {
    return todaysEvents.reduce((acc, e) => {
      const name = e?.value?.name;
      if (!name) return acc;
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
  }, [todaysEvents]);

  function logSupp(name) {
    const now = Date.now();
    setStore((prev) => ({
      ...prev,
      events: [
        ...(prev.events || []),
        {
          type: "supp_taken",
          ts: now,
          day: today,
          value: { name },
          sessionId: null,
        },
      ],
    }));
  }

  function undoLast() {
    setStore((prev) => {
      const ev = prev.events || [];
      for (let i = ev.length - 1; i >= 0; i--) {
        if (ev[i]?.type === "supp_taken" && ev[i]?.day === today) {
          return { ...prev, events: [...ev.slice(0, i), ...ev.slice(i + 1)] };
        }
      }
      return prev;
    });
  }

  return (
    <section className="card">
      <div className="mc-head">
        <h2>Supplements 💊</h2>
        <button
          type="button"
          className="chip"
          onClick={() => setIsEditing((v) => !v)}
          style={{ width: "auto" }}
        >
          {isEditing ? "Done" : "Edit"}
        </button>
      </div>

      {/* Collapsed summary */}
      {!isEditing && (
        <div className="muted">
          {todaysEvents.length
            ? `Today: ${todaysEvents.length}`
            : "No supplements logged today."}
        </div>
      )}

      {/* Expanded editor */}
      {isEditing && (
        <>
          <div className="supp-grid">
            {SUPPS.map((s) => {
              const c = counts[s] || 0;
              return (
                <button
                  key={s}
                  type="button"
                  className={`supp-tile ${counts[s] ? "supp-on" : ""}`}
                  onClick={() => logSupp(s)}
                >
                  <div className="supp-label">{s}</div>
                  <div
                    className={`supp-value ${counts[s] ? "supp-value-on" : ""}`}
                  >
                    {counts[s] || 0}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="supp-footer">
            <div className="muted">
              Today: <b>{todaysEvents.length}</b>
            </div>

            <button
              type="button"
              className="chip"
              onClick={undoLast}
              disabled={!todaysEvents.length}
              style={{ width: "auto" }}
            >
              Undo last
            </button>
          </div>
        </>
      )}
    </section>
  );
}
